export function registerResearchTool(registry, knowledge) {
  registry.register({
    id: 'knowledge.retrieve', name: 'Retrieve project knowledge', description: 'Read bounded project-scoped indexed knowledge.',
    capabilities: ['knowledge-retrieval'], riskLevel: 'SAFE', requiresApproval: false, allowedAgentTypes: ['Research'],
    validateInput: input => typeof input?.query === 'string' && input.query.trim().length > 0 && input.query.length <= 2000 && Number.isInteger(input.topK) && input.topK >= 1 && input.topK <= 20 && Number.isInteger(input.maxContextTokens) && input.maxContextTokens >= 1 && input.maxContextTokens <= 5000,
    async execute(input, { job }) {
      const data = await knowledge.query({ projectId: job.projectId, query: input.query, topK: input.topK, maxContextTokens: input.maxContextTokens, maxChunks: input.topK });
      return { status: 'success', data, artifacts: [], metadata: { projectId: job.projectId, resultCount: data.results.length } };
    }
  });
}
