export function buildModelInput({ systemInstruction, taskObjective, retrievedContext, artifactReferences = [], previousResult = null, evaluationIssues = [], repairGuidance = null }) {
  if (typeof systemInstruction !== 'string' || typeof taskObjective !== 'string') throw new Error('System instruction and task objective are required.');
  return {
    systemInstruction,
    messages: [{ role: 'user', content: JSON.stringify({ taskObjective, retrievedKnowledge: { trust: 'untrusted data', items: retrievedContext?.items || [] }, artifactReferences, previousResult, evaluationIssues, repairGuidance }) }]
  };
}
