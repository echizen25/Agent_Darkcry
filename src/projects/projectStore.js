import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const empty = () => ({ schemaVersion: 1, projects: [], missions: [], runs: [], activity: [], documentArtifacts: [], presentationArtifacts: [] });
const fail = (code, message, status = 500) => Object.assign(new Error(message), { code, status });
const validState = value => value?.schemaVersion === 1 && ['projects', 'missions', 'runs', 'activity'].every(key => Array.isArray(value[key]));

export class ProjectStore {
  constructor({ file, maxBytes = 2_000_000 } = {}) { this.file = file; this.maxBytes = maxBytes; this.state = empty(); this.recoveryError = null; }
  async load() {
    await mkdir(path.dirname(this.file), { recursive: true });
    let text;
    try { const info = await stat(this.file); if (info.size > this.maxBytes) throw fail('PERSISTENCE_TOO_LARGE', 'Project metadata exceeds its size limit.'); text = await readFile(this.file, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return this.state; throw error; }
    try { const parsed = JSON.parse(text); if (!validState(parsed)) throw new Error('schema'); parsed.documentArtifacts ||= []; parsed.presentationArtifacts ||= []; if (!Array.isArray(parsed.documentArtifacts) || !Array.isArray(parsed.presentationArtifacts)) throw new Error('schema'); this.state = parsed; this.recoveryError = null; }
    catch { this.state = empty(); this.recoveryError = { code: 'PERSISTENCE_CORRUPT', message: 'Project metadata is malformed and was preserved for recovery.' }; }
    return this.state;
  }
  async save() {
    if (this.recoveryError) throw fail(this.recoveryError.code, this.recoveryError.message, 503);
    const text = JSON.stringify(this.state, null, 2); if (Buffer.byteLength(text) > this.maxBytes) throw fail('PERSISTENCE_TOO_LARGE', 'Project metadata exceeds its size limit.');
    await mkdir(path.dirname(this.file), { recursive: true }); const temp = `${this.file}.${process.pid}.tmp`; await writeFile(temp, text, { encoding: 'utf8', flag: 'w' }); await rename(temp, this.file);
  }
}
