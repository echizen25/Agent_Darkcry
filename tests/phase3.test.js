import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentCore } from '../src/core/agentRouter.js';
import { agentRouter } from '../src/core/agentRouter.js';
import express from 'express';
import { ToolRegistry } from '../src/tools/toolRegistry.js';
import { registerDemoTools } from '../src/tools/demoTools.js';
import { PermissionPolicy } from '../src/tools/permissionPolicy.js';
import { EvaluatorRegistry } from '../src/evaluation/evaluatorRegistry.js';
import { EvaluationCore, issueFingerprint } from '../src/evaluation/evaluationCore.js';
import { demoFinalReviewer } from '../src/agents/demoAgents.js';

test('registry protects IDs and exposes capabilities', () => {
  const registry = registerDemoTools(new ToolRegistry());
  assert.equal(registry.exists('demo.echo'), true);
  assert.equal(registry.get('demo.echo').riskLevel, 'SAFE');
  assert.ok(registry.withCapability('demo').length);
  assert.equal(registry.get('missing'), null);
  assert.throws(() => registry.register(registry.get('demo.echo')));
});

test('policy enforces task, agent, project, and risk', () => {
  const registry = registerDemoTools(new ToolRegistry()), policy = new PermissionPolicy();
  const agent = { role: 'Worker', allowedTools: ['demo.echo', 'demo.approvalAction'] };
  const task = { projectId: 'p', allowedTools: ['demo.echo', 'demo.approvalAction'], scope: {} };
  const check = id => policy.evaluate({ agent, task, tool: registry.get(id), projectId: 'p' }).decision;
  assert.equal(check('demo.echo'), 'ALLOW');
  assert.equal(check('demo.approvalAction'), 'REQUIRE_APPROVAL');
  assert.equal(check('demo.controlledAction'), 'DENY');
  task.allowedTools = [];
  assert.equal(check('demo.echo'), 'DENY');
  task.allowedTools = ['demo.echo']; agent.allowedTools = [];
  assert.equal(check('demo.echo'), 'DENY');
  agent.allowedTools = ['demo.echo'];
  assert.equal(policy.evaluate({ agent, task, tool: registry.get('demo.echo'), projectId: 'other' }).decision, 'DENY');
});

test('safe and controlled tool requests execute and record runs', async () => {
  for (const goal of ['Run safe tool demo', 'Run controlled tool demo']) {
    const core = createAgentCore(), job = core.createJob(goal), result = await core.run(job.jobId);
    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.toolRuns.length, 1);
    assert.equal(result.toolRuns[0].status, 'SUCCESS');
    assert.equal(result.toolRuns[0].permissionDecision, 'ALLOW');
    assert.equal(result.artifacts[0].validationStatus, 'VALID');
  }
});

test('approval pauses, resumes the same attempt, and prevents duplicate resolution', async () => {
  const core = createAgentCore(), job = core.createJob('Run approval tool demo');
  const paused = await core.run(job.jobId), approval = paused.approvals[0];
  assert.equal(paused.status, 'WAITING_FOR_APPROVAL');
  assert.equal(paused.tasks[0].status, 'WAITING_FOR_APPROVAL');
  assert.equal(paused.toolRuns[0].status, 'WAITING_FOR_APPROVAL');
  assert.equal(paused.toolRuns[0].startedAt, null);
  const done = await core.approve(approval.approvalId);
  assert.equal(done.status, 'COMPLETED');
  assert.equal(done.tasks[0].attempt, 1);
  assert.equal(done.approvals[0].status, 'APPROVED');
  assert.equal(done.toolRuns.at(-1).status, 'SUCCESS');
  await assert.rejects(core.approve(approval.approvalId), { status: 409 });
  assert.throws(() => core.approvals.get('missing'), { status: 404 });
});

test('denial blocks without executing the tool', async () => {
  const core = createAgentCore(), job = core.createJob('Run approval tool demo');
  const paused = await core.run(job.jobId), blocked = core.deny(paused.approvals[0].approvalId);
  assert.equal(blocked.status, 'BLOCKED');
  assert.equal(blocked.tasks[0].status, 'BLOCKED');
  assert.equal(blocked.toolRuns.length, 1);
  assert.equal(blocked.toolRuns[0].status, 'DENIED');
  assert.equal(blocked.toolRuns[0].startedAt, null);
});

test('evaluation normalizes issues and detects stable repeated fingerprints', () => {
  const registry = new EvaluatorRegistry();
  registry.register({ id: 'demo', name: 'Demo', evaluate: () => ({ status: 'fail', issues: [{ severity: 'high', category: 'CONTENT', location: 'slide:1', description: 'Missing content', suggestedAction: 'Add it.' }] }) });
  assert.throws(() => registry.register({ id: 'demo', name: 'Demo', evaluate() {} }));
  const core = new EvaluationCore({ registry, noProgressThreshold: 2 });
  const a = core.evaluate({ evaluatorId: 'demo' }), b = core.evaluate({ evaluatorId: 'demo' });
  assert.equal(a.status, 'fail');
  assert.equal(a.issues[0].severity, 'HIGH');
  assert.equal(a.issues[0].fingerprint, b.issues[0].fingerprint);
  assert.notEqual(a.issues[0].issueId, b.issues[0].issueId);
  assert.equal(core.noProgress([a, b]).detected, true);
  assert.equal(issueFingerprint({ category: 'X' }), issueFingerprint({ category: 'X' }));
});

test('final reviewer rejects blocking issues and pending approval', async () => {
  const job = { tasks: [{ status: 'COMPLETED', validations: [{ status: 'pass' }] }], issues: [] };
  const artifacts = [{ type: 'demo-text', validationStatus: 'VALID' }];
  assert.equal((await demoFinalReviewer.execute({ job, artifacts })).data.passed, true);
  job.issues = [{ severity: 'HIGH' }];
  assert.equal((await demoFinalReviewer.execute({ job, artifacts })).data.passed, false);
  job.issues = [];
  assert.equal((await demoFinalReviewer.execute({ job, artifacts, approvals: [{ status: 'PENDING' }] })).data.passed, false);
});

test('no-progress event stops a repeated failure and keeps evaluation history', async () => {
  const core = createAgentCore();
  const worker = core.agents.get('demo.worker');
  const original = worker.execute;
  worker.execute = async () => ({ status: 'completed', summary: 'Still incomplete.', data: { content: '' }, artifacts: [], evidence: [], issues: [] });
  try {
    const job = core.createJob('Repeated failure'), details = await core.run(job.jobId);
    assert.equal(details.status, 'FAILED');
    assert.equal(details.tasks[0].validations.length, 2);
    assert.equal(details.tasks[0].failureReason, 'No progress on repeated evaluation issues.');
    assert.ok(details.events.some(item => item.type === 'ISSUE_FINGERPRINT_REPEATED'));
    assert.ok(details.events.some(item => item.type === 'NO_PROGRESS_DETECTED'));
  } finally { worker.execute = original; }
});

test('critic retry=false stops before another attempt', async () => {
  const core = createAgentCore(), critic = core.agents.get('demo.critic');
  critic.execute = async () => ({ status: 'completed', data: { diagnosis: 'No repair', repairInstructions: [], retryRecommended: false } });
  const job = core.createJob('Stop retry'), details = await core.run(job.jobId);
  assert.equal(details.status, 'FAILED');
  assert.equal(details.tasks[0].attempt, 1);
  assert.equal(details.tasks[0].failureReason, 'No repair');
});

test('approval API lists, inspects, resolves, and returns JSON errors', async () => {
  const core = createAgentCore(), app = express();
  app.use(express.json()); app.use('/api/agent', agentRouter(core));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/agent`;
  const call = async (path, method = 'GET') => { const response = await fetch(base + path, { method }); return { status: response.status, body: await response.json() }; };
  try {
    const job = core.createJob('Run approval tool demo');
    const paused = await core.run(job.jobId), id = paused.approvals[0].approvalId;
    assert.equal((await call('/approvals')).body.approvals.length, 1);
    assert.equal((await call(`/approvals/${id}`)).body.status, 'PENDING');
    assert.equal((await call(`/approvals/${id}/approve`, 'POST')).body.status, 'COMPLETED');
    assert.equal((await call(`/approvals/${id}/approve`, 'POST')).status, 409);
    assert.equal((await call('/approvals/missing')).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
