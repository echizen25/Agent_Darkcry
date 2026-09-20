import { readFile } from 'node:fs/promises';
import path from 'node:path';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const unsafeName = /(?:^|[._ -])(?:\.env|credential|credentials|secret|password|private.?key)(?:[._ -]|$)|\.(?:pem|key|p12|pfx|crt|cer)$/i;
const excludedDirs = new Set(['.git', 'node_modules', 'bin', 'obj', 'dist', 'build', 'coverage', 'vendor', '.next', '.nuxt', 'target', '__pycache__', '.venv', 'venv', 'generated']);
const bad = (status, message) => Object.assign(new Error(message), { status });
const load = async filename => { try { return JSON.parse(await readFile(filename, 'utf8')); } catch (cause) { if (cause.code === 'ENOENT') throw bad(404, 'Source not found.'); throw cause; } };
const document = ({ documentId, projectId, sourceId, sourceType, title, text, metadata = {}, provenance = {}, createdAt }) => ({ documentId, projectId, sourceId, sourceType, title, text, metadata, provenance, createdAt });

export async function documentsFromSource(root, projectId, sourceId) {
  if (!uuid.test(sourceId)) throw bad(400, 'Invalid source ID.');
  const source = await load(path.join(root, 'data', 'sources', `${sourceId}.json`));
  if (source.id !== sourceId || source.extractionStatus !== 'ready' || unsafeName.test(source.originalName)) throw bad(400, 'Source is not eligible for indexing.');
  const common = { projectId, sourceId, sourceType: source.type === 'notes' ? 'NOTES' : 'DOCUMENT', title: source.originalName, createdAt: source.uploadedAt };
  const units = source.metadata?.pages?.map(item => ({ key: `page:${item.page}`, text: item.text, provenance: { page: item.page } }))
    || source.metadata?.slides?.map(item => ({ key: `slide:${item.slide}`, text: item.text, provenance: { slide: item.slide } }))
    || source.metadata?.sheets?.map(item => ({ key: `sheet:${item.name}`, text: item.rows.map(row => row.join('\t')).join('\n'), provenance: { sheet: item.name } }))
    || [{ key: 'text', text: source.content, provenance: {} }];
  return units.filter(item => item.text?.trim()).map(item => document({ ...common, documentId: `${sourceId}:${item.key}`, text: item.text, provenance: { sourceId, filename: source.originalName, ...item.provenance } }));
}

export async function documentsFromRepository(root, projectId, repositoryId) {
  if (!uuid.test(repositoryId)) throw bad(400, 'Invalid repository ID.');
  const base = path.join(root, 'data', 'repository-sources');
  const record = await load(path.join(base, `${repositoryId}.json`));
  if (record.id !== repositoryId || record.analysisStatus !== 'ready') throw bad(400, 'Repository is not ready.');
  const result = [];
  for (const file of record.files) {
    if (!/^[0-9a-f]{32}$/.test(file.id) || typeof file.path !== 'string' || unsafeName.test(path.posix.basename(file.path)) || file.path.split('/').some(part => excludedDirs.has(part.toLowerCase()))) continue;
    const stored = await load(path.join(base, repositoryId, `${file.id}.json`));
    if (stored.id !== file.id || stored.path !== file.path || typeof stored.content !== 'string' || !stored.content.trim() || stored.content.includes('\0')) continue;
    result.push(document({ documentId: `${repositoryId}:${file.id}`, projectId, sourceId: repositoryId, sourceType: 'REPOSITORY_FILE', title: file.path, text: stored.content, metadata: { language: file.language, extension: file.extension }, provenance: { sourceId: repositoryId, repositoryId, repositoryName: record.name, branch: record.branch, commit: record.commit, relativePath: file.path }, createdAt: record.analyzedAt }));
  }
  return result;
}
