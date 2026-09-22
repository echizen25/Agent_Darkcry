import { createHash } from 'node:crypto';

const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const failure = (code, message, status = 400) => Object.assign(new Error(message), { code, status });
export const patchFingerprint = proposal => createHash('sha256').update(JSON.stringify(stable(proposal))).digest('hex');
export const patchBytes = proposal => Buffer.byteLength(JSON.stringify(proposal));
export const diffPreview = proposal => proposal.files.map(file => `--- ${file.operation} ${file.path}\n${file.operation === 'DELETE' ? '[delete file]' : String(file.content).split(/\r?\n/).slice(0, 40).map(line => `+ ${line}`).join('\n')}`).join('\n');
export function parsePatchProposal(value) {
  let proposal = value;
  if (typeof value === 'string') { try { proposal = JSON.parse(value.replace(/^```(?:json)?\s*|\s*```$/gi, '')); } catch { throw failure('PATCH_INVALID', 'Patch proposal is not valid JSON.'); } }
  if (!proposal || typeof proposal.summary !== 'string' || typeof proposal.reasoningSummary !== 'string' || !Array.isArray(proposal.files) || !Array.isArray(proposal.testsRecommended) || !Array.isArray(proposal.risks) || !Array.isArray(proposal.assumptions)) throw failure('PATCH_INVALID', 'Patch proposal contract is invalid.');
  const parsed = { summary: proposal.summary.slice(0, 1000), reasoningSummary: proposal.reasoningSummary.slice(0, 2000), files: proposal.files.map(file => ({ path: String(file.path || ''), operation: String(file.operation || ''), content: file.content == null ? null : String(file.content), baseHash: file.baseHash == null ? null : String(file.baseHash), purpose: String(file.purpose || '').slice(0, 1000) })), testsRecommended: proposal.testsRecommended.map(String), risks: proposal.risks.map(String), assumptions: proposal.assumptions.map(String) };
  if (parsed.files.some(file => !['MODIFY', 'CREATE', 'DELETE'].includes(file.operation) || !file.path || file.operation !== 'DELETE' && typeof file.content !== 'string' || file.operation !== 'CREATE' && !/^[a-f0-9]{64}$/.test(file.baseHash || ''))) throw failure('PATCH_INVALID', 'Patch file contract is invalid.');
  return parsed;
}
