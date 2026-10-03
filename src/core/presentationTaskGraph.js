import path from 'node:path';
import { rm } from 'node:fs/promises';
import { fingerprint, validatePresentationIR, invalid } from '../presentations/presentationCore.js';
import { renderPptx, validatePptx } from '../presentations/pptxRenderer.js';
import { inputDigest } from '../tools/approvalService.js';

const definitions = [ ['plan', 'PRESENTATION_PLAN', 'planner'], ['research', 'PRESENTATION_RESEARCH', 'research'], ['evidence', 'EVIDENCE_BUILD', 'evidence'], ['narrative', 'NARRATIVE_ARCHITECTURE', 'narrative'], ['storyboard', 'STORYBOARD', 'storyboard'], ['content', 'SLIDE_CONTENT', 'writer'], ['visual', 'VISUAL_PLAN', 'visual'], ['grounding', 'GROUNDING_CHECK', 'grounding'], ['review', 'PRESENTATION_REVIEW', 'reviewer'], ['qa', 'SLIDE_QA', 'qa'], ['approval', 'PRESENTATION_APPROVAL', 'approval'], ['render', 'PPTX_RENDER', 'renderer'], ['pptxQa', 'PPTX_QA', 'pptxQa'], ['final', 'FINAL_REVIEW', 'finalReviewer'] ];
const result = (summary, data, artifacts = []) => ({ status: 'completed', summary, data, artifacts });
export class PresentationTaskGraph {
  constructor(core, { root }) { this.core = core; this.root = root; }
  definition(key, type, id, previous = []) { return { key, type, title: type.replaceAll('_', ' '), objective: type, assignedAgent: `presentation.${id}`, dependsOn: previous, acceptanceCriteria: [{ validatorId: 'result.nonEmpty', params: { field: 'summary' } }], allowedTools: [], maxAttempts: 1, contextBudget: { maxInputTokens: 7000, maxRetrievedSources: 30 } }; }
  context(job, task) { return { request: job.metadata.presentation, projectId: job.projectId, jobId: job.jobId, taskId: task.taskId, ...job.presentationState }; }
  async stage(job, key, input = {}, action = null) {
    const task = job.tasks.find(t => t.key === key);
    if (!task || task.dependencies.some(id => job.tasks.find(t => t.taskId === id)?.status !== 'COMPLETED')) throw invalid('Presentation task dependency is incomplete.');
    job.currentTaskId = task.taskId; this.core.change(job, task, 'PLANNING'); this.core.change(job, task, 'READY'); this.core.change(job, task, 'RUNNING'); task.attempt++;
    const started = performance.now(), context = { ...this.context(job, task), ...input };
    const output = await (action ? action(context) : this.core.agents.get(task.assignedAgent).execute(context));
    if (output.status !== 'completed') throw invalid('Presentation stage did not complete.');
    task.result = output; this.core.change(job, task, 'VALIDATING');
    const evaluated = this.core.evaluation.evaluate({ result: { ...output, data: { ...output.data, summary: output.summary } }, criteria: task.acceptanceCriteria });
    if (evaluated.status !== 'pass') throw invalid('Stage result failed Evaluation Core.');
    task.validations.push(evaluated);
    for (const artifact of output.artifacts || []) this.core.artifacts.register({ job, task, agentId: task.assignedAgent, output: artifact });
    this.core.change(job, task, 'COMPLETED'); job.presentationState.performance[key] = performance.now() - started;
    Object.assign(job.presentationState, output.data); this.core.store.saveJob(job); return output.data;
  }
  async extra(job, key, type, id, input = {}, action = null) {
    const previous = job.tasks.filter(t => t.status === 'COMPLETED').at(-1);
    const [task] = this.core.makeTasks(job, [this.definition(key, type, id)]); task.dependencies = previous ? [previous.taskId] : [];
    job.tasks.splice(job.tasks.findIndex(t => t.key === 'approval'), 0, task);
    return this.stage(job, key, input, action);
  }
  async qa(job, key = 'qa') { const action = context => { const qa = validatePresentationIR(context.ir, context.specification, context.evidencePack); return result('Deterministic slide QA completed.', { qa }, [{ type: 'PRESENTATION_QA', value: qa }]); }; return key === 'qa' ? this.stage(job, key, {}, action) : this.extra(job, key, 'RE_EVALUATION', 'qa', {}, action); }
  snapshot(job) { const s = job.presentationState; s.fingerprint = fingerprint(s.ir); s.revisions.push({ revision: s.revision, fingerprint: s.fingerprint, grounding: s.grounding.status, review: s.status, qa: s.qa.status }); s.metrics = { ...s.metrics, evidenceItems: s.evidencePack.items.length, evidenceTokens: s.evidencePack.estimatedTokens, narrativeTokens: this.core.contextBudget.estimate(s.narrativePlan), storyboardTokens: this.core.contextBudget.estimate(s.storyboard), slideTokens: this.core.contextBudget.estimate(s.ir), pressure: s.evidencePack.pressure, retries: s.revision - 1 }; }
  async start(job) {
    job.tasks = this.core.makeTasks(job, definitions.map(([key, type, id], i) => this.definition(key, type, id, i ? [definitions[i - 1][0]] : [])));
    job.presentationState = { revision: 1, revisions: [], performance: {}, metrics: {} }; job.metadata.presentation.deadline = Date.now() + 60000;
    this.core.change(job, job, 'PLANNING'); this.core.change(job, job, 'READY'); this.core.change(job, job, 'RUNNING');
    for (const key of ['plan', 'research', 'evidence', 'narrative', 'storyboard', 'content', 'visual', 'grounding', 'review']) {
      await this.stage(job, key);
      if (key === 'narrative' || key === 'storyboard') job.presentationState[`${key}ArtifactId`] = this.core.artifacts.list(job.jobId).at(-1)?.artifactId;
    }
    await this.qa(job); this.snapshot(job);
    const state = job.presentationState;
    let issues = [...state.grounding.issues, ...state.issues, ...state.qa.issues];
    while (issues.length && state.revision < 3) {
      const before = state.fingerprint, priorIR = structuredClone(state.ir), affectedSlideIds = [...new Set(issues.map(i => String(i.location || '').split('/')[0]).filter(id => state.ir.slides.some(s => s.id === id)))];
      // Unknown/global issues require a bounded full-deck repair.
      const targets = affectedSlideIds.length ? affectedSlideIds : state.ir.slides.map(s => s.id), revision = state.revision + 1;
      const guidance = await this.extra(job, `critic-${revision}`, 'PRESENTATION_CRITIC', 'critic', { issues, revision });
      if (guidance.needsResearch) { await this.extra(job, `research-${revision}`, 'TARGETED_RESEARCH', 'research', { feedback: guidance }); await this.extra(job, `evidence-${revision}`, 'EVIDENCE_BUILD', 'evidence'); }
      await this.extra(job, `revision-${revision}`, 'TARGETED_REVISION', 'writer', { revision, previousIR: priorIR, affectedSlideIds: targets, feedback: guidance });
      await this.extra(job, `visual-${revision}`, 'VISUAL_PLAN', 'visual', { affectedSlideIds: targets });
      state.revision = revision;
      if (fingerprint({ ...state.ir, metadata: { ...state.ir.metadata, revision: 1 } }) === fingerprint({ ...priorIR, metadata: { ...priorIR.metadata, revision: 1 } })) { state.noProgress = { detected: true, fingerprint: before }; job.failureReason = 'PRESENTATION_NO_PROGRESS'; this.core.change(job, job, 'FAILED'); return this.core.details(job.jobId); }
      await this.extra(job, `grounding-${revision}`, 'GROUNDING_CHECK', 'grounding'); await this.extra(job, `review-${revision}`, 'PRESENTATION_REVIEW', 'reviewer'); await this.qa(job, `qa-${revision}`); this.snapshot(job);
      issues = [...state.grounding.issues, ...state.issues, ...state.qa.issues];
    }
    if (issues.length) { job.failureReason = 'PRESENTATION_REVISION_LIMIT'; this.core.change(job, job, 'FAILED'); return this.core.details(job.jobId); }
    const task = job.tasks.find(t => t.key === 'approval'); task.dependencies = [job.tasks.filter(t => t.status === 'COMPLETED').at(-1).taskId];
    this.core.change(job, task, 'PLANNING'); this.core.change(job, task, 'READY'); this.core.change(job, task, 'RUNNING'); task.attempt++;
    const binding = this.binding(job), approval = this.core.approvals.create({ job, task, agent: { id: 'presentation.approval' }, tool: { id: 'presentation.render', riskLevel: 'CONTROLLED' }, action: 'render-approved-presentation', input: binding, reason: 'Approve the exact grounded presentation revision before rendering and release.' });
    approval.requestPreview = { ...binding, summary: state.specification.title, slides: state.ir.slides.length, qa: state.qa.status, grounding: state.grounding.status, review: state.status };
    task.pendingApprovalId = approval.approvalId; task.approvalReturnState = 'RUNNING'; job.approvalReturnState = 'RUNNING'; this.core.change(job, task, 'WAITING_FOR_APPROVAL'); this.core.change(job, job, 'WAITING_FOR_APPROVAL'); this.core.store.saveJob(job);
    return this.core.details(job.jobId);
  }
  binding(job) { const state = job.presentationState, request = job.metadata.presentation; return { projectId: job.projectId, missionId: request.missionId, runId: request.runId, revision: state.revision, fingerprint: fingerprint(state.ir) }; }
  async validateApproval(job, approval) {
    const state = job.presentationState, current = this.binding(job), qa = validatePresentationIR(state.ir, state.specification, state.evidencePack);
    if (approval.projectId !== job.projectId || approval.jobId !== job.jobId || approval.inputDigest !== inputDigest(current) || state.fingerprint !== current.fingerprint || state.ir.metadata.revision !== state.revision || qa.status !== 'PASS' || state.status !== 'PASS') throw Object.assign(invalid('Presentation changed after approval was requested.'), { code: 'STALE_PRESENTATION_APPROVAL', status: 409 });
  }
  async continue(job, task) {
    const state = job.presentationState, approval = this.core.approvals.get(task.pendingApprovalId), request = job.metadata.presentation;
    await this.validateApproval(job, approval); approval.consumedAt = new Date().toISOString(); task.pendingApprovalId = null; this.core.change(job, task, 'VALIDATING'); this.core.change(job, task, 'COMPLETED'); request.deadline = Date.now() + 15000;
    const outputDir = path.join(this.root, 'data', 'artifacts', job.projectId, request.missionId, request.runId);
    await this.stage(job, 'render', {}, async () => result('Approved editable PPTX rendered.', { file: await renderPptx({ ir: state.ir, specification: state.specification, evidencePack: state.evidencePack, outputDir }) }));
    await this.stage(job, 'pptxQa', {}, async () => result('PPTX structural QA completed.', { pptxQa: await validatePptx(state.file.path, state.ir) }));
    let passed = false;
    try { const final = await this.stage(job, 'final', { approval }); passed = final.passed; }
    finally { if (!passed) await rm(state.file.path, { force: true }); }
    job.finalReview = result(passed ? 'Final presentation review passed.' : 'Final presentation review failed.', { passed });
    if (passed) { this.core.artifacts.register({ job, task: job.tasks.find(t => t.key === 'render'), agentId: 'presentation.renderer', output: { type: 'PRESENTATION_FILE', path: state.file.path, value: { ...state.file, path: undefined, projectId: job.projectId, missionId: request.missionId, runId: request.runId, createdAt: new Date().toISOString() } } }); this.core.change(job, job, 'VALIDATING'); this.core.change(job, job, 'COMPLETED'); }
    else { job.failureReason = 'PRESENTATION_FINAL_REVIEW_FAILED'; this.core.change(job, job, 'FAILED'); }
    this.core.store.saveJob(job); return this.core.details(job.jobId);
  }
}
