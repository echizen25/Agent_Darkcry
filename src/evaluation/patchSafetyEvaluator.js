import { patchBytes } from '../development/patchProposal.js';

const issue = (type, location, description) => ({ type, severity: 'CRITICAL', category: 'PATCH_SAFETY', location, description, suggestedAction: 'Regenerate a policy-compliant patch.', evidence: [] });
const suspicious = /(?:curl|wget).{0,40}(?:\||powershell|cmd)|child_process|execSync|spawnSync|rm\s+-rf|Remove-Item\s+.*-Recurse|credential|private.?key|disable.{0,20}(?:security|antivirus|firewall)/i;
export function createPatchSafetyEvaluator(workspaces) {
  return { id: 'development.patchSafety', name: 'Patch safety evaluator', evaluate({ result, context }) {
    const proposal = result.data?.proposal, request = context.task.scope?.development || {}, issues = [];
    if (!proposal?.files?.length) issues.push(issue('PATCH_INVALID', null, 'No patch files were proposed.'));
    if (proposal?.files?.length > (request.maxFilesChanged || 10)) issues.push(issue('TOO_MANY_FILES', null, 'Patch exceeds the file-count limit.'));
    if (proposal && patchBytes(proposal) > (request.maxPatchBytes || 100000)) issues.push(issue('PATCH_TOO_LARGE', null, 'Patch exceeds the byte limit.'));
    for (const file of proposal?.files || []) {
      try { workspaces.validatePath(workspaces.get(request.workspaceId), file.path); } catch (cause) { issues.push(issue(cause.code || 'PATH_DENIED', file.path, cause.message)); }
      if (file.operation === 'DELETE' && !request.allowDeleteFiles) issues.push(issue('DELETE_NOT_ALLOWED', file.path, 'Deletion is not allowed.'));
      if (file.operation === 'CREATE' && !request.allowCreateFiles) issues.push(issue('CREATE_NOT_ALLOWED', file.path, 'Creation is not allowed.'));
      if (suspicious.test(file.content || '')) issues.push(issue('SUSPICIOUS_CODE', file.path, 'Patch contains a suspicious high-risk code signal.'));
    }
    return { status: issues.length ? 'fail' : 'pass', issues, evidence: proposal?.files?.map(file => ({ type: 'patchFile', path: file.path })) || [] };
  } };
}
