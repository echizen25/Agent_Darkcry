const meta = (id, role) => ({ id, name: id, role, capabilities: ['demo'], allowedTools: [] });

export const demoPlanner = {
  ...meta('demo.planner', 'Planner'),
  async execute() {
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
  async execute({ validation }) {
    return { status: 'completed', summary: 'Repair guidance created.', data: {
      diagnosis: validation.issues.map(item => item.description).join(' '),
      repairInstructions: validation.issues.map(item => item.suggestedAction)
    }, artifacts: [], evidence: [], issues: [], recommendedNextActions: [] };
  }
};

export const demoFinalReviewer = {
  ...meta('demo.finalReviewer', 'Final Reviewer'),
  async execute({ job, artifacts }) {
    const pass = job.tasks.length > 0 && job.tasks.every(task => task.status === 'COMPLETED' && task.validations.at(-1)?.status === 'pass') && artifacts.some(item => item.type === 'demo-text' && item.validationStatus === 'passed');
    return { status: pass ? 'completed' : 'failed', summary: pass ? 'All tasks and demo artifact passed final review.' : 'Required task or artifact is missing.', data: { passed: pass }, artifacts: [], evidence: [], issues: pass ? [] : [{ type: 'final_review_failed', description: 'A required task or artifact did not pass.' }], recommendedNextActions: [] };
  }
};

export function registerDemoAgents(registry) { [demoPlanner, demoWorker, demoCritic, demoFinalReviewer].forEach(agent => registry.register(agent)); return registry; }
