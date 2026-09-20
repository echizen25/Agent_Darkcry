const meta = (id, role, allowedTools = []) => ({ id, name: id, role, capabilities: ['demo'], allowedTools });

export const demoPlanner = {
  ...meta('demo.planner', 'Planner'),
  async execute({ goal } = {}) {
    const toolId = { 'Run safe tool demo': 'demo.echo', 'Run controlled tool demo': 'demo.controlledAction', 'Run approval tool demo': 'demo.approvalAction' }[goal];
    if (toolId) return { status: 'completed', summary: 'One deterministic tool task planned.', data: { tasks: [
      { key: 'tool', type: 'demo-tool', title: 'Run demo tool', objective: 'Produce a validated demo artifact through an approved tool.', assignedAgent: 'demo.toolWorker', dependsOn: [], allowedTools: [toolId], scope: { controlledAllowed: toolId === 'demo.controlledAction' }, acceptanceCriteria: [{ validatorId: 'artifact.exists', params: { type: 'demo-text' } }, { validatorId: 'result.equals', params: { field: 'content', value: 'Validated demo artifact' } }], expectedOutputs: ['demo-text'] }
    ] }, artifacts: [], evidence: [], issues: [], recommendedNextActions: [] };
    return { status: 'completed', summary: 'Two dependent demo tasks planned.', data: { tasks: [
      { key: 'prepare', type: 'demo', title: 'Prepare demo content', objective: 'Produce complete demo content.', assignedAgent: 'demo.worker', dependsOn: [], acceptanceCriteria: [{ validatorId: 'result.minimumLength', params: { field: 'content', value: 10 } }], expectedOutputs: ['content'] },
      { key: 'finalize', type: 'demo', title: 'Finalize demo artifact', objective: 'Create the validated demo artifact.', assignedAgent: 'demo.worker', dependsOn: ['prepare'], acceptanceCriteria: [{ validatorId: 'artifact.exists', params: { type: 'demo-text' } }, { validatorId: 'result.equals', params: { field: 'content', value: 'Validated demo artifact' } }], expectedOutputs: ['demo-text'] }
    ] }, artifacts: [], evidence: [], issues: [], recommendedNextActions: [] };
  }
};

export const demoWorker = {
  ...meta('demo.worker', 'Worker'),
  async execute({ task, attempt, repairGuidance, previousResults }) {
    if (task.key === 'prepare') {
      const content = attempt === 1 ? '' : repairGuidance?.repairInstructions?.length ? 'Prepared complete demo content' : '';
      return { status: 'completed', summary: content ? 'Demo content prepared.' : 'Incomplete demo content.', data: { content }, artifacts: [], evidence: [], issues: [], recommendedNextActions: [] };
    }
    const prepared = previousResults.some(item => item.key === 'prepare' && item.data?.content);
    const content = prepared ? 'Validated demo artifact' : '';
    return { status: 'completed', summary: 'Demo artifact finalized.', data: { content }, artifacts: prepared ? [{ type: 'demo-text', value: content }] : [], evidence: [], issues: [], recommendedNextActions: [] };
  }
};

export const demoCritic = {
  ...meta('demo.critic', 'Critic'),
  async execute({ evaluation, validation }) {
    const checked = evaluation || validation;
    return { status: 'completed', summary: 'Repair guidance created.', data: {
      diagnosis: checked.issues.map(item => item.description).join(' '),
      repairInstructions: checked.issues.map(item => item.suggestedAction),
      retryRecommended: true
    }, artifacts: [], evidence: [], issues: [], recommendedNextActions: [] };
  }
};

export const demoToolWorker = {
  ...meta('demo.toolWorker', 'Worker', ['demo.echo', 'demo.controlledAction', 'demo.approvalAction']),
  async execute({ task, requestTool }) {
    const toolId = task.allowedTools[0];
    const response = await requestTool({ toolId, action: 'simulate', input: { message: 'Validated demo artifact' } });
    if (response.status === 'pending') return { status: 'waitingForApproval', approvalId: response.approvalId, summary: 'Awaiting approval.', data: {}, artifacts: [], evidence: [], issues: [], recommendedNextActions: [] };
    if (response.status !== 'success') return { status: 'failed', summary: response.error.message, data: {}, artifacts: [], evidence: [], issues: [], recommendedNextActions: [] };
    const content = response.data.message;
    return { status: 'completed', summary: 'Demo tool completed.', data: { content }, artifacts: [{ type: 'demo-text', value: content }], evidence: [], issues: [], recommendedNextActions: [] };
  }
};

export const demoFinalReviewer = {
  ...meta('demo.finalReviewer', 'Final Reviewer'),
  async execute({ job, artifacts, approvals = [] }) {
    const pass = job.tasks.length > 0 && job.tasks.every(task => task.status === 'COMPLETED' && task.validations.at(-1)?.status === 'pass') && artifacts.some(item => item.type === 'demo-text' && ['VALID', 'WARNING', 'passed'].includes(item.validationStatus)) && !job.issues.some(item => !item.resolvedAt && ['HIGH', 'CRITICAL'].includes(item.severity)) && !approvals.some(item => item.status === 'PENDING');
    return { status: pass ? 'completed' : 'failed', summary: pass ? 'All tasks and demo artifact passed final review.' : 'Required task or artifact is missing.', data: { passed: pass }, artifacts: [], evidence: [], issues: pass ? [] : [{ type: 'final_review_failed', description: 'A required task or artifact did not pass.' }], recommendedNextActions: [] };
  }
};

export function registerDemoAgents(registry) { [demoPlanner, demoWorker, demoToolWorker, demoCritic, demoFinalReviewer].forEach(agent => registry.register(agent)); return registry; }
