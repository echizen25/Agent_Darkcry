import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, readdir, lstat, realpath, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

const fail = (code, message, status = 400) => Object.assign(new Error(message), { code, status });
const secret = /(^|\/)(\.env(?:\..*)?|credentials?[^/]*|secrets?[^/]*|id_rsa|id_ed25519|docker-config\.json|\.ssh|\.aws|\.azure|\.docker|gcloud)(\/|$)/i;
const binary = /\.(exe|dll|zip|7z|png|jpe?g|gif|webp|pdf|pptx|xlsx|docx|db|sqlite|bin|model)$/i;
const sha = value => createHash('sha256').update(value).digest('hex');
const rel = value => String(value || '').replace(/\\/g, '/');
const comparable = value => process.platform === 'win32' ? value.toLowerCase() : value;
const within = (root, target) => comparable(target) === comparable(root) || comparable(target).startsWith(comparable(root) + path.sep);

export class WorkspaceRegistry {
  constructor({ snapshotRoot = path.join(process.cwd(), 'data', 'development-snapshots'), maxReadBytes = 200000 } = {}) { this.workspaces = new Map(); this.snapshots = new Map(); this.snapshotRoot = snapshotRoot; this.maxReadBytes = maxReadBytes; }
  async register({ projectId, root, allowedPaths = ['.'], deniedPaths = [], testCommands = [] }) {
    if (!projectId || typeof root !== 'string' || !path.isAbsolute(root)) throw fail('WORKSPACE_INVALID', 'Workspace requires an absolute root.');
    if (![allowedPaths, deniedPaths].every(items => Array.isArray(items) && items.every(item => typeof item === 'string' && item && !path.isAbsolute(item) && !rel(item).split('/').includes('..') && !/^[a-zA-Z]:/.test(item)))) throw fail('WORKSPACE_INVALID', 'Workspace path policy is invalid.');
    const canonicalRoot = await realpath(root).catch(() => { throw fail('WORKSPACE_NOT_FOUND', 'Workspace root was not found.', 404); });
    const item = { workspaceId: randomUUID(), projectId, canonicalRoot, allowedPaths: allowedPaths.map(rel), deniedPaths: deniedPaths.map(rel), testCommands, createdAt: new Date().toISOString(), status: 'ACTIVE' };
    this.workspaces.set(item.workspaceId, item); return { ...item };
  }
  get(id) { const item = this.workspaces.get(id); if (!item) throw fail('WORKSPACE_NOT_FOUND', 'Workspace was not found.', 404); return item; }
  isDenied(value) { return secret.test(rel(value)) || binary.test(rel(value)); }
  validatePath(workspace, value) {
    const safe = rel(value);
    if (!safe || safe.startsWith('/') || /^[a-zA-Z]:/.test(safe) || safe.includes('\0') || safe.split('/').includes('..')) throw fail('PATH_OUTSIDE_WORKSPACE', 'Path is outside the workspace.');
    if (this.isDenied(safe) || workspace.deniedPaths.some(item => safe === item || safe.startsWith(item.replace(/\/$/, '') + '/'))) throw fail(binary.test(safe) ? 'BINARY_FILE_DENIED' : 'PATH_DENIED', 'Path is denied.');
    if (!workspace.allowedPaths.some(item => item === '.' || safe === item || safe.startsWith(item.replace(/\/$/, '') + '/'))) throw fail('PATH_DENIED', 'Path is outside allowed paths.');
    return safe;
  }
  async resolve(workspaceId, value, { existing = false } = {}) {
    const workspace = this.get(workspaceId), safe = this.validatePath(workspace, value), target = path.resolve(workspace.canonicalRoot, safe);
    if (!within(workspace.canonicalRoot, target)) throw fail('PATH_OUTSIDE_WORKSPACE', 'Path is outside the workspace.');
    let ancestor = path.dirname(target); while (ancestor !== path.dirname(ancestor) && !await lstat(ancestor).then(() => true).catch(() => false)) ancestor = path.dirname(ancestor);
    const canonicalAncestor = await realpath(ancestor); if (!within(workspace.canonicalRoot, canonicalAncestor)) throw fail('PATH_OUTSIDE_WORKSPACE', 'Path escapes through a link.');
    if (existing) { const canonical = await realpath(target).catch(() => { throw fail('FILE_NOT_FOUND', 'File was not found.', 404); }); if (!within(workspace.canonicalRoot, canonical)) throw fail('PATH_OUTSIDE_WORKSPACE', 'Path escapes through a link.'); return canonical; }
    return target;
  }
  async read({ workspaceId, relativePath, startLine = 1, endLine = null }) {
    const target = await this.resolve(workspaceId, relativePath, { existing: true }), info = await lstat(target); if (!info.isFile()) throw fail('PATH_DENIED', 'Path is not a file.'); if (info.size > this.maxReadBytes) throw fail('FILE_TOO_LARGE', 'File exceeds the read limit.');
    const text = await readFile(target, 'utf8'); if (text.includes('\0')) throw fail('BINARY_FILE_DENIED', 'Binary file is denied.'); const lines = text.split(/\r?\n/), last = endLine == null ? Math.min(lines.length, startLine + 399) : Math.min(lines.length, endLine);
    if (!Number.isInteger(startLine) || startLine < 1 || !Number.isInteger(last) || last < startLine) throw fail('INVALID_INPUT', 'Invalid line range.'); return { relativePath: rel(relativePath), text: lines.slice(startLine - 1, last).join('\n'), startLine, endLine: last, totalLines: lines.length, truncated: last < lines.length };
  }
  async list({ workspaceId, relativePath = '.', limit = 200 }) {
    const workspace = this.get(workspaceId), base = relativePath === '.' ? workspace.canonicalRoot : await this.resolve(workspaceId, relativePath, { existing: true }), entries = await readdir(base, { withFileTypes: true }), cap = Math.min(limit, 200);
    return { relativePath, entries: entries.slice(0, cap).filter(item => !this.isDenied(rel(path.join(relativePath, item.name)))).map(item => ({ name: item.name, type: item.isDirectory() ? 'directory' : item.isFile() ? 'file' : 'link' })), truncated: entries.length > cap };
  }
  async search({ workspaceId, query, maxResults = 50, contextLines = 1 }) {
    if (typeof query !== 'string' || !query || query.length > 200) throw fail('INVALID_INPUT', 'Invalid search query.'); const workspace = this.get(workspaceId), results = [];
    const visit = async (dir, prefix = '', depth = 0) => { if (depth > 8 || results.length >= maxResults) return; for (const entry of await readdir(dir, { withFileTypes: true })) { const relativePath = rel(path.join(prefix, entry.name)); if (this.isDenied(relativePath) || workspace.deniedPaths.some(item => relativePath === item || relativePath.startsWith(item + '/')) || entry.isSymbolicLink()) continue; const target = path.join(dir, entry.name); if (entry.isDirectory()) await visit(target, relativePath, depth + 1); else if (entry.isFile()) { const info = await lstat(target); if (info.size > this.maxReadBytes) continue; const text = await readFile(target, 'utf8').catch(() => ''); if (text.includes('\0')) continue; const lines = text.split(/\r?\n/); lines.forEach((line, index) => { if (results.length < maxResults && line.toLowerCase().includes(query.toLowerCase())) results.push({ relativePath, line: index + 1, context: lines.slice(Math.max(0, index - contextLines), index + contextLines + 1).join('\n') }); }); } } };
    await visit(workspace.canonicalRoot); return { query, results, truncated: results.length >= maxResults };
  }
  async currentHash(workspaceId, relativePath) { return sha(await readFile(await this.resolve(workspaceId, relativePath, { existing: true }))); }
  async apply({ workspaceId, proposal, patchFingerprint, expectedFingerprint, allowCreateFiles, allowDeleteFiles, simulateFailureAfter = null }) {
    if (patchFingerprint !== expectedFingerprint) throw fail('APPROVAL_MISMATCH', 'Approved patch fingerprint does not match.', 409); const prepared = [], originals = [];
    for (const file of proposal.files) { const target = await this.resolve(workspaceId, file.path, { existing: file.operation !== 'CREATE' }), exists = await lstat(target).then(() => true).catch(() => false); if (file.operation === 'CREATE' && (!allowCreateFiles || exists)) throw fail('PATCH_INVALID', 'CREATE target is not available.'); if (file.operation === 'DELETE' && !allowDeleteFiles) throw fail('DELETE_NOT_ALLOWED', 'File deletion is not allowed.'); const old = exists ? await readFile(target) : null; if (exists && file.baseHash !== sha(old)) throw fail('STALE_PATCH', 'A target file changed after proposal.', 409); prepared.push({ file, target }); originals.push({ path: file.path, existed: exists, content: old?.toString('base64') || null, hash: old ? sha(old) : null }); }
    await mkdir(this.snapshotRoot, { recursive: true }); const snapshotId = randomUUID(), snapshot = { snapshotId, workspaceId, createdAt: new Date().toISOString(), files: originals, applied: false }; await writeFile(path.join(this.snapshotRoot, `${snapshotId}.json`), JSON.stringify(snapshot)); this.snapshots.set(snapshotId, snapshot);
    try { for (let index = 0; index < prepared.length; index++) { const { file, target } = prepared[index]; if (file.operation === 'DELETE') await rm(target); else { await mkdir(path.dirname(target), { recursive: true }); const temp = `${target}.darkcry-${randomUUID()}.tmp`; await writeFile(temp, file.content, 'utf8'); await rename(temp, target); } if (simulateFailureAfter === index + 1) throw fail('PATCH_APPLY_FAILED', 'Simulated controlled apply failure.', 500); } snapshot.applied = true; await writeFile(path.join(this.snapshotRoot, `${snapshotId}.json`), JSON.stringify(snapshot)); return { snapshotId, filesChanged: prepared.length }; }
    catch (cause) { try { await this.restore(snapshot); } catch { throw fail('ROLLBACK_FAILED', 'Patch failed and rollback also failed.', 500); } throw cause.code ? cause : fail('PATCH_APPLY_FAILED', 'Patch application failed.', 500); }
  }
  async restore(snapshotOrId) { const snapshot = typeof snapshotOrId === 'string' ? this.snapshots.get(snapshotOrId) : snapshotOrId; if (!snapshot) throw fail('WORKSPACE_NOT_FOUND', 'Snapshot was not found.', 404); for (const item of [...snapshot.files].reverse()) { const target = await this.resolve(snapshot.workspaceId, item.path); if (item.existed) { await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, Buffer.from(item.content, 'base64')); } else await rm(target, { force: true }); } return { snapshotId: snapshot.snapshotId, restored: true }; }
}
export const contentHash = value => sha(Buffer.isBuffer(value) ? value : String(value));
