export async function buildDevelopmentContext({ request, workspaces, intelligence, knowledge = null, budgetManager, projectId, target = null }) {
  const workspaceId = request.workspaceId, discovered = await intelligence.discover({ workspaceId, request: target?.query || request.request, mentionedPaths: target?.files || request.contextFiles || [], limit: budgetManager.maxFiles });
  let knowledgeChunks = [], knowledgeStatus = 'UNAVAILABLE';
  if (knowledge) try {
    const filters = request.repositoryId ? { repositoryId: request.repositoryId } : { sourceType: 'REPOSITORY_FILE' };
    if (target?.files?.length === 1) filters.relativePath = target.files[0];
    const answer = await knowledge.query({ projectId, query: target?.query || request.request, topK: budgetManager.qdrantTopK, maxContextTokens: Math.min(1000, budgetManager.roleBudgets.research), filters });
    knowledgeChunks = (answer.context?.items || []).filter(item => !item.projectId || item.projectId === projectId).map(item => ({ chunkId: item.chunkId, relativePath: item.provenance?.relativePath, repositoryId: item.provenance?.repositoryId, commit: item.provenance?.commit, text: item.text, source: 'qdrant', status: 'DISCOVERY_ONLY' }));
    knowledgeStatus = 'AVAILABLE';
  } catch { knowledgeStatus = 'UNAVAILABLE'; }
  const ranked = new Map();
  for (const item of [...discovered.files, ...knowledgeChunks.filter(item => item.relativePath).map(item => ({ relativePath: item.relativePath, score: 20, reason: 'Qdrant semantic discovery' })), ...(target?.files || request.contextFiles || []).map(relativePath => ({ relativePath, score: 110, reason: 'explicit target' }))]) {
    const old = ranked.get(item.relativePath); if (!old || item.score > old.score) ranked.set(item.relativePath, item);
  }
  const candidates = [...ranked.values()].sort((a, b) => b.score - a.score).slice(0, budgetManager.maxFiles), entries = [];
  for (const candidate of candidates) {
    try {
      const read = await workspaces.read({ workspaceId, relativePath: candidate.relativePath });
      entries.push({ relativePath: candidate.relativePath, ranges: [{ startLine: read.startLine, endLine: read.endLine, text: read.text }], reason: candidate.reason, contentHash: await workspaces.currentHash(workspaceId, candidate.relativePath), source: 'workspace', truncated: read.truncated });
    } catch { /* missing or denied candidates are excluded */ }
  }
  knowledgeChunks = knowledgeChunks.map(item => { const current = entries.find(file => file.relativePath === item.relativePath); return { ...item, status: current && !current.ranges.some(range => range.text.includes(item.text)) ? 'STALE_KNOWLEDGE' : item.status }; });
  const items = [...entries.map(file => ({ key: `workspace:${file.relativePath}:${file.contentHash}`, priority: 100, value: file })), ...knowledgeChunks.map(chunk => ({ key: `qdrant:${chunk.chunkId}`, priority: 20, value: chunk }))];
  const hardBudget = Number.isInteger(request.contextTokens) ? Math.max(100, Math.min(20000, request.contextTokens)) : budgetManager.roleBudgets.developer;
  const baseTokens = budgetManager.estimate({ request: request.request, acceptanceCriteria: request.acceptanceCriteria, constraints: ['NO WRITE BEFORE APPROVAL', 'workspace scope', 'patch fingerprint', 'registered test allowlist', 'Git write prohibition'] });
  const selected = budgetManager.select(items, { role: 'developer', budget: Math.max(0, hardBudget - baseTokens) });
  const files = selected.items.filter(item => item.value.source === 'workspace').map(item => item.value), chunks = selected.items.filter(item => item.value.source === 'qdrant').map(item => item.value);
  let used = baseTokens + selected.estimatedTokens, truncated = selected.truncated || baseTokens > hardBudget;
  const symbols = [], tests = [];
  for (const item of discovered.symbols.slice(0, budgetManager.maxSymbolResults)) { const cost = budgetManager.estimate(item); if (used + cost > hardBudget) { truncated = true; break; } symbols.push(item); used += cost; }
  const related = [...new Set((await Promise.all(files.map(file => intelligence.relatedTests({ workspaceId, relativePath: file.relativePath })))).flat())].slice(0, 20);
  for (const item of related) { const cost = budgetManager.estimate(item); if (used + cost > hardBudget) { truncated = true; break; } tests.push(item); used += cost; }
  return { request: request.request, acceptanceCriteria: request.acceptanceCriteria, files, symbols, knowledgeChunks: chunks, tests, dependencies: [], constraints: selected.mandatoryConstraints, estimatedTokens: used, contextBytes: Buffer.byteLength(JSON.stringify({ request: request.request, acceptanceCriteria: request.acceptanceCriteria, constraints: selected.mandatoryConstraints, files, symbols, knowledgeChunks: chunks, tests })), pressure: budgetManager.pressure(used, hardBudget, truncated), truncated, knowledgeStatus, metrics: { filesIncluded: files.length, chunksIncluded: chunks.length, symbolCount: symbols.length } };
}
