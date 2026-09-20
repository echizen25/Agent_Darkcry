const acceptsMessage = input => typeof input?.message === 'string' && input.message.length > 0 && input.message.length <= 100;
const base = { capabilities: ['demo'], allowedAgentTypes: ['Worker'], validateInput: acceptsMessage };

export const demoEchoTool = {
  ...base, id: 'demo.echo', name: 'Demo Echo', description: 'Returns a short message without side effects.', riskLevel: 'SAFE', requiresApproval: false,
  async execute(input) { return { status: 'success', data: { message: input.message }, artifacts: [], metadata: { simulated: true } }; }
};
export const demoControlledTool = {
  ...base, id: 'demo.controlledAction', name: 'Demo Controlled Action', description: 'Simulates a scoped controlled operation.', riskLevel: 'CONTROLLED', requiresApproval: false,
  async execute(input) { return { status: 'success', data: { message: input.message, performed: 'simulated' }, artifacts: [], metadata: { simulated: true } }; }
};
export const demoApprovalTool = {
  ...base, id: 'demo.approvalAction', name: 'Demo Approval Action', description: 'Simulates a high-risk action after approval.', riskLevel: 'HIGH_RISK', requiresApproval: true,
  async execute(input) { return { status: 'success', data: { message: input.message, performed: 'simulated' }, artifacts: [], metadata: { simulated: true } }; }
};
export function registerDemoTools(registry) { [demoEchoTool, demoControlledTool, demoApprovalTool].forEach(tool => registry.register(tool)); return registry; }
