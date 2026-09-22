const problem = (type, description, location = null) => ({ type, severity: 'HIGH', category: 'DEVELOPMENT', location, description, suggestedAction: description, evidence: [] });
export const developmentResultEvaluator = { id: 'development.result', name: 'Development result evaluator', evaluate({ result }) {
  const data = result.data || {}, issues = [];
  if (!data.proposal) issues.push(problem(data.modelError?.code || data.error?.code || 'PATCH_INVALID', 'No valid patch proposal was produced.'));
  if (data.safety?.status && data.safety.status !== 'pass') issues.push(...data.safety.issues.map(item => ({ ...item, severity: 'HIGH' })));
  if (data.review?.status && data.review.status !== 'PASS') issues.push(problem('CODE_REVIEW_FAILED', 'Code review did not pass.'));
  if (data.applyError) issues.push(problem(data.applyError.code || 'PATCH_APPLY_FAILED', data.applyError.message || 'Patch application failed.'));
  if (!data.dryRun && data.proposal && !data.applied && !data.applyError) issues.push(problem('APPROVAL_REQUIRED', 'Patch was not applied.'));
  for (const test of data.tests || []) if (test.status !== 'success') issues.push(problem(test.code || 'TEST_FAILED', test.code === 'TEST_TIMEOUT' ? 'Registered test timed out.' : 'Registered test failed.'));
  return { status: issues.length ? 'fail' : 'pass', issues, evidence: [] };
} };
