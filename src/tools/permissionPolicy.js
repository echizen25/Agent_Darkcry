export class PermissionPolicy {
  evaluate({ agent, task, tool, projectId, approval }) {
    if (!tool) return { decision: 'DENY', reason: 'Tool is not registered.' };
    if (!task?.allowedTools?.includes(tool.id)) return { decision: 'DENY', reason: 'Tool is not included in task allowedTools.' };
    if (!agent?.allowedTools?.includes(tool.id)) return { decision: 'DENY', reason: 'Tool is not included in agent allowedTools.' };
    if (!tool.allowedAgentTypes.includes(agent.role)) return { decision: 'DENY', reason: 'Agent role is not allowed to use this tool.' };
    if (!projectId || task.projectId !== projectId) return { decision: 'DENY', reason: 'Project scope does not match the task.' };
    if (tool.riskLevel === 'CONTROLLED' && task.scope?.controlledAllowed !== true) return { decision: 'DENY', reason: 'Controlled scope was not granted.' };
    if (tool.riskLevel === 'HIGH_RISK' || tool.requiresApproval) {
      if (approval?.status === 'APPROVED' && !approval.consumedAt) return { decision: 'ALLOW', reason: 'Exact tool action was approved.' };
      if (approval?.status === 'DENIED') return { decision: 'DENY', reason: 'Approval was denied.' };
      return { decision: 'REQUIRE_APPROVAL', reason: 'High-risk tool action requires human approval.' };
    }
    return { decision: 'ALLOW', reason: 'Tool is permitted in this task and project scope.' };
  }
}
