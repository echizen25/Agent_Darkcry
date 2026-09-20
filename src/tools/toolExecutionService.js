import { randomUUID } from 'node:crypto';
import { inputDigest } from './approvalService.js';

const responseError = (code, message) => ({ status: 'error', error: { code, message } });

export class ToolExecutionService {
  constructor({ registry, policy, approvals, store }) { this.registry = registry; this.policy = policy; this.approvals = approvals; this.store = store; }
  async request({ job, task, agent, toolId, action, input, approvalId = null, emit = () => {} }) {
    const tool = this.registry.get(toolId);
    const approval = approvalId ? this.approvals.get(approvalId) : null;
    const run = {
      toolRunId: randomUUID(), projectId: job.projectId, jobId: job.jobId, taskId: task.taskId,
      agentId: agent.id, toolId, requestedAt: new Date().toISOString(), startedAt: null, completedAt: null,
      permissionDecision: null, approvalId, status: 'REQUESTED', resultSummary: null, errorCode: null
    };
    this.store.createToolRun(run); emit('TOOL_REQUESTED', { toolRunId: run.toolRunId, toolId });
    const finish = (status, code = null, summary = null) => { run.status = status; run.errorCode = code; run.resultSummary = summary; run.completedAt = new Date().toISOString(); };
    const decision = this.policy.evaluate({ agent, task, tool, projectId: job.projectId, approval });
    run.permissionDecision = decision.decision;
    if (decision.decision === 'DENY') {
      finish('DENIED', 'PERMISSION_DENIED', decision.reason);
      emit('TOOL_PERMISSION_DENIED', { toolRunId: run.toolRunId, reason: decision.reason });
      return responseError('PERMISSION_DENIED', decision.reason);
    }
    if (tool && !tool.validateInput(input)) {
      finish('ERROR', 'INVALID_INPUT', 'Tool input is invalid.');
      emit('TOOL_EXECUTION_FAILED', { toolRunId: run.toolRunId, errorCode: 'INVALID_INPUT' });
      return responseError('INVALID_INPUT', 'Tool input is invalid.');
    }
    if (approval && (approval.jobId !== job.jobId || approval.taskId !== task.taskId || approval.agentId !== agent.id || approval.toolId !== toolId || approval.requestedAction !== action || approval.inputDigest !== inputDigest(input))) {
      finish('DENIED', 'APPROVAL_SCOPE_MISMATCH', 'Approval does not match this action.');
      emit('TOOL_PERMISSION_DENIED', { toolRunId: run.toolRunId, reason: 'Approval scope mismatch.' });
      return responseError('APPROVAL_SCOPE_MISMATCH', 'Approval does not match this action.');
    }
    if (decision.decision === 'REQUIRE_APPROVAL') {
      const pending = approval?.status === 'PENDING' ? approval : this.approvals.create({ job, task, agent, tool, action, input, reason: decision.reason });
      run.approvalId = pending.approvalId; run.status = 'WAITING_FOR_APPROVAL';
      emit('APPROVAL_REQUESTED', { approvalId: pending.approvalId, toolRunId: run.toolRunId, toolId });
      return { status: 'pending', approvalId: pending.approvalId };
    }
    run.permissionDecision = 'ALLOW'; emit('TOOL_PERMISSION_ALLOWED', { toolRunId: run.toolRunId, toolId });
    run.startedAt = new Date().toISOString(); run.status = 'RUNNING'; emit('TOOL_EXECUTION_STARTED', { toolRunId: run.toolRunId, toolId });
    try {
      const result = await tool.execute(input, { job, task, agent });
      if (result?.status !== 'success') throw new Error('Tool returned an unsuccessful result.');
      if (approval) approval.consumedAt = new Date().toISOString();
      finish('SUCCESS', null, `${toolId} completed.`);
      emit('TOOL_EXECUTION_COMPLETED', { toolRunId: run.toolRunId, toolId });
      return result;
    } catch (cause) {
      const code = ['MODEL_NOT_FOUND', 'EMBEDDING_FAILED', 'VECTOR_STORE_UNAVAILABLE', 'VECTOR_DIMENSION_MISMATCH'].includes(cause.code) ? cause.code : 'TOOL_EXECUTION_FAILED';
      finish('ERROR', code, 'Tool execution failed.');
      emit('TOOL_EXECUTION_FAILED', { toolRunId: run.toolRunId, errorCode: code });
      return responseError(code, code === 'TOOL_EXECUTION_FAILED' ? 'Tool execution failed.' : cause.message);
    }
  }
}
