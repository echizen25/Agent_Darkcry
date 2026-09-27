import { randomUUID, createHash } from 'node:crypto';
import { handoff } from '../agents/developmentV2Agents.js';

const roles = { DEV_PLAN: 'development.v2.planner', CODE_RESEARCH: 'development.v2.research', DEVELOP: 'development.v2.developer', PATCH_EVALUATE: 'development.v2.patchEvaluator', CODE_REVIEW: 'development.v2.reviewer', PATCH_APPROVAL: 'development.v2.approval', PATCH_APPLY: 'development.v2.apply', TEST: 'development.v2.test', CRITIQUE_REPAIR: 'development.v2.critic', FINAL_REVIEW: 'development.v2.finalReviewer' };
const chain = ['DEV_PLAN', 'CODE_RESEARCH', 'DEVELOP', 'PATCH_EVALUATE', 'CODE_REVIEW', 'PATCH_APPROVAL', 'PATCH_APPLY', 'TEST', 'FINAL_REVIEW'];
const now = () => new Date().toISOString();
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export class DevelopmentTaskGraph {
  constructor(core, { budgetManager, intelligence } = {}) { this.core = core; this.budgetManager = budgetManager; this.intelligence = intelligence; }
  append(job, types, attempt, dependency = undefined) {
    let preceding = dependency === undefined ? job.tasks.at(-1)?.taskId || null : dependency;
    for (const type of types) {
      const agent = this.core.agents.get(roles[type]);
      const task = { taskId: randomUUID(), jobId: job.jobId, projectId: job.projectId, key: `${type}:${attempt}`, type, title: type, objective: job.goal, assignedAgent: agent.id, dependencies: preceding ? [preceding] : [], requiredInputs: [], expectedOutputs: [], acceptanceCriteria: [{ validatorId: 'development.stage' }], evaluatorId: 'deterministic', allowedTools: agent.allowedTools, scope: { controlledAllowed: true, development: job.metadata.development }, contextBudget: { maxInputTokens: this.budgetManager.roleBudgets[type === 'DEVELOP' ? 'developer' : type === 'CODE_RESEARCH' ? 'research' : 'reviewer'] }, timeout: 300000, status: 'QUEUED', priority: 0, attempt: 0, maxAttempts: 1, result: null, issues: [], validations: [], runs: [], pendingApprovalId: null, pendingState: null, createdAt: now(), startedAt: null, completedAt: null };
      job.tasks.push(task); preceding = task.taskId;
    }
  }
  artifact(job, type) { return this.core.artifacts.list(job.jobId).filter(item => item.type === type).at(-1); }
  async start(job) {
    const core = this.core, request = job.metadata.development;
    core.change(job, job, 'PLANNING'); this.append(job, request.dryRun ? chain.filter(item => !['PATCH_APPROVAL', 'PATCH_APPLY', 'TEST'].includes(item)) : chain, 1);
    job.developmentState = { attempt: 1, snapshots: [], history: [], metrics: { handoffs: 0, reusedArtifactRefs: 0, contextBytes: 0, estimatedTokens: 0, modelCalls: 0 }, current: {} };
    core.event(job, 'PLAN_CREATED', null, { taskCount: job.tasks.length, graph: job.tasks.map(item => ({ type: item.type, taskId: item.taskId, dependencies: item.dependencies })) });
    core.change(job, job, 'READY'); core.change(job, job, 'RUNNING'); return this.continue(job);
  }
  async continue(job, resumedTask = null) {
    const core = this.core, request = job.metadata.development, state = job.developmentState;
    while (job.status === 'RUNNING') {
      const task = resumedTask || job.tasks.find(item => item.status === 'QUEUED'); resumedTask = null;
      if (!task) break;
      if (task.status === 'QUEUED') { core.change(job, task, 'PLANNING'); core.change(job, task, 'READY'); core.change(job, task, 'RUNNING'); task.attempt = 1; job.iteration++; core.event(job, 'TASK_STARTED', task, { type: task.type }); }
      const agent = core.agents.get(task.assignedAgent), current = state.current;
      const refs = [current.contextId, current.proposalId, current.testId].filter(Boolean);
      const previous = job.tasks.filter(item => item.status === 'COMPLETED').at(-1);
      const transfer = handoff({ fromAgent: previous?.assignedAgent || 'orchestrator', toAgent: agent.id, taskId: task.taskId, objective: task.objective, artifactRefs: refs, contextRefs: current.contextId ? [current.contextId] : [], issues: current.failure ? [{ code: current.failure.code }] : [], constraints: ['Trusted Tool Registry and Permission Policy control all tools.'], nextExpectedOutput: task.type });
      core.event(job, 'DEVELOPMENT_HANDOFF', task, transfer); state.metrics.handoffs++; state.metrics.reusedArtifactRefs += refs.length;
      const input = { request, projectId: job.projectId, jobId: job.jobId, taskId: task.taskId, budgetManager: this.budgetManager, requestTool: action => core.tools.request({ ...action, job, task, agent, approvalId: task.pendingApprovalId, emit: (type, details) => core.event(job, type, task, details) }) };
      if (task.type === 'CODE_RESEARCH') input.target = current.target;
      if (task.type === 'DEVELOP') { input.context = this.artifact(job, 'DEVELOPMENT_CONTEXT')?.value; input.guidance = current.critic?.data; }
      if (['PATCH_EVALUATE', 'CODE_REVIEW', 'PATCH_APPROVAL', 'PATCH_APPLY'].includes(task.type)) input.proposal = this.artifact(job, 'PATCH_PROPOSAL')?.value;
      if (task.type === 'CODE_REVIEW') input.safety = current.safety?.data?.safety;
      if (task.type === 'CRITIQUE_REPAIR') input.failure = current.failure;
      if (task.type === 'FINAL_REVIEW') { input.latest = { review: current.review, safety: current.safety, apply: current.apply, test: current.test }; input.job = { approvalsCount: core.store.listApprovals(job.jobId).filter(item => item.status === 'APPROVED' && item.consumedAt).length, unresolvedIssues: job.issues.filter(item => !item.resolvedAt), rollbackFailed: job.events.some(item => item.type === 'DEVELOPMENT_ROLLBACK_FAILED') }; input.artifacts = core.artifacts.list(job.jobId).map(item => ({ artifactId: item.artifactId, type: item.type, validationStatus: item.validationStatus })); input.proposal = this.artifact(job, 'PATCH_PROPOSAL')?.value; }
      let result;
      try { result = await agent.execute(input); }
      catch (cause) { core.event(job, 'DEVELOPMENT_STAGE_ERROR', task, { code: cause.code || 'STAGE_FAILED' }); return this.fail(job, task, cause.code || 'STAGE_FAILED'); }
      if (result.status === 'waitingForApproval') { task.pendingApprovalId = result.approvalId; task.pendingState = result.data; core.change(job, task, 'WAITING_FOR_APPROVAL'); core.change(job, job, 'WAITING_FOR_APPROVAL'); core.store.saveJob(job); return core.details(job.jobId); }
      task.pendingApprovalId = null; task.pendingState = null;
      if (task.type === 'DEVELOP') { const calls = core.models?.calls?.filter(item => item.jobId === job.jobId) || []; state.metrics.modelCalls = calls.length; state.metrics.actualInputTokens = calls.reduce((sum, item) => sum + (item.usage?.inputTokens || 0), 0); state.metrics.outputTokens = calls.reduce((sum, item) => sum + (item.usage?.outputTokens || 0), 0); }
      const artifactRefs = [];
      for (const output of result.artifacts || []) { const artifact = core.artifacts.register({ job, task, agentId: agent.id, output }); artifactRefs.push(artifact.artifactId); if (output.type === 'DEVELOPMENT_CONTEXT') { current.contextId = artifact.artifactId; state.metrics.contextBytes += output.value.contextBytes; state.metrics.estimatedTokens += output.value.estimatedTokens; state.metrics.filesIncluded = (state.metrics.filesIncluded || 0) + output.value.files.length; state.metrics.chunksIncluded = (state.metrics.chunksIncluded || 0) + output.value.knowledgeChunks.length; state.metrics.contextPressure = output.value.pressure; } if (output.type === 'PATCH_PROPOSAL') current.proposalId = artifact.artifactId; if (output.type === 'TEST_RESULT') current.testId = artifact.artifactId; }
      const stored = { ...result, artifacts: artifactRefs, data: task.type === 'CODE_RESEARCH' ? { contextRef: current.contextId, summary: result.summary } : task.type === 'DEVELOP' && result.data?.proposal ? { ...result.data, proposal: undefined, proposalRef: current.proposalId } : result.data };
      task.result = stored; task.runs.push({ runId: randomUUID(), attempt: 1, startedAt: task.startedAt, completedAt: now(), result: stored });
      current[task.type === 'DEV_PLAN' ? 'plan' : task.type === 'CODE_RESEARCH' ? 'research' : task.type === 'DEVELOP' ? 'developer' : task.type === 'PATCH_EVALUATE' ? 'safety' : task.type === 'CODE_REVIEW' ? 'review' : task.type === 'PATCH_APPROVAL' ? 'approval' : task.type === 'PATCH_APPLY' ? 'apply' : task.type === 'TEST' ? 'test' : task.type === 'CRITIQUE_REPAIR' ? 'critic' : 'final'] = stored;
      core.change(job, task, 'VALIDATING');
      const bad = task.type === 'DEVELOP' && !result.data?.proposal || task.type === 'PATCH_EVALUATE' && result.data?.safety?.status !== 'pass' || task.type === 'CODE_REVIEW' && result.data?.status !== 'PASS' || task.type === 'PATCH_APPLY' && !result.data?.applied || task.type === 'TEST' && !result.data?.passed || task.type === 'FINAL_REVIEW' && !result.data?.passed;
      if (bad) {
        const code = result.data?.error?.code || (task.type === 'TEST' ? 'TEST_FAILED' : `${task.type}_FAILED`);
        task.issues.push({ type: code, severity: 'HIGH', description: result.summary }); job.issues.push(...task.issues);
        core.event(job, 'VALIDATION_FAILED', task, { code }); core.change(job, task, 'FAILED');
        if (task.type === 'FINAL_REVIEW') return this.fail(job, null, code);
        current.failure = { code, message: result.summary, paths: this.artifact(job, 'PATCH_PROPOSAL')?.value?.files?.map(item => item.path) || [], failingTests: result.data?.results?.filter(item => item.status !== 'success').map(item => item.code) || [] };
        const fingerprint = digest({ code, paths: current.failure.paths, tests: current.failure.failingTests, diagnosis: current.critic?.data?.diagnosis || code, patchDelta: this.artifact(job, 'PATCH_PROPOSAL')?.value?.files?.map(item => ({ path: item.path, operation: item.operation, content: item.content })) });
        if (state.history.includes(fingerprint)) { core.event(job, 'NO_PROGRESS_DETECTED', task, { fingerprint }); return this.fail(job, null, 'NO_PROGRESS'); }
        state.history.push(fingerprint);
        if (state.attempt >= request.maxIterations) return this.fail(job, null, code);
        state.attempt++;
        const remaining = job.tasks.filter(item => item.status === 'QUEUED'); for (const item of remaining) item.status = 'CANCELLED';
        this.append(job, ['CRITIQUE_REPAIR', 'CODE_RESEARCH', 'DEVELOP', 'PATCH_EVALUATE', 'CODE_REVIEW', ...(request.dryRun ? [] : ['PATCH_APPROVAL', 'PATCH_APPLY', 'TEST']), 'FINAL_REVIEW'], state.attempt, task.taskId);
        core.event(job, 'REPAIR_GRAPH_CREATED', task, { attempt: state.attempt, target: current.failure });
        continue;
      }
      task.validations.push({ status: 'pass', issues: [] }); core.change(job, task, 'COMPLETED'); core.event(job, 'TASK_COMPLETED', task, { type: task.type });
      if (task.type === (request.dryRun ? 'CODE_REVIEW' : 'TEST')) for (const issue of job.issues) issue.resolvedAt ||= now();
      if (task.type === 'PATCH_APPLY') { state.snapshots.push(result.data.applied.snapshotId); this.intelligence.invalidate(request.workspaceId); core.event(job, 'PATCH_APPLIED', task, { snapshotId: result.data.applied.snapshotId }); }
      if (task.type === 'CRITIQUE_REPAIR') current.target = { files: result.data.filesToRevisit, query: result.data.contextRequests?.[0]?.query || request.request };
      if (task.type === 'CODE_RESEARCH') { current.failure = null; current.target = null; }
      if (task.type === 'FINAL_REVIEW') { job.finalReview = result; core.change(job, job, 'VALIDATING'); core.change(job, job, 'COMPLETED'); core.event(job, 'JOB_COMPLETED'); break; }
    }
    core.store.saveJob(job); return core.details(job.jobId);
  }
  async fail(job, task, reason) {
    const core = this.core; if (task && ['RUNNING', 'VALIDATING'].includes(task.status)) core.change(job, task, 'FAILED');
    for (const snapshotId of [...job.developmentState.snapshots].reverse()) try { await core.workspaces.restore(snapshotId); core.event(job, 'DEVELOPMENT_ROLLBACK_COMPLETED', task, { snapshotId }); } catch { reason = 'ROLLBACK_FAILED'; core.event(job, 'DEVELOPMENT_ROLLBACK_FAILED', task); }
    job.failureReason = reason; core.change(job, job, 'FAILED'); core.event(job, 'JOB_FAILED', task, { reason }); core.store.saveJob(job); return core.details(job.jobId);
  }
}
