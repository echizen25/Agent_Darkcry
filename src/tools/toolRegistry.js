export const RISK_LEVELS = Object.freeze(['SAFE', 'CONTROLLED', 'HIGH_RISK']);

export class ToolRegistry {
  constructor() { this.tools = new Map(); }
  register(tool) {
    if (!tool?.id || !tool.name || !RISK_LEVELS.includes(tool.riskLevel) || !Array.isArray(tool.capabilities) || !Array.isArray(tool.allowedAgentTypes) || typeof tool.validateInput !== 'function' || typeof tool.execute !== 'function') throw new Error('Invalid tool definition.');
    if (this.tools.has(tool.id)) throw new Error(`Tool already registered: ${tool.id}`);
    this.tools.set(tool.id, tool); return tool;
  }
  get(id) { return this.tools.get(id) || null; }
  exists(id) { return this.tools.has(id); }
  list() { return [...this.tools.values()].map(({ id, name, description, capabilities, riskLevel, allowedAgentTypes, requiresApproval }) => ({ id, name, description, capabilities, riskLevel, allowedAgentTypes, requiresApproval })); }
  withCapability(capability) { return this.list().filter(tool => tool.capabilities.includes(capability)); }
}
