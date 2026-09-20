export class AgentRegistry {
  constructor() { this.agents = new Map(); }
  register(agent) {
    if (!agent?.id || typeof agent.execute !== 'function') throw new Error('Agent requires an ID and execute method.');
    if (this.agents.has(agent.id)) throw new Error(`Agent already registered: ${agent.id}`);
    this.agents.set(agent.id, agent);
    return agent;
  }
  get(id) { const agent = this.agents.get(id); if (!agent) throw new Error(`Unknown agent: ${id}`); return agent; }
  has(id) { return this.agents.has(id); }
  list() { return [...this.agents.values()].map(({ id, name, role, capabilities, allowedTools }) => ({ id, name, role, capabilities, allowedTools })); }
}
