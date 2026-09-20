import { randomUUID } from 'node:crypto';
import { transition } from './stateMachine.js';
import { EvaluationCore } from '../evaluation/evaluationCore.js';
import { EvaluatorRegistry } from '../evaluation/evaluatorRegistry.js';

const now = () => new Date().toISOString();
const error = (status, message) => Object.assign(new Error(message), { status });
const withTimeout = (promise, ms) => {
  let timer;
  return Promise.race([Promise.resolve(promise), new Promise((_, reject) => { timer = setTimeout(() => reject(error(500, 'Task timed out.')), ms); })]).finally(() => clearTimeout(timer));
};

export class Orchestrator {
  constructor({ store, agents, artifacts, validate, evaluationCore = null, toolService = null, approvals = null, plannerId = 'demo.planner', criticId = 'demo.critic', reviewerId = 'demo.finalReviewer' }) {
    this.store = store; this.agents = agents; this.artifacts = artifacts;
    if (!evaluationCore && validate) { const registry = new EvaluatorRegistry(); registry.register({ id: 'deterministic', name: 'Deterministic validator', evaluate: ({ result, criteria }) => validate(result, criteria) }); evaluationCore = new EvaluationCore({ registry }); }
    this.evaluation = evaluationCore || new EvaluationCore(); this.tools = toolService; this.approvals = approvals;
    this.plannerId = plannerId; this.criticId = criticId; this.reviewerId = reviewerId;
    this.active = new Set();
  }
  event(job, type, task = null, details = {}) {
    const entry = { type, timestamp: now(), jobId: job.jobId, taskId: task?.taskId || null, attempt: task?.attempt || null, details };
    job.events.push(entry); return entry;
  }
  change(job, entity, to, approvedReturnState = null) {
    const from = entity.status;
    transition(entity, to, approvedReturnState);
    this.event(job, entity === job ? 'JOB_STATUS_CHANGED' : 'TASK_STATUS_CHANGED', entity === job ? null : entity, { from, to });
  }
  createJob(goal, options = {}) {
    if (typeof goal !== 'string' || !goal.trim()) throw error(400, 'Goal is required.');
    if (goal.length > 1000) throw error(400, 'Goal is too long.');
    if (options.maxIterations !== undefined && (!Number.isInteger(options.maxIterations) || options.maxIterations < 1)) throw error(400, 'maxIterations must be a positive integer.');
    const job = {
      jobId: randomUUID(), projectId: options.projectId || randomUUID(), goal: goal.trim(), status: 'QUEUED',
      createdAt: now(), startedAt: null, completedAt: null, tasks: [], currentTaskId: null,
      iteration: 0, maxIterations: options.maxIterations ?? 10, failureReason: null, metadata: {},
      issues: [], events: [], finalReview: null
    };
    this.store.createJob(job);
    this.event(job, 'JOB_CREATED');
    return job;
  }
  getJob(id) { const job = this.store.getJob(id); if (!job) throw error(404, 'Job not found.'); return job; }
  details(id) { const job = this.getJob(id); return { ...job, artifacts: this.artifacts.list(id), approvals: this.store.listApprovals(id), toolRuns: this.store.listToolRuns(id) }; }
  listJobs() { return this.store.listJobs().map(({ jobId, projectId, goal, status, createdAt, completedAt, iteration }) => ({ jobId, projectId, goal, status, createdAt, completedAt, iteration })); }

  makeTasks(job, definitions) {
    if (!Array.isArray(definitions) || !definitions.length || definitions.length > 20) throw new Error('Planner returned an invalid task plan.');
    const keys = definitions.map(item => item.key);
    if (keys.some(key => typeof key !== 'string' || !key) || new Set(keys).size !== keys.length) throw new Error('Planner returned duplicate or missing task keys.');
    const ids = new Map(keys.map(key => [key, randomUUID()]));
    return definitions.map(item => {
      if (!Array.isArray(item.acceptanceCriteria) || !item.acceptanceCriteria.length || !Array.isArray(item.dependsOn) || item.dependsOn.some(key => !ids.has(key) || key === item.key) || (item.maxAttempts !== undefined && (!Number.isInteger(item.maxAttempts) || item.maxAttempts < 1))) throw new Error('Planner returned invalid task dependencies, criteria, or attempt limit.');
      return {
        taskId: ids.get(item.key), jobId: job.jobId, projectId: job.projectId, key: item.key,
        type: item.type, title: item.title, objective: item.objective, assignedAgent: item.assignedAgent,
        dependencies: item.dependsOn.map(key => ids.get(key)), requiredInputs: [], expectedOutputs: item.expectedOutputs || [],
        acceptanceCriteria: item.acceptanceCriteria, allowedTools: item.allowedTools || [], scope: item.scope || {}, contextBudget: { maxInputTokens: 2000, maxRetrievedSources: 0 },
        timeout: 30000, status: 'QUEUED', priority: 0, attempt: 0, maxAttempts: item.maxAttempts ?? 2,
        result: null, issues: [], validations: [], runs: [], repairGuidance: null, pendingApprovalId: null, failureReason: null,
        createdAt: now(), startedAt: null, completedAt: null
      };
    });
  }
  runnable(job) {
    for (const task of job.tasks.filter(item => item.status === 'QUEUED' && item.dependencies.every(id => job.tasks.find(dep => dep.taskId === id)?.status === 'COMPLETED'))) {
      this.change(job, task, 'PLANNING'); this.change(job, task, 'READY'); this.event(job, 'TASK_READY', task);
    }
    return job.tasks.filter(task => task.status === 'READY').sort((a, b) => b.priority - a.priority);
  }
  async run(id) {
    const job = this.getJob(id);
    if (this.active.has(id)) throw error(409, 'Job is already running.');
    if (job.status !== 'QUEUED') throw error(409, `Job cannot run from ${job.status}.`);
    this.active.add(id);
    try {
      this.change(job, job, 'PLANNING');
      const plan = await withTimeout(this.agents.get(this.plannerId).execute({ goal: job.goal, projectId: job.projectId }), 30000);
      if (plan.status !== 'completed') throw new Error('Planner did not complete.');
      job.tasks = this.makeTasks(job, plan.data?.tasks);
      this.event(job, 'PLAN_CREATED', null, { taskCount: job.tasks.length });
      this.change(job, job, 'READY'); this.change(job, job, 'RUNNING');
      return await this.continueJob(job);
    } catch (cause) {
      const activeTask = job.tasks.find(task => task.taskId === job.currentTaskId);
      if (activeTask && ['PLANNING', 'RUNNING', 'VALIDATING', 'REVISING'].includes(activeTask.status)) this.change(job, activeTask, 'FAILED');
      if (!['COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED'].includes(job.status)) this.fail(job, cause.message);
      this.store.saveJob(job);
      throw cause;
    } finally { job.currentTaskId = null; this.active.delete(id); }
  }
  async continueJob(job, resumedTask = null) {
      if (resumedTask) {
        const paused = await this.runTask(job, resumedTask, true);
        if (paused) return this.details(job.jobId);
        if (resumedTask.status === 'FAILED') this.fail(job, `Task failed: ${resumedTask.title}`);
      }
      while (job.status === 'RUNNING' && job.tasks.some(task => task.status !== 'COMPLETED')) {
        const ready = this.runnable(job);
        if (!ready.length) { this.fail(job, 'No runnable task remains.'); break; }
        const task = ready[0];
        const paused = await this.runTask(job, task);
        if (paused) return this.details(job.jobId);
        if (task.status === 'FAILED') { this.fail(job, `Task failed: ${task.title}`); break; }
      }
      if (job.status === 'RUNNING') {
        this.change(job, job, 'VALIDATING');
        this.event(job, 'FINAL_REVIEW_STARTED');
        const review = await withTimeout(this.agents.get(this.reviewerId).execute({ job, artifacts: this.artifacts.list(job.jobId), approvals: this.store.listApprovals(job.jobId) }), 30000);
        job.finalReview = review;
        if (review.status === 'completed' && review.data?.passed === true) {
          this.event(job, 'FINAL_REVIEW_PASSED'); this.change(job, job, 'COMPLETED'); this.event(job, 'JOB_COMPLETED');
        } else this.fail(job, review.summary || 'Final review failed.');
      }
      this.store.saveJob(job);
      return this.details(job.jobId);
  }
  async approve(approvalId) {
    const approval = this.approvals.get(approvalId), job = this.getJob(approval.jobId);
    if (this.active.has(job.jobId)) throw error(409, 'Job is already running.');
    const task = job.tasks.find(item => item.taskId === approval.taskId);
    if (approval.status !== 'PENDING' || job.status !== 'WAITING_FOR_APPROVAL' || task?.status !== 'WAITING_FOR_APPROVAL' || task.pendingApprovalId !== approvalId) throw error(409, 'Job is not waiting for this approval.');
    this.approvals.resolve(approvalId, 'APPROVED'); this.event(job, 'APPROVAL_APPROVED', task, { approvalId });
    this.change(job, task, task.approvalReturnState, task.approvalReturnState);
    this.change(job, job, job.approvalReturnState, job.approvalReturnState);
    this.active.add(job.jobId);
    try { return await this.continueJob(job, task); }
    catch (cause) { if (['RUNNING', 'VALIDATING', 'REVISING'].includes(task.status)) this.change(job, task, 'FAILED'); if (job.status === 'RUNNING') this.fail(job, cause.message); throw cause; }
    finally { job.currentTaskId = null; this.active.delete(job.jobId); this.store.saveJob(job); }
  }
  deny(approvalId) {
    const approval = this.approvals.get(approvalId), job = this.getJob(approval.jobId);
    const task = job.tasks.find(item => item.taskId === approval.taskId);
    if (approval.status !== 'PENDING' || job.status !== 'WAITING_FOR_APPROVAL' || task?.status !== 'WAITING_FOR_APPROVAL' || task.pendingApprovalId !== approvalId) throw error(409, 'Job is not waiting for this approval.');
    this.approvals.resolve(approvalId, 'DENIED'); this.event(job, 'APPROVAL_DENIED', task, { approvalId });
    const pending = this.store.listToolRuns(job.jobId).find(item => item.approvalId === approvalId && item.status === 'WAITING_FOR_APPROVAL');
    if (pending) { pending.status = 'DENIED'; pending.errorCode = 'APPROVAL_DENIED'; pending.completedAt = now(); }
    task.failureReason = 'Approval denied.'; job.failureReason = 'Approval denied.';
    this.change(job, task, 'BLOCKED'); this.change(job, job, 'BLOCKED'); this.store.saveJob(job);
    return this.details(job.jobId);
  }
  fail(job, reason) {
    job.failureReason = reason;
    this.change(job, job, 'FAILED'); this.event(job, 'JOB_FAILED', null, { reason });
  }
  async runTask(job, task, resume = false) {
    while (resume || (task.attempt < task.maxAttempts && job.iteration < job.maxIterations)) {
      job.currentTaskId = task.taskId;
      if (!resume) {
        task.attempt++; job.iteration++; this.change(job, task, 'RUNNING');
        this.event(job, 'TASK_STARTED', task); this.event(job, 'AGENT_SELECTED', task, { agentId: task.assignedAgent }); this.event(job, 'TASK_ATTEMPT_STARTED', task);
      }
      const run = resume ? task.runs.at(-1) : { runId: randomUUID(), attempt: task.attempt, startedAt: now(), completedAt: null, result: null, validation: null, repairGuidance: task.repairGuidance };
      if (!resume) task.runs.push(run);
      resume = false;
      const agent = this.agents.get(task.assignedAgent);
      const context = {
        task: { taskId: task.taskId, key: task.key, objective: task.objective, requiredInputs: task.requiredInputs, expectedOutputs: task.expectedOutputs, allowedTools: task.allowedTools, contextBudget: task.contextBudget },
        attempt: task.attempt, projectState: { projectId: job.projectId }, retrievedKnowledge: [],
        artifactReferences: this.artifacts.list(job.jobId).map(item => item.artifactId),
        previousResults: job.tasks.filter(item => item.status === 'COMPLETED').map(item => ({ key: item.key, data: item.result?.data })),
        repairGuidance: task.repairGuidance,
        requestTool: request => this.tools.request({ job, task, agent, ...request, approvalId: task.pendingApprovalId, emit: (type, details) => this.event(job, type, task, details) })
      };
      const result = await withTimeout(agent.execute(context), task.timeout);
      if (result?.status === 'waitingForApproval') {
        task.pendingApprovalId = result.approvalId; run.result = result;
        this.change(job, task, 'WAITING_FOR_APPROVAL'); this.change(job, job, 'WAITING_FOR_APPROVAL'); this.store.saveJob(job); return true;
      }
      task.pendingApprovalId = null;
      if (result?.status !== 'completed') throw new Error(`Agent ${task.assignedAgent} did not complete.`);
      run.result = result; task.result = result; this.event(job, 'TASK_RESULT_RECEIVED', task, { summary: result.summary });
      this.change(job, task, 'VALIDATING'); this.event(job, 'EVALUATION_STARTED', task);
      const validation = this.evaluation.evaluate({ result, criteria: task.acceptanceCriteria, context: { job, task } });
      run.validation = validation; run.completedAt = now(); task.validations.push(validation);
      this.event(job, 'EVALUATION_COMPLETED', task, { evaluationId: validation.evaluationId, status: validation.status });
      if (validation.status === 'pass') {
        this.event(job, 'VALIDATION_PASSED', task, { evaluationId: validation.evaluationId });
        for (const issue of task.issues) issue.resolvedAt ||= now();
        for (const output of result.artifacts || []) this.artifacts.register({ job, task, agentId: task.assignedAgent, output, validationStatus: validation.issues.length ? 'WARNING' : 'VALID' });
        this.change(job, task, 'COMPLETED'); this.event(job, 'TASK_COMPLETED', task);
        job.currentTaskId = null; return false;
      }
      this.event(job, 'VALIDATION_FAILED', task, { evaluationId: validation.evaluationId });
      task.issues.push(...validation.issues); job.issues.push(...validation.issues);
      for (const item of validation.issues) this.event(job, 'ISSUE_CREATED', task, { issueId: item.issueId, type: item.type });
      for (const output of result.artifacts || []) this.artifacts.register({ job, task, agentId: task.assignedAgent, output, validationStatus: 'INVALID' });
      const progress = this.evaluation.noProgress(task.validations);
      if (progress.detected) { this.event(job, 'ISSUE_FINGERPRINT_REPEATED', task, { fingerprints: progress.fingerprints }); this.event(job, 'NO_PROGRESS_DETECTED', task); task.failureReason = 'No progress on repeated evaluation issues.'; break; }
      if (task.attempt >= task.maxAttempts || job.iteration >= job.maxIterations) break;
      this.change(job, task, 'REVISING'); this.event(job, 'CRITIC_STARTED', task);
      const critique = await withTimeout(this.agents.get(this.criticId).execute({ task: { objective: task.objective, acceptanceCriteria: task.acceptanceCriteria }, previousResult: result, evaluation: validation, validation, issueHistory: task.issues, attempt: task.attempt, remainingAttempts: Math.min(task.maxAttempts - task.attempt, job.maxIterations - job.iteration) }), task.timeout);
      if (critique.status !== 'completed') throw new Error('Critic did not complete.');
      if (critique.data?.retryRecommended === false) { task.failureReason = critique.data.diagnosis || 'Critic advised against retry.'; break; }
      if (!critique.data?.repairInstructions?.length) throw new Error('Critic did not provide repair guidance.');
      task.repairGuidance = critique.data;
      this.event(job, 'REPAIR_GUIDANCE_CREATED', task, { diagnosis: critique.data.diagnosis });
      this.event(job, 'TASK_RETRY', task, { nextAttempt: task.attempt + 1 });
    }
    this.change(job, task, 'FAILED');
    job.currentTaskId = null;
    return false;
  }
}
