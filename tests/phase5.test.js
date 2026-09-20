import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createAgentCore, agentRouter } from '../src/core/agentRouter.js';
import { ModelGateway } from '../src/models/modelGateway.js';
import { ModelRegistry } from '../src/models/modelRegistry.js';
import { KnowledgeHub } from '../src/knowledge/knowledgeHub.js';
import { EmbeddingGateway } from '../src/knowledge/embeddingGateway.js';
import { MemoryVectorStore } from '../src/knowledge/memoryVectorStore.js';
import { groundingEvaluator } from '../src/evaluation/groundingEvaluator.js';
import { planResearchQuery } from '../src/agents/researchQueryPlanner.js';

const embedding = { id: 'fake-embedding', async embed({ texts }) { return texts.map(text => /auth|cookie|session|key/i.test(text) ? [1, 0] : [0, 1]); } };
const doc = (projectId, sourceId, text) => ({ projectId, sourceId, documentId: sourceId, sourceType: 'DOCUMENT', title: sourceId, text, provenance: { filename: `${sourceId}.txt` } });
async function fixture(mode = 'grounded') {
  const knowledge = new KnowledgeHub({ root: '.', embedding: new EmbeddingGateway({ provider: embedding, model: 'fake-embed' }), store: new MemoryVectorStore(), collection: 'research_test' });
  await knowledge.indexDocuments('Alpha', [doc('Alpha', 'A', 'Authentication uses signed session cookies.'), doc('Alpha', 'B', 'Reports are generated quarterly.')]);
  await knowledge.indexDocuments('Beta', [doc('Beta', 'C', 'Authentication uses API keys.')]);
  let calls = 0;
  const provider = { id: 'fake', capabilities: ['chat', 'embedding'], async health() { return true; }, async embed() { return []; }, async generate({ messages }) {
    calls++;
    const input = JSON.parse(messages[0].content);
    const item = input.retrievedKnowledge.items[0];
    if (mode === 'malformed') return { content: 'not JSON' };
    const bad = mode === 'unsupported' || mode === 'repair' && calls === 1;
    const claim = { text: bad ? 'Unicorn powers authentication.' : item.text, evidence: [{ chunkId: item.chunkId, quote: item.text }] };
    const content = JSON.stringify({ claims: [claim] });
    return { content: mode === 'fenced' ? `\`\`\`json\n${content}\n\`\`\`` : content, usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 } };
  } };
  const registry = new ModelRegistry(); registry.register({ modelId: 'fake-chat', providerId: 'fake', displayName: 'Fake chat', capabilities: ['chat'], purposes: ['RESEARCH'], enabled: true });
  const models = new ModelGateway({ registry }); models.registerProvider(provider);
  const core = createAgentCore({ knowledge, models });
  return { core, knowledge, models, calls: () => calls };
}

test('grounding evaluator accepts exact cited claims and rejects unsupported or forged evidence', () => {
  const context = { items: [{ chunkId: 'c1', text: 'Authentication uses signed session cookies.', provenance: { filename: 'A.txt' } }] };
  const result = claim => ({ data: { claims: [claim], retrievedContext: context } });
  assert.equal(groundingEvaluator.evaluate({ result: result({ text: 'Authentication uses signed session cookies.', evidence: [{ chunkId: 'c1', quote: context.items[0].text }] }) }).status, 'pass');
  assert.equal(groundingEvaluator.evaluate({ result: result({ text: 'Authentication uses OAuth tokens.', evidence: [{ chunkId: 'c1', quote: context.items[0].text }] }) }).issues[0].type, 'unsupported_claim');
  assert.equal(groundingEvaluator.evaluate({ result: result({ text: 'Authentication uses cookies.', evidence: [{ chunkId: 'missing', quote: 'Authentication uses cookies.' }] }) }).issues[0].type, 'invalid_citation');
  assert.equal(groundingEvaluator.evaluate({ result: { data: { claims: [], retrievedContext: { items: [] } } } }).status, 'fail');
});

test('query planning keeps the question, then targets repair evidence', () => {
  assert.equal(planResearchQuery('  How does auth work?  '), 'How does auth work?');
  assert.equal(planResearchQuery('How does auth work?', { targetedQuery: '  signed session cookie ' }), 'signed session cookie');
});

test('research job retrieves Alpha evidence through read-only tool and completes grounded', async () => {
  const { core, models } = await fixture();
  const job = core.createJob('How does authentication work?', { projectId: 'Alpha', kind: 'research', metadata: { research: { topK: 2, maxContextTokens: 100, maxAttempts: 3 } } });
  const result = await core.run(job.jobId);
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.tasks[0].validations[0].status, 'pass');
  assert.equal(result.toolRuns[0].toolId, 'knowledge.retrieve'); assert.equal(result.toolRuns[0].permissionDecision, 'ALLOW');
  assert.equal(result.approvals.length, 0);
  assert.equal(result.tasks[0].result.data.claims[0].evidence[0].provenance.filename, 'A.txt');
  assert.ok(result.tasks[0].result.data.retrievedContext.items.every(item => item.sourceId !== 'C' && item.projectId === undefined));
  assert.equal(models.calls[0].projectId, 'Alpha'); assert.equal(models.calls[0].agentId, 'research.knowledge');
  assert.ok(result.events.some(item => item.type === 'EVALUATION_COMPLETED'));
});

test('research accepts a single fenced JSON response', async () => {
  const { core } = await fixture('fenced');
  const job = core.createJob('How does authentication work?', { projectId: 'Alpha', kind: 'research' });
  assert.equal((await core.run(job.jobId)).status, 'COMPLETED');
});

test('agent tool request cannot override job scope or obtain an unallowed tool', async () => {
  const { core } = await fixture();
  const agent = core.agents.get('research.knowledge');
  let retrieved, denied;
  agent.execute = async ({ requestTool }) => {
    retrieved = await requestTool({ toolId: 'knowledge.retrieve', action: 'query', input: { query: 'authentication', topK: 3, maxContextTokens: 100 }, job: { projectId: 'Beta', jobId: 'forged' } });
    denied = await requestTool({ toolId: 'demo.approvalAction', action: 'simulate', input: { message: 'x' } });
    return { status: 'completed', data: { claims: [], retrievedContext: retrieved.data.context }, artifacts: [] };
  };
  const job = core.createJob('How does authentication work?', { projectId: 'Alpha', kind: 'research', metadata: { research: { topK: 3, maxContextTokens: 100, maxAttempts: 1 } } });
  await core.run(job.jobId);
  assert.equal(retrieved.status, 'success');
  assert.ok(retrieved.data.results.every(item => item.projectId === 'Alpha'));
  assert.equal(denied.error.code, 'PERMISSION_DENIED');
  assert.equal(core.details(job.jobId).approvals.length, 0);
});

test('research critic targets unsupported claim then bounded retry passes', async () => {
  const { core, calls } = await fixture('repair');
  const job = core.createJob('How does authentication work?', { projectId: 'Alpha', kind: 'research', metadata: { research: { topK: 2, maxContextTokens: 100, maxAttempts: 3 } } });
  const result = await core.run(job.jobId);
  assert.equal(result.status, 'COMPLETED'); assert.equal(result.tasks[0].attempt, 2); assert.equal(calls(), 2);
  assert.equal(result.tasks[0].validations[0].status, 'fail'); assert.equal(result.tasks[0].validations[1].status, 'pass');
  assert.match(result.tasks[0].runs[1].repairGuidance.targetedQuery, /Unicorn/);
  assert.ok(result.events.some(item => item.type === 'TASK_RETRY'));
  assert.ok(result.issues.every(item => item.resolvedAt));
});

test('repeated unsupported claim stops without unbounded calls', async () => {
  const { core, calls } = await fixture('unsupported');
  const job = core.createJob('How does authentication work?', { projectId: 'Alpha', kind: 'research', metadata: { research: { topK: 2, maxContextTokens: 100, maxAttempts: 3 } } });
  const result = await core.run(job.jobId);
  assert.equal(result.status, 'FAILED'); assert.equal(result.tasks[0].attempt, 2); assert.equal(calls(), 2);
  assert.ok(result.events.some(item => item.type === 'NO_PROGRESS_DETECTED'));
});

test('malformed model output and empty source context cannot pass final review', async () => {
  const { core } = await fixture('malformed');
  const job = core.createJob('How does authentication work?', { projectId: 'Alpha', kind: 'research', metadata: { research: { topK: 2, maxContextTokens: 100, maxAttempts: 2 } } });
  assert.equal((await core.run(job.jobId)).status, 'FAILED');
  const empty = core.createJob('Unknown question', { projectId: 'Empty', kind: 'research', metadata: { research: { topK: 2, maxContextTokens: 100, maxAttempts: 2 } } });
  const result = await core.run(empty.jobId);
  assert.equal(result.status, 'FAILED'); assert.equal(result.tasks[0].attempt, 1);
});

test('research API validates input, runs through same core, and returns grounded result', async () => {
  const { core } = await fixture();
  const app = express(); app.use(express.json()); app.use('/api/agent', agentRouter(core));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/agent/research/jobs`;
  const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    assert.equal((await post(base, { projectId: '../Beta', question: 'auth' })).status, 400);
    const created = await post(base, { projectId: 'Alpha', question: 'How does authentication work?', topK: 2, maxContextTokens: 100 });
    assert.equal(created.status, 201); const job = await created.json();
    const run = await post(`${base}/${job.jobId}/run`, {});
    assert.equal(run.status, 200); const result = await run.json();
    assert.equal(result.status, 'COMPLETED'); assert.match(result.groundedResult.answer, /signed session cookies/);
    assert.equal((await fetch(`${base}/${job.jobId}`)).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
