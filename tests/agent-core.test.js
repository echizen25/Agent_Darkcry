import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { transition, StateError } from '../src/core/stateMachine.js';
import { createAgentCore, agentRouter } from '../src/core/agentRouter.js';
import { AgentRegistry } from '../src/agents/agentRegistry.js';
import { demoPlanner, demoWorker, demoCritic, demoFinalReviewer } from '../src/agents/demoAgents.js';
import { MemoryStore } from '../src/storage/memoryStore.js';
import { ArtifactRegistry } from '../src/artifacts/artifactRegistry.js';
import { validate } from '../src/evaluation/validator.js';
import { Orchestrator } from '../src/core/orchestrator.js';

function customCore(worker, planner = demoPlanner) {
  const agents = new AgentRegistry();
  [planner, worker, demoCritic, demoFinalReviewer].forEach(agent => agents.register(agent));
  const store = new MemoryStore();
  return new Orchestrator({ store, agents, artifacts: new ArtifactRegistry(store), validate });
}
const slowWorker = { ...demoWorker, async execute(context) { await new Promise(resolve => setTimeout(resolve, 60)); return demoWorker.execute(context); } };
const badWorker = { ...demoWorker, async execute() { return { status: 'completed', summary: 'Still invalid.', data: { content: '' }, artifacts: [], evidence: [], issues: [], recommendedNextActions: [] }; } };

test('legal state transitions update lifecycle timestamps', () => {
  const job = { status: 'QUEUED', startedAt: null, completedAt: null };
  transition(job, 'PLANNING'); transition(job, 'READY'); transition(job, 'RUNNING');
  assert.ok(job.startedAt);
  transition(job, 'VALIDATING'); transition(job, 'COMPLETED');
  assert.ok(job.completedAt);
});
test('invalid transition is rejected', () => assert.throws(() => transition({ status: 'QUEUED' }, 'RUNNING'), StateError));
test('terminal state cannot restart', () => assert.throws(() => transition({ status: 'COMPLETED' }, 'READY'), StateError));
test('approval can return only to the saved prior state', () => {
  const task = { status: 'RUNNING' }; transition(task, 'WAITING_FOR_APPROVAL');
  assert.throws(() => transition(task, 'COMPLETED', 'COMPLETED'), StateError);
  transition(task, 'RUNNING', 'RUNNING'); assert.equal(task.status, 'RUNNING');
});
test('agent registry registers, lists and resolves agents', () => {
  const registry = new AgentRegistry(); registry.register(demoWorker);
  assert.equal(registry.get('demo.worker'), demoWorker);
  assert.equal(registry.list().length, 1);
});
test('duplicate agent registration is rejected', () => {
  const registry = new AgentRegistry(); registry.register(demoWorker);
  assert.throws(() => registry.register(demoWorker), /already registered/);
});
test('unknown agent is rejected', () => assert.throws(() => new AgentRegistry().get('missing'), /Unknown agent/));
test('validator accepts supported passing criteria', () => {
  const result = { data: { content: 'Validated demo artifact' }, artifacts: [{ type: 'demo-text', value: 'ok' }] };
  const criteria = [
    { validatorId: 'result.fieldExists', params: { field: 'content' } },
    { validatorId: 'result.nonEmpty', params: { field: 'content' } },
    { validatorId: 'result.minimumLength', params: { field: 'content', value: 10 } },
    { validatorId: 'result.equals', params: { field: 'content', value: 'Validated demo artifact' } },
    { validatorId: 'artifact.exists', params: { type: 'demo-text' } }
  ];
  assert.equal(validate(result, criteria).status, 'pass');
});
test('validator returns structured issues on failure', () => {
  const evaluation = validate({ data: { content: '' }, artifacts: [] }, [{ validatorId: 'result.minimumLength', params: { field: 'content', value: 10 } }]);
  assert.equal(evaluation.status, 'fail');
  assert.match(evaluation.issues[0].issueId, /^[0-9a-f-]{36}$/);
  assert.equal(evaluation.issues[0].type, 'minimum_length_failed');
  assert.ok(evaluation.issues[0].suggestedAction);
});
test('dependency blocks task B until task A completes', () => {
  const core = createAgentCore(); const job = core.createJob('demo');
  job.tasks = core.makeTasks(job, [{ key: 'a', dependsOn: [], acceptanceCriteria: [{ validatorId: 'result.nonEmpty', params: { field: 'content' } }] }, { key: 'b', dependsOn: ['a'], acceptanceCriteria: [{ validatorId: 'result.nonEmpty', params: { field: 'content' } }] }]);
  assert.deepEqual(core.runnable(job).map(task => task.key), ['a']);
  assert.equal(job.tasks[1].status, 'QUEUED');
  transition(job.tasks[0], 'RUNNING'); transition(job.tasks[0], 'VALIDATING'); transition(job.tasks[0], 'COMPLETED');
  assert.deepEqual(core.runnable(job).map(task => task.key), ['b']);
});
test('demo loop records failure, critic guidance, retry and second-attempt pass', async () => {
  const core = createAgentCore(); const job = core.createJob('Create a validated demo artifact');
  const done = await core.run(job.jobId); const first = done.tasks[0];
  assert.equal(first.runs.length, 2);
  assert.equal(first.runs[0].validation.status, 'fail');
  assert.equal(first.runs[1].validation.status, 'pass');
  assert.ok(first.runs[1].repairGuidance.repairInstructions.length);
  assert.ok(done.events.some(event => event.type === 'CRITIC_STARTED'));
  assert.ok(done.events.some(event => event.type === 'REPAIR_GUIDANCE_CREATED'));
});
test('dependent task starts after first task completes', async () => {
  const core = createAgentCore(); const job = core.createJob('demo'); const done = await core.run(job.jobId);
  const completed = done.events.findIndex(event => event.type === 'TASK_COMPLETED' && event.taskId === done.tasks[0].taskId);
  const started = done.events.findIndex(event => event.type === 'TASK_STARTED' && event.taskId === done.tasks[1].taskId);
  assert.ok(completed >= 0 && started > completed);
});
test('final reviewer approves complete demo artifact', async () => {
  const core = createAgentCore(); const job = core.createJob('demo'); const done = await core.run(job.jobId);
  assert.equal(done.finalReview.data.passed, true);
  assert.equal(done.status, 'COMPLETED');
  assert.equal(done.artifacts.length, 1);
  assert.equal(done.artifacts[0].type, 'demo-text');
});
test('complete deterministic demo emits final job event', async () => {
  const core = createAgentCore(); const job = core.createJob('Create a validated demo artifact'); const done = await core.run(job.jobId);
  assert.deepEqual(done.tasks.map(task => task.status), ['COMPLETED', 'COMPLETED']);
  assert.ok(done.events.some(event => event.type === 'FINAL_REVIEW_PASSED'));
  assert.equal(done.events.at(-1).type, 'JOB_COMPLETED');
});
test('permanent failure stops at maxAttempts with reason', async () => {
  const core = customCore(badWorker); const job = core.createJob('demo'); const done = await core.run(job.jobId);
  assert.equal(done.status, 'FAILED');
  assert.equal(done.tasks[0].status, 'FAILED');
  assert.equal(done.tasks[0].runs.length, 2);
  assert.equal(done.tasks[1].status, 'QUEUED');
  assert.match(done.failureReason, /Task failed/);
});
test('job iteration cap stops retries', async () => {
  const core = customCore(badWorker); const job = core.createJob('demo', { maxIterations: 1 }); const done = await core.run(job.jobId);
  assert.equal(done.status, 'FAILED'); assert.equal(done.tasks[0].runs.length, 1);
});
test('repeated identical failures stop before a third attempt', async () => {
  const planner = { ...demoPlanner, async execute() {
    const plan = await demoPlanner.execute();
    plan.data.tasks[0].maxAttempts = 5;
    return plan;
  } };
  const core = customCore(badWorker, planner); const job = core.createJob('demo'); const done = await core.run(job.jobId);
  assert.equal(done.tasks[0].runs.length, 2);
  assert.equal(done.status, 'FAILED');
});
test('invalid job iteration limit is rejected', () => assert.throws(() => createAgentCore().createJob('demo', { maxIterations: 0 }), /positive integer/));
test('same job cannot run concurrently or after completion', async () => {
  const core = customCore(slowWorker); const job = core.createJob('demo');
  const running = core.run(job.jobId);
  await assert.rejects(() => core.run(job.jobId), /already running/);
  await running;
  await assert.rejects(() => core.run(job.jobId), /cannot run from COMPLETED/);
});
test('internal agent failure marks job failed', async () => {
  const planner = { ...demoPlanner, async execute() { throw new Error('Planner failed.'); } };
  const core = customCore(demoWorker, planner); const job = core.createJob('demo');
  await assert.rejects(() => core.run(job.jobId), /Planner failed/);
  assert.equal(core.details(job.jobId).status, 'FAILED');
});
test('worker exception marks the active task failed', async () => {
  const worker = { ...demoWorker, async execute() { throw new Error('Worker failed.'); } };
  const core = customCore(worker); const job = core.createJob('demo');
  await assert.rejects(() => core.run(job.jobId), /Worker failed/);
  assert.equal(core.details(job.jobId).tasks[0].status, 'FAILED');
  assert.equal(core.details(job.jobId).status, 'FAILED');
});
test('unknown assigned agent fails the job without executing code', async () => {
  const planner = { ...demoPlanner, async execute() {
    const plan = await demoPlanner.execute();
    plan.data.tasks[0].assignedAgent = 'missing.worker';
    return plan;
  } };
  const core = customCore(demoWorker, planner); const job = core.createJob('demo');
  await assert.rejects(() => core.run(job.jobId), /Unknown agent/);
  assert.equal(core.details(job.jobId).status, 'FAILED');
  assert.equal(core.details(job.jobId).tasks[0].status, 'FAILED');
});
test('Agent Core API creates, lists, gets and runs jobs with JSON errors', async () => {
  const app = express(); app.use(express.json()); app.use('/api/agent', agentRouter(createAgentCore()));
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (route, options) => { const response = await fetch(base + route, options); return { status: response.status, data: await response.json() }; };
  const json = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    assert.equal((await call('/api/agent/jobs', json({}))).status, 400);
    assert.equal((await call('/api/agent/jobs/missing')).status, 404);
    assert.equal((await call('/api/agent/jobs/missing/run', { method: 'POST' })).status, 404);
    const created = await call('/api/agent/jobs', json({ goal: 'Create a validated demo artifact' }));
    assert.equal(created.status, 201);
    assert.equal((await call('/api/agent/jobs')).data.jobs.length, 1);
    const id = created.data.jobId;
    assert.equal((await call(`/api/agent/jobs/${id}`)).data.status, 'QUEUED');
    const ran = await call(`/api/agent/jobs/${id}/run`, { method: 'POST' });
    assert.equal(ran.status, 200); assert.equal(ran.data.status, 'COMPLETED');
    assert.equal((await call(`/api/agent/jobs/${id}/run`, { method: 'POST' })).status, 409);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('Agent Core API hides internal execution details', async () => {
  const planner = { ...demoPlanner, async execute() { throw new Error('Private internal detail.'); } };
  const app = express(); app.use(express.json()); app.use('/api/agent', agentRouter(customCore(demoWorker, planner)));
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const created = await fetch(base + '/api/agent/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goal: 'demo' }) }).then(res => res.json());
    const response = await fetch(`${base}/api/agent/jobs/${created.jobId}/run`, { method: 'POST' });
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.error, 'Agent Core execution failed.');
    assert.ok(!JSON.stringify(body).includes('Private internal detail'));
  } finally { await new Promise(resolve => server.close(resolve)); }
});
