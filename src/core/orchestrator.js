import { randomUUID } from 'node:crypto';
import { transition } from './stateMachine.js';

const now = () => new Date().toISOString();
const error = (status, message) => Object.assign(new Error(message), { status });
const withTimeout = (promise, ms) => {
  let timer;
  return Promise.race([Promise.resolve(promise), new Promise((_, reject) => { timer = setTimeout(() => reject(error(500, 'Task timed out.')), ms); })]).finally(() => clearTimeout(timer));
};

export class Orchestrator {
  constructor({ store, agents, artifacts, validate, plannerId = 'demo.planner', criticId = 'demo.critic', reviewerId = 'demo.finalReviewer' }) {
    this.store = store; this.agents = agents; this.artifacts = artifacts; this.validate = validate;
    this.plannerId = plannerId; this.criticId = criticId; this.reviewerId = reviewerId;
    this.active = new Set();
  }
  event(job, type, task = null, details = {}) {
    const entry = { type, timestamp: now(), jobId: job.jobId, taskId: task?.taskId || null, attempt: task?.attempt || null, details };
    job.events.push(entry); return entry;
  }
  change(job, entity, to) {
    const from = entity.status;
    transition(entity, to);
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
  details(id) { const job = this.getJob(id); return { ...job, artifacts: this.artifacts.list(id) }; }
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
        acceptanceCriteria: item.acceptanceCriteria, allowedTools: [], contextBudget: { maxInputTokens: 2000, maxRetrievedSources: 0 },
        timeout: 30000, status: 'QUEUED', priority: 0, attempt: 0, maxAttempts: item.maxAttempts ?? 2,
        result: null, issues: [], validations: [], runs: [], repairGuidance: null,
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
      while (job.tasks.some(task => task.status !== 'COMPLETED')) {
        const ready = this.runnable(job);
        if (!ready.length) { this.fail(job, 'No runnable task remains.'); break; }
        const task = ready[0];
        await this.runTask(job, task);
        if (task.status === 'FAILED') { this.fail(job, `Task failed: ${task.title}`); break; }
      }
      if (job.status !== 'FAILED') {
        this.change(job, job, 'VALIDATING');
        this.event(job, 'FINAL_REVIEW_STARTED');
        const review = await withTimeout(this.agents.get(this.reviewerId).execute({ job, artifacts: this.artifacts.list(id) }), 30000);
        job.finalReview = review;
        if (review.status === 'completed' && review.data?.passed === true) {
          this.event(job, 'FINAL_REVIEW_PASSED'); this.change(job, job, 'COMPLETED'); this.event(job, 'JOB_COMPLETED');
        } else this.fail(job, review.summary || 'Final review failed.');
      }
      this.store.saveJob(job);
      return this.details(id);
    } catch (cause) {
      const activeTask = job.tasks.find(task => task.taskId === job.currentTaskId);
      if (activeTask && ['PLANNING', 'RUNNING', 'VALIDATING', 'REVISING'].includes(activeTask.status)) this.change(job, activeTask, 'FAILED');
      if (!['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status)) this.fail(job, cause.message);
      this.store.saveJob(job);
      throw cause;
    } finally { job.currentTaskId = null; this.active.delete(id); }
  }
  fail(job, reason) {
    job.failureReason = reason;
    this.change(job, job, 'FAILED'); this.event(job, 'JOB_FAILED', null, { reason });
  }
  async runTask(job, task) {
    let previousSignature = null;
    while (task.attempt < task.maxAttempts && job.iteration < job.maxIterations) {
      task.attempt++; job.iteration++; job.currentTaskId = task.taskId;
      this.change(job, task, 'RUNNING');
      this.event(job, 'TASK_STARTED', task); this.event(job, 'AGENT_SELECTED', task, { agentId: task.assignedAgent });
      this.event(job, 'TASK_ATTEMPT_STARTED', task);
      const run = { runId: randomUUID(), attempt: task.attempt, startedAt: now(), completedAt: null, result: null, validation: null, repairGuidance: task.repairGuidance };
      task.runs.push(run);
      const context = {
        task: { taskId: task.taskId, key: task.key, objective: task.objective, requiredInputs: task.requiredInputs, expectedOutputs: task.expectedOutputs, allowedTools: task.allowedTools, contextBudget: task.contextBudget },
        attempt: task.attempt, projectState: { projectId: job.projectId }, retrievedKnowledge: [],
        artifactReferences: this.artifacts.list(job.jobId).map(item => item.artifactId),
        previousResults: job.tasks.filter(item => item.status === 'COMPLETED').map(item => ({ key: item.key, data: item.result?.data })),
        repairGuidance: task.repairGuidance
      };
      const result = await withTimeout(this.agents.get(task.assignedAgent).execute(context), task.timeout);
      if (result?.status !== 'completed') throw new Error(`Agent ${task.assignedAgent} did not complete.`);
      run.result = result; task.result = result; this.event(job, 'TASK_RESULT_RECEIVED', task, { summary: result.summary });
      this.change(job, task, 'VALIDATING'); this.event(job, 'VALIDATION_STARTED', task);
      const validation = this.validate(result, task.acceptanceCriteria);
      run.validation = validation; run.completedAt = now(); task.validations.push(validation);
      if (validation.status === 'pass') {
        this.event(job, 'VALIDATION_PASSED', task, { evaluationId: validation.evaluationId });
        for (const output of result.artifacts || []) this.artifacts.register({ job, task, agentId: task.assignedAgent, output });
        this.change(job, task, 'COMPLETED'); this.event(job, 'TASK_COMPLETED', task);
        job.currentTaskId = null; return;
      }
      this.event(job, 'VALIDATION_FAILED', task, { evaluationId: validation.evaluationId });
      task.issues.push(...validation.issues); job.issues.push(...validation.issues);
      for (const item of validation.issues) this.event(job, 'ISSUE_CREATED', task, { issueId: item.issueId, type: item.type });
      const signature = validation.issues.map(item => item.type).join('|');
      if (task.attempt >= task.maxAttempts || job.iteration >= job.maxIterations || signature === previousSignature) break;
      previousSignature = signature;
      this.change(job, task, 'REVISING'); this.event(job, 'CRITIC_STARTED', task);
      const critique = await withTimeout(this.agents.get(this.criticId).execute({ task: { objective: task.objective }, previousResult: result, validation, attempt: task.attempt }), task.timeout);
      if (critique.status !== 'completed' || !critique.data?.repairInstructions?.length) throw new Error('Critic did not provide repair guidance.');
      task.repairGuidance = critique.data;
      this.event(job, 'REPAIR_GUIDANCE_CREATED', task, { diagnosis: critique.data.diagnosis });
      this.event(job, 'TASK_RETRY', task, { nextAttempt: task.attempt + 1 });
    }
    this.change(job, task, 'FAILED');
    job.currentTaskId = null;
  }
}
