import { randomUUID, createHash } from 'node:crypto';

export const inputDigest = input => createHash('sha256').update(JSON.stringify(input)).digest('hex');

const error = (status, message) => Object.assign(new Error(message), { status });

export class ApprovalService {
  constructor(store) { this.store = store; }
  create({ job, task, agent, tool, action, input, reason }) {
    const approval = {
      approvalId: randomUUID(), projectId: job.projectId, jobId: job.jobId, taskId: task.taskId,
      agentId: agent.id, toolId: tool.id, requestedAction: action, inputDigest: inputDigest(input), reason, riskLevel: tool.riskLevel,
      status: 'PENDING', requestedAt: new Date().toISOString(), resolvedAt: null, requestPreview: input?.proposal ? { fingerprint: input.fingerprint, workspaceId: input.workspaceId, files: input.proposal.files.map(file => ({ path: file.path, operation: file.operation })), summary: input.proposal.summary } : null,
      resolution: null, resolvedBy: null, consumedAt: null
    };
    return this.store.createApproval(approval);
  }
  get(id) { const approval = this.store.getApproval(id); if (!approval) throw error(404, 'Approval not found.'); return approval; }
  list() { return this.store.listApprovals(); }
  resolve(id, decision, resolvedBy = 'local-user') {
    const approval = this.get(id);
    if (approval.status !== 'PENDING') throw error(409, 'Approval has already been resolved.');
    if (!['APPROVED', 'DENIED'].includes(decision)) throw error(400, 'Invalid approval decision.');
    approval.status = decision; approval.resolution = decision; approval.resolvedBy = resolvedBy; approval.resolvedAt = new Date().toISOString();
    return approval;
  }
}
