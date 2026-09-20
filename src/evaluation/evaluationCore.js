import { randomUUID, createHash } from 'node:crypto';
import { validate } from './validator.js';
import { EvaluatorRegistry } from './evaluatorRegistry.js';

export const SEVERITIES = Object.freeze(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export const issueFingerprint = issue => createHash('sha256').update(JSON.stringify([issue.category || '', issue.type || '', issue.location || '', issue.criterionId || ''])).digest('hex').slice(0, 24);

export class EvaluationCore {
  constructor({ registry = null, blockingSeverities = ['HIGH', 'CRITICAL'], noProgressThreshold = 2 } = {}) {
    this.registry = registry || new EvaluatorRegistry();
    if (!registry) this.registry.register({ id: 'deterministic', name: 'Deterministic validator', evaluate: ({ result, criteria }) => validate(result, criteria) });
    this.blockingSeverities = new Set(blockingSeverities);
    this.noProgressThreshold = noProgressThreshold;
  }
  evaluate({ evaluatorId = 'deterministic', result, criteria, context = {} }) {
    const raw = this.registry.get(evaluatorId).evaluate({ result, criteria, context });
    const issues = (raw.issues || []).map(item => {
      const normalized = { ...item, issueId: item.issueId || randomUUID(), severity: String(item.severity || 'HIGH').toUpperCase(), category: item.category || 'VALIDATION', location: item.location || null, evidence: item.evidence || [] };
      if (!SEVERITIES.includes(normalized.severity)) throw new Error(`Unknown severity: ${normalized.severity}`);
      normalized.fingerprint = issueFingerprint(normalized);
      return normalized;
    });
    const status = raw.status === 'blocked' ? 'blocked' : raw.status === 'fail' || issues.some(item => this.blockingSeverities.has(item.severity)) ? 'fail' : 'pass';
    return { evaluationId: raw.evaluationId || randomUUID(), status, issues, evidence: raw.evidence || [], metadata: { ...(raw.metadata || {}), evaluatorId, blockingSeverities: [...this.blockingSeverities] } };
  }
  noProgress(history) {
    if (!Number.isInteger(this.noProgressThreshold) || this.noProgressThreshold < 2) throw new Error('No-progress threshold must be at least 2.');
    const recent = history.slice(-this.noProgressThreshold);
    if (recent.length < this.noProgressThreshold || recent.some(item => item.status !== 'fail')) return { detected: false, fingerprints: [] };
    const sets = recent.map(item => new Set(item.issues.filter(issue => this.blockingSeverities.has(issue.severity)).map(issue => issue.fingerprint)));
    const repeated = [...sets[0]].filter(fingerprint => sets.every(set => set.has(fingerprint)));
    return { detected: repeated.length > 0, fingerprints: repeated };
  }
}
