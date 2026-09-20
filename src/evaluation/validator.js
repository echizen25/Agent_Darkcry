import { randomUUID } from 'node:crypto';

const field = (result, name) => name?.split('.').reduce((value, part) => value?.[part], result.data);
const issue = (type, description, suggestedAction) => ({ issueId: randomUUID(), severity: 'high', type, description, suggestedAction });

export function validate(result, criteria) {
  if (!Array.isArray(criteria) || !criteria.length) throw new Error('Acceptance criteria are required.');
  const issues = [];
  for (const criterion of criteria) {
    const { validatorId, params = {} } = criterion;
    const value = field(result, params.field);
    if (validatorId === 'result.fieldExists') {
      if (value === undefined || value === null) issues.push(issue('field_missing', `${params.field} is required.`, `Provide ${params.field}.`));
    } else if (validatorId === 'result.nonEmpty') {
      if (typeof value !== 'string' || !value.trim()) issues.push(issue('empty_result', `${params.field} must be non-empty.`, `Provide non-empty ${params.field}.`));
    } else if (validatorId === 'result.minimumLength') {
      if (typeof value !== 'string' || value.trim().length < params.value) issues.push(issue('minimum_length_failed', `${params.field} must contain at least ${params.value} characters.`, `Provide complete ${params.field}.`));
    } else if (validatorId === 'result.equals') {
      if (value !== params.value) issues.push(issue('value_mismatch', `${params.field} must equal the required value.`, `Set ${params.field} to the required value.`));
    } else if (validatorId === 'artifact.exists') {
      if (!result.artifacts?.some(artifact => artifact.type === params.type && (artifact.value !== undefined || artifact.path))) issues.push(issue('artifact_missing', `Artifact ${params.type} is required.`, `Produce the ${params.type} artifact.`));
    } else throw new Error(`Unknown validator: ${validatorId}`);
  }
  return { evaluationId: randomUUID(), status: issues.length ? 'fail' : 'pass', score: null, issues, evidence: [] };
}
