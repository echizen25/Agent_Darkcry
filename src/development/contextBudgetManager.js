import { estimateTokens } from '../knowledge/chunker.js';

const defaults = Object.freeze({ planner: 800, research: 2400, developer: 4000, reviewer: 2400, critic: 1200, finalReviewer: 1000 });
const mandatory = Object.freeze(['NO WRITE BEFORE APPROVAL', 'workspace scope', 'patch fingerprint', 'registered test allowlist', 'Git write prohibition']);
const setting = (name, fallback, min, max) => { const value = process.env[name] === undefined ? fallback : Number(process.env[name]); if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}.`); return value; };
export class ContextBudgetManager {
  constructor({ roleBudgets = {}, maxFiles = setting('DEVELOPMENT_MAX_FILES', 8, 1, 20), maxRangesPerFile = setting('DEVELOPMENT_MAX_RANGES_PER_FILE', 3, 1, 10), qdrantTopK = setting('DEVELOPMENT_QDRANT_TOP_K', 3, 1, 10), maxSymbolResults = setting('DEVELOPMENT_MAX_SYMBOL_RESULTS', 20, 1, 100) } = {}) {
    this.roleBudgets = { ...defaults, developer: setting('DEVELOPMENT_CONTEXT_TOKENS', 4000, 100, 20000), ...roleBudgets }; this.maxFiles = maxFiles; this.maxRangesPerFile = maxRangesPerFile; this.qdrantTopK = qdrantTopK; this.maxSymbolResults = maxSymbolResults;
  }
  estimate(value) { return estimateTokens(typeof value === 'string' ? value : JSON.stringify(value)); }
  pressure(tokens, budget, truncated = false) { return truncated ? 'TRUNCATED' : tokens >= budget * .8 ? 'HIGH' : tokens >= budget * .5 ? 'MEDIUM' : 'LOW'; }
  select(items, { role = 'developer', budget = this.roleBudgets[role] || 2000 } = {}) {
    const unique = new Set(), selected = []; let used = 0, truncated = false;
    for (const item of [...items].sort((a, b) => (b.priority || 0) - (a.priority || 0))) {
      const key = item.key || JSON.stringify(item.value);
      if (unique.has(key)) continue;
      unique.add(key);
      const tokens = this.estimate(item.value);
      if (used + tokens > budget) { truncated = true; continue; }
      selected.push(item); used += tokens;
    }
    return { items: selected, estimatedTokens: used, budget, truncated, pressure: this.pressure(used, budget, truncated), contextBytes: Buffer.byteLength(JSON.stringify(selected)), mandatoryConstraints: [...mandatory] };
  }
  compactTest(result, artifactId = null) {
    const output = String(result.output || result.stdout || result.stderr || '');
    const failedTests = output.split(/\r?\n/).filter(line => /(?:FAIL|✖|Error:|AssertionError)/i.test(line)).slice(0, 8);
    return { status: result.status, code: result.code, exitCode: result.exitCode, durationMs: result.durationMs, failedTests, excerpt: output.slice(0, 1200), artifactId, truncated: output.length > 1200 };
  }
  async compressOptional(original, { kind, compressor = null } = {}) {
    if (!['log', 'terminal', 'search-description', 'repetitive-json'].includes(kind) || !compressor) return { content: original, compressed: false, originalBytes: Buffer.byteLength(String(original)), compressedBytes: 0 };
    try {
      const candidate = await compressor(String(original));
      if (typeof candidate?.content !== 'string' || !candidate.recoveryHandle || candidate.content.length >= String(original).length) throw new Error('Compression was not recoverable or useful.');
      return { content: candidate.content, compressed: true, recoveryHandle: candidate.recoveryHandle, originalBytes: Buffer.byteLength(String(original)), compressedBytes: Buffer.byteLength(candidate.content) };
    } catch { return { content: original, compressed: false, originalBytes: Buffer.byteLength(String(original)), compressedBytes: 0 }; }
  }
}

export const developmentSecurityConstraints = mandatory;
