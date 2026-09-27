import path from 'node:path';

const extensions = { js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', cs: 'csharp', java: 'java', asp: 'asp', vbs: 'vbscript', sql: 'sql', html: 'html', htm: 'html', css: 'css', json: 'json', xml: 'xml', md: 'markdown' };
const ignoredDirectories = new Set(['.git', 'node_modules', 'data', 'dist', 'build', 'generated', '.snapshots', 'coverage']);
const token = value => String(value || '').match(/[A-Za-z_$][\w$]*/g) || [];
const bounded = (value, low, high, fallback) => Number.isInteger(value) ? Math.max(low, Math.min(high, value)) : fallback;
const definition = [
  /\b(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|enum|const|let|var)\s+([A-Za-z_$][\w$]*)/g,
  /\b(?:public|private|protected|internal|static|async|virtual|override|final)\s+(?:[\w<>,?\[\]]+\s+)+([A-Za-z_]\w*)\s*\(/g,
  /\b(?:public|private|protected|static)?\s*(?:class|interface|enum|void|int|string|boolean|bool)\s+([A-Za-z_]\w*)\b/g,
  /\b(?:Function|Sub|Class)\s+([A-Za-z_]\w*)/gi,
  /\b(?:CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE|TABLE|VIEW))\s+([\w.]+)/gi,
  /\b(?:id|class|name)\s*=\s*["']([^"']+)["']/gi,
  /([.#][\w-]+)\s*\{/g,
  /"([^"\n]+)"\s*:/g,
  /<([A-Za-z][\w:-]*)\b/g,
  /^(#{1,6})\s+(.+)$/gm
];
const kindFor = line => /\bclass\b/i.test(line) ? 'class' : /\b(?:Function|Sub|function|procedure)\b/i.test(line) ? 'function' : /\b(?:CREATE\s+TABLE|interface|enum)\b/i.test(line) ? 'type' : 'symbol';

export class CodeIntelligenceService {
  constructor({ workspaces, maxFiles = 500, maxSymbols = 3000 } = {}) { this.workspaces = workspaces; this.maxFiles = maxFiles; this.maxSymbols = maxSymbols; this.cache = new Map(); }
  async files(workspaceId) {
    const workspace = this.workspaces.get(workspaceId), found = [];
    const walk = async (prefix, depth) => {
      if (depth > 8 || found.length >= this.maxFiles) return;
      let entries; try { entries = (await this.workspaces.list({ workspaceId, relativePath: prefix, limit: 200 })).entries; } catch { return; }
      for (const entry of entries) {
        if (found.length >= this.maxFiles) break;
        const relativePath = prefix === '.' ? entry.name : `${prefix}/${entry.name}`;
        try { this.workspaces.validatePath(workspace, relativePath); } catch { continue; }
        if (entry.type === 'directory' && !ignoredDirectories.has(entry.name.toLowerCase())) await walk(relativePath, depth + 1);
        else if (entry.type === 'file' && extensions[path.extname(entry.name).slice(1).toLowerCase()]) {
          try { this.workspaces.validatePath(workspace, relativePath); found.push(relativePath); } catch { /* denied path */ }
        }
      }
    };
    await walk('.', 0); return found;
  }
  async index(workspaceId) {
    const files = await this.files(workspaceId), symbols = [], imports = [];
    for (const relativePath of files) {
      let read; try { read = await this.workspaces.read({ workspaceId, relativePath }); } catch { continue; }
      if (read.truncated) continue;
      const language = extensions[path.extname(relativePath).slice(1).toLowerCase()], lines = read.text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/\b(?:import|require|include|@import|src=|href=)\b/i.test(line)) imports.push({ relativePath, line: i + 1, hint: line.trim().slice(0, 160) });
        for (const rule of definition) { rule.lastIndex = 0; let match; while ((match = rule.exec(line)) && symbols.length < this.maxSymbols) { const symbol = match[2] || match[1]; if (symbol && !['export', 'import'].includes(symbol)) symbols.push({ symbol, kind: kindFor(line), relativePath, lineStart: i + 1, lineEnd: i + 1, language }); } }
      }
    }
    const index = { workspaceId, files, symbols, imports, builtAt: new Date().toISOString() }; this.cache.set(workspaceId, index); return index;
  }
  invalidate(workspaceId) { this.cache.delete(workspaceId); }
  async current(workspaceId) { return this.cache.get(workspaceId) || this.index(workspaceId); }
  async symbolSearch({ workspaceId, query, kind, path: relativePath, limit = 20 }) {
    if (typeof query !== 'string' || !/^[\w.$#-]{1,100}$/.test(query)) throw Object.assign(new Error('Invalid symbol query.'), { status: 400 });
    const index = await this.current(workspaceId), q = query.toLowerCase();
    return index.symbols.filter(item => item.symbol.toLowerCase().includes(q) && (!kind || item.kind === kind) && (!relativePath || item.relativePath === relativePath)).sort((a, b) => Number(b.symbol.toLowerCase() === q) - Number(a.symbol.toLowerCase() === q)).slice(0, bounded(limit, 1, 50, 20));
  }
  async findReferences({ workspaceId, query, limit = 20 }) {
    if (typeof query !== 'string' || !/^[\w.$#-]{1,100}$/.test(query)) throw Object.assign(new Error('Invalid reference query.'), { status: 400 });
    const index = await this.current(workspaceId), cap = bounded(limit, 1, 50, 20), results = [];
    for (const relativePath of index.files.slice(0, 200)) {
      if (results.length >= cap) break;
      let read; try { read = await this.workspaces.read({ workspaceId, relativePath }); } catch { continue; }
      const lines = read.text.split(/\r?\n/);
      for (let i = 0; i < lines.length && results.length < cap; i++) if (lines[i].toLowerCase().includes(query.toLowerCase())) results.push({ relativePath, line: i + 1, context: lines.slice(Math.max(0, i - 1), i + 2).join('\n'), confidence: 'heuristic', reason: 'case-insensitive text occurrence' });
    }
    return results;
  }
  async relatedTests({ workspaceId, relativePath, limit = 20 }) {
    const index = await this.current(workspaceId), workspace = this.workspaces.get(workspaceId); this.workspaces.validatePath(workspace, relativePath);
    const stem = path.basename(relativePath).replace(/\.[^.]+$/, '').replace(/(?:Tests?|Spec)$/i, '').toLowerCase();
    return index.files.filter(item => /(?:test|spec|smoke)/i.test(item) && (path.basename(item).toLowerCase().includes(stem) || item.toLowerCase().includes(stem))).slice(0, bounded(limit, 1, 50, 20));
  }
  async discover({ workspaceId, request, mentionedPaths = [], limit = 8 }) {
    const index = await this.current(workspaceId), terms = [...new Set(token(request).filter(item => item.length > 2))].slice(0, 20), scores = new Map();
    const add = (relativePath, score, reason) => { const old = scores.get(relativePath); if (!old || old.score < score) scores.set(relativePath, { relativePath, score, reason }); };
    for (const item of mentionedPaths) if (index.files.includes(item)) add(item, 100, 'explicit path');
    for (const item of index.files) for (const term of terms) if (item.toLowerCase().includes(term.toLowerCase())) add(item, 60, 'path match');
    for (const item of index.symbols) for (const term of terms) if (item.symbol.toLowerCase() === term.toLowerCase()) add(item.relativePath, 80, 'symbol definition');
    for (const symbol of [...new Set(index.symbols.filter(item => terms.some(term => item.symbol.toLowerCase() === term.toLowerCase())).map(item => item.symbol))].slice(0, 2)) {
      for (const reference of await this.findReferences({ workspaceId, query: symbol, limit: 15 })) add(reference.relativePath, 45, 'direct text reference');
    }
    for (const item of index.imports) if (terms.some(term => item.hint.toLowerCase().includes(term.toLowerCase()))) add(item.relativePath, 40, 'import or route hint');
    const ranked = [...scores.values()].sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath));
    for (const item of ranked.slice(0, 3)) for (const related of await this.relatedTests({ workspaceId, relativePath: item.relativePath, limit: 5 })) add(related, 50, 'related test');
    return { files: [...scores.values()].sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath)).slice(0, bounded(limit, 1, 20, 8)), symbols: index.symbols.filter(item => terms.some(term => item.symbol.toLowerCase() === term.toLowerCase())).slice(0, 20) };
  }
}
