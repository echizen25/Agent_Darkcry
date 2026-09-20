import { Router } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { spawn } from 'node:child_process';
import { lstat, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import path from 'node:path';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const branchPattern = /^(?![-/.])(?!.*(?:\.\.|@\{|\/\.|\.lock(?:\/|$)))[A-Za-z0-9._/-]{1,120}$/;
const ignoredDirs = new Set(['.git', 'node_modules', 'bin', 'obj', 'dist', 'build', 'coverage', 'vendor', '.next', '.nuxt', 'target', '__pycache__', '.venv', 'venv', 'generated']);
const ignoredFiles = /^(?:\.env(?:\..*)?|.*(?:credential|secret|password|private.?key).*|id_(?:rsa|ed25519|ecdsa)(?:\.pub)?|.*\.(?:pem|key|p12|pfx|cer|crt|jks|keystore|lock)|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock|poetry\.lock)$/i;
const languages = { js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript', cs: 'C#', csproj: 'C# project', java: 'Java', py: 'Python', asp: 'Classic ASP', asa: 'Classic ASP', vbs: 'VBScript', vb: 'Visual Basic', sql: 'SQL', html: 'HTML', htm: 'HTML', css: 'CSS', scss: 'SCSS', json: 'JSON', xml: 'XML', md: 'Markdown', markdown: 'Markdown', txt: 'Text', yml: 'YAML', yaml: 'YAML', toml: 'TOML', ini: 'Configuration', config: 'Configuration', properties: 'Configuration', sh: 'Shell', ps1: 'PowerShell', php: 'PHP', go: 'Go', rs: 'Rust', rb: 'Ruby', fs: 'F#', fsproj: 'F# project', sln: 'Solution', gradle: 'Gradle', graphql: 'GraphQL', proto: 'Protobuf' };
const knownNames = new Set(['readme', 'dockerfile', 'makefile', 'package.json', 'tsconfig.json', 'web.config', 'app.config', 'requirements.txt', 'pyproject.toml', 'pom.xml', 'build.gradle', 'settings.gradle', 'go.mod', 'cargo.toml', 'gemfile', '.gitignore', '.editorconfig']);
const fileLimit = 500;
const byteLimit = 1024 * 1024;
const totalLimit = 20 * 1024 * 1024;
const hash = value => createHash('sha256').update(value).digest('hex');
const httpError = (status, message) => Object.assign(new Error(message), { status });
const removeInside = async (base, target) => {
  const resolvedBase = path.resolve(base);
  const resolvedTarget = path.resolve(target);
  if (!resolvedTarget.startsWith(resolvedBase + path.sep)) throw httpError(500, 'Unsafe repository storage path.');
  await rm(resolvedTarget, { recursive: true, force: true });
};

function git(args, cwd, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-c', `safe.directory=${cwd}`, ...args], { cwd, shell: false, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' } });
    const stdout = []; const stderr = [];
    let size = 0;
    const timer = setTimeout(() => child.kill(), timeout);
    child.stdout.on('data', chunk => { size += chunk.length; if (size > 10 * 1024 * 1024) child.kill(); else stdout.push(chunk); });
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(stdout));
      else reject(httpError(400, `Git operation failed: ${Buffer.concat(stderr).toString('utf8').trim().slice(0, 300) || 'command failed or timed out'}`));
    });
  });
}

function privateAddress(address) {
  if (address.includes(':')) return !/^[23][0-9a-f]{3}:/i.test(address);
  const [a, b] = address.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || b === 2)) || (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0);
}
async function validateLocation(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 1000) throw httpError(400, 'Enter a repository URL or local path.');
  const location = value.trim();
  if (!/^https?:\/\//i.test(location)) {
    const root = await realpath(location).catch(() => { throw httpError(400, 'Local repository path does not exist.'); });
    if (!(await stat(root)).isDirectory()) throw httpError(400, 'Local repository path must be a directory.');
    const top = (await git(['rev-parse', '--show-toplevel'], root)).toString().trim();
    if (path.resolve(top).toLowerCase() !== path.resolve(root).toLowerCase()) throw httpError(400, 'Select the repository root directory.');
    return { kind: 'local', identity: root, root };
  }
  let url;
  try { url = new URL(location); } catch { throw httpError(400, 'Invalid repository URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || !url.hostname.includes('.') || isIP(url.hostname) || url.hostname.endsWith('.local')) throw httpError(400, 'Use a public HTTPS Git URL without credentials, query parameters, or a custom port.');
  const addresses = await lookup(url.hostname, { all: true }).catch(() => { throw httpError(400, 'Repository host could not be resolved.'); });
  if (!addresses.length || addresses.some(item => privateAddress(item.address))) throw httpError(400, 'Repository host must resolve to public addresses.');
  url.hash = ''; url.search = '';
  return { kind: 'remote', identity: url.href, root: null };
}

function eligible(relative) {
  const parts = relative.replace(/\\/g, '/').split('/');
  const name = parts.at(-1);
  const ext = path.extname(name).slice(1).toLowerCase();
  if (parts.some(part => ignoredDirs.has(part.toLowerCase())) || ignoredFiles.test(name)) return false;
  return Boolean(languages[ext] || knownNames.has(name.toLowerCase()) || /^readme(?:\.|$)/i.test(name));
}
function typeOf(relative) {
  const name = path.basename(relative).toLowerCase();
  const extension = path.extname(name).slice(1).toLowerCase();
  return { extension, language: languages[extension] || (name.startsWith('readme') ? 'Documentation' : 'Configuration') };
}
function summaryOf(files) {
  const paths = files.map(file => file.path);
  const folders = [...new Set(paths.map(p => path.posix.dirname(p)).filter(p => p !== '.'))].sort().slice(0, 100);
  const manifests = paths.filter(p => /(?:^|\/)(?:package\.json|.*\.csproj|.*\.fsproj|.*\.sln|pom\.xml|build\.gradle|pyproject\.toml|requirements\.txt|go\.mod|cargo\.toml|gemfile)$/i.test(p));
  return {
    folders,
    readme: paths.find(p => /(?:^|\/)readme(?:\.[^/]*)?$/i.test(p)) || null,
    manifests,
    routeFiles: paths.filter(p => /(?:^|\/)(?:routes?|controllers?|api)(?:\/|\.)/i.test(p) || /(?:route|controller|api)\.[^/]+$/i.test(p)),
    databaseFiles: paths.filter(p => /(?:^|\/)(?:migrations?|schemas?|database|db)(?:\/|\.)/i.test(p) || /\.sql$/i.test(p)),
    configFiles: paths.filter(p => /(?:^|\/)(?:config|configuration)(?:\/|\.)/i.test(p) || /(?:\.config|\.ya?ml|\.toml|\.ini|\.properties)$/i.test(p))
  };
}

async function scan(root, filesDir) {
  const names = (await git(['ls-files', '-co', '--exclude-standard', '-z'], root)).toString('utf8').split('\0').filter(eligible).sort((a, b) => {
    const priority = name => /(?:^|\/)readme/i.test(name) ? 0 : /(?:^|\/)(?:docs?|src|app|routes?|controllers?|services?|models?|migrations?|schemas?)\//i.test(name) ? 1 : 2;
    return priority(a) - priority(b) || a.localeCompare(b);
  });
  const files = []; let total = 0;
  await mkdir(filesDir, { recursive: true });
  for (const relative of names) {
    if (files.length >= fileLimit) break;
    const full = path.resolve(root, relative);
    if (!full.startsWith(root + path.sep)) continue;
    const info = await lstat(full).catch(() => null);
    if (!info?.isFile() || info.size > byteLimit || total + info.size > totalLimit) continue;
    const buffer = await readFile(full);
    if (buffer.includes(0)) continue;
    const content = buffer.toString('utf8');
    if (content.includes('\uFFFD')) continue;
    const normalized = relative.replace(/\\/g, '/');
    const id = hash(normalized).slice(0, 32);
    const record = { id, path: normalized, ...typeOf(normalized), size: info.size, content };
    await writeFile(path.join(filesDir, `${id}.json`), JSON.stringify(record));
    const { content: _content, ...metadata } = record;
    files.push(metadata);
    total += info.size;
  }
  return { files, totalBytes: total, truncated: names.length > files.length, languages: [...new Set(files.map(file => file.language))].sort(), summary: summaryOf(files) };
}

export function repositoryRouter(projectRoot) {
  const data = path.join(projectRoot, 'data');
  const clones = path.join(data, 'repositories');
  const records = path.join(data, 'repository-sources');
  const router = Router();
  const dirs = () => Promise.all([mkdir(clones, { recursive: true }), mkdir(records, { recursive: true })]);
  const recordPath = id => path.join(records, `${id}.json`);
  const fileDir = id => path.join(records, id);
  const readRecord = async id => JSON.parse(await readFile(recordPath(id), 'utf8'));
  const sendError = (error, next) => error.status ? next(error) : next(httpError(500, error.message));

  router.post('/', async (req, res, next) => {
    try {
      const branch = req.body?.branch?.trim() || 'main';
      if (!branchPattern.test(branch)) throw httpError(400, 'Invalid branch name.');
      const location = await validateLocation(req.body?.location);
      await dirs();
      const existing = await Promise.all((await readdir(records)).filter(name => uuid.test(name.slice(0, -5)) && name.endsWith('.json')).map(async name => readRecord(name.slice(0, -5))));
      let record = existing.find(item => item.identity === location.identity && item.branch === branch);
      const id = record?.id || randomUUID();
      let root = location.root;
      if (location.kind === 'remote') {
        root = path.join(clones, hash(`${location.identity}\n${branch}`).slice(0, 32));
        const exists = await stat(root).then(s => s.isDirectory()).catch(() => false);
        if (!exists) {
          try {
            await git(['clone', '--depth', '1', '--filter=blob:none', '--no-checkout', '--single-branch', '--branch', branch, '--', location.identity, root], projectRoot);
            await git(['sparse-checkout', 'set', '--no-cone', '/*', ...[...ignoredDirs].filter(name => name !== '.git').map(name => `!/**/${name}/**`)], root);
            await git(['checkout', branch], root);
          } catch (error) { await removeInside(clones, root); throw error; }
        } else {
          if (!(await lstat(root)).isDirectory() || !(await realpath(root)).startsWith(path.resolve(clones) + path.sep)) throw httpError(400, 'Managed clone path is invalid.');
          await git(['fetch', '--depth', '1', 'origin', branch], root);
          await git(['checkout', '-B', branch, 'FETCH_HEAD'], root);
        }
      } else {
        const current = (await git(['branch', '--show-current'], root)).toString().trim();
        if (current !== branch) throw httpError(400, `Local repository is on branch ${current || '(detached)'}. Select that branch without changing the local checkout.`);
      }
      if (location.kind === 'remote') {
        const sizes = (await git(['count-objects', '-v'], root)).toString();
        const kib = Number(sizes.match(/^size:\s*(\d+)/m)?.[1] || 0) + Number(sizes.match(/^size-pack:\s*(\d+)/m)?.[1] || 0);
        if (kib > 100 * 1024) throw httpError(400, 'Repository Git data exceeds the 100 MB limit.');
      }
      const commit = (await git(['rev-parse', 'HEAD'], root)).toString().trim();
      const stage = path.join(records, `${id}-stage`);
      await removeInside(records, stage);
      const analyzed = await scan(root, stage);
      const previous = fileDir(id);
      await removeInside(records, previous);
      await mkdir(previous, { recursive: true });
      for (const filename of await readdir(stage)) await writeFile(path.join(previous, filename), await readFile(path.join(stage, filename)));
      await removeInside(records, stage);
      const name = location.kind === 'remote' ? path.posix.basename(new URL(location.identity).pathname).replace(/\.git$/i, '') : path.basename(root);
      record = { id, identity: location.identity, kind: location.kind, name, branch, commit, fileCount: analyzed.files.length, languages: analyzed.languages, analysisStatus: 'ready', analyzedAt: new Date().toISOString(), totalBytes: analyzed.totalBytes, truncated: analyzed.truncated, summary: analyzed.summary, files: analyzed.files };
      await writeFile(recordPath(id), JSON.stringify(record, null, 2));
      const { files, ...overview } = record;
      res.status(existing.some(item => item.id === id) ? 200 : 201).json(overview);
    } catch (error) { sendError(error, next); }
  });
  router.get('/', async (_req, res, next) => {
    try {
      await dirs();
      const names = (await readdir(records)).filter(name => name.endsWith('.json') && uuid.test(name.slice(0, -5)));
      const repositories = await Promise.all(names.map(async name => { const { files, ...overview } = await readRecord(name.slice(0, -5)); return overview; }));
      res.json({ repositories: repositories.sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt)) });
    } catch (error) { next(error); }
  });
  router.get('/:id/files', async (req, res, next) => {
    if (!uuid.test(req.params.id)) return res.sendStatus(400);
    try {
      const record = await readRecord(req.params.id);
      const query = String(req.query.q || '').toLowerCase().slice(0, 100);
      res.json({ files: record.files.filter(file => file.path.toLowerCase().includes(query)) });
    } catch (error) { if (error.code === 'ENOENT') return res.sendStatus(404); next(error); }
  });
  router.get('/:id/files/:fileId', async (req, res, next) => {
    if (!uuid.test(req.params.id) || !/^[0-9a-f]{32}$/.test(req.params.fileId)) return res.sendStatus(400);
    try {
      const record = await readRecord(req.params.id);
      if (!record.files.some(file => file.id === req.params.fileId)) return res.sendStatus(404);
      res.json(JSON.parse(await readFile(path.join(fileDir(req.params.id), `${req.params.fileId}.json`), 'utf8')));
    } catch (error) { if (error.code === 'ENOENT') return res.sendStatus(404); next(error); }
  });
  router.delete('/:id', async (req, res, next) => {
    if (!uuid.test(req.params.id)) return res.sendStatus(400);
    try {
      const record = await readRecord(req.params.id);
      await rm(recordPath(req.params.id));
      await removeInside(records, fileDir(req.params.id));
      if (record.kind === 'remote') {
        const target = path.resolve(clones, hash(`${record.identity}\n${record.branch}`).slice(0, 32));
        await removeInside(clones, target);
      }
      res.sendStatus(204);
    } catch (error) { if (error.code === 'ENOENT') return res.sendStatus(404); next(error); }
  });
  return router;
}
