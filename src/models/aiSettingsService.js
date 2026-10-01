const PROVIDERS = new Set(['local', 'openai', 'auto']);
export const AI_ROLES = ['general', 'planner', 'research', 'development', 'review', 'critic'];
const safeName = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value) && !value.includes('..') && !/[;&|`$<>\\]/.test(value);
const fail = (code, message) => Object.assign(new Error(message), { code, status: 400 });

export class AiSettingsService {
  constructor({ registry, defaults = {}, maxEvents = 100 }) {
    this.registry = registry; this.maxEvents = maxEvents; this.events = [];
    this.value = { runtimeProvider: defaults.runtimeProvider || 'local', roles: Object.fromEntries(AI_ROLES.map(role => [role, defaults.roles?.[role] || null])), embedding: { provider: defaults.embedding?.provider || 'ollama', model: defaults.embedding?.model || null }, limits: { maxModelCallsPerJob: defaults.limits?.maxModelCallsPerJob || 12, maxRepairAttempts: defaults.limits?.maxRepairAttempts || 3, maxLabComparisons: defaults.limits?.maxLabComparisons || 2, maxOutputTokens: defaults.limits?.maxOutputTokens || 1200 } };
  }
  public() { return structuredClone(this.value); }
  audit(type, field, oldValue, newValue) { this.events.push({ type, field, oldValue, newValue, timestamp: new Date().toISOString() }); if (this.events.length > this.maxEvents) this.events.shift(); }
  validateModel(modelId, capability) {
    if (!safeName(modelId)) throw fail('INVALID_MODEL', 'Invalid model name.');
    const model = this.registry.get(modelId);
    if (!model?.enabled) throw fail('MODEL_NOT_AVAILABLE', 'Model is not registered and available.');
    if (!model.capabilities.includes(capability)) throw fail('MODEL_CAPABILITY_MISMATCH', `Model does not support ${capability}.`);
    return model;
  }
  update(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('INVALID_SETTINGS', 'Settings must be an object.');
    const next = this.public(), changes = [];
    if (input.runtimeProvider !== undefined) { if (!PROVIDERS.has(input.runtimeProvider)) throw fail('INVALID_PROVIDER', 'Invalid runtime provider.'); changes.push(['AI_PROVIDER_CHANGED', 'runtimeProvider', next.runtimeProvider, input.runtimeProvider]); next.runtimeProvider = input.runtimeProvider; }
    if (input.roles !== undefined) {
      if (!input.roles || typeof input.roles !== 'object' || Array.isArray(input.roles)) throw fail('INVALID_ROLE_ASSIGNMENTS', 'Roles must be an object.');
      for (const [role, modelId] of Object.entries(input.roles)) { if (!AI_ROLES.includes(role)) throw fail('INVALID_ROLE', 'Invalid runtime role.'); this.validateModel(modelId, 'chat'); changes.push(['ROLE_MODEL_CHANGED', `roles.${role}`, next.roles[role], modelId]); next.roles[role] = modelId; }
    }
    if (input.embedding !== undefined) {
      if (input.embedding?.provider !== 'ollama') throw fail('INVALID_PROVIDER', 'Embedding provider is not available.');
      this.validateModel(input.embedding.model, 'embedding'); changes.push(['EMBEDDING_MODEL_CHANGED', 'embedding.model', next.embedding.model, input.embedding.model]); next.embedding = { provider: 'ollama', model: input.embedding.model };
    }
    if (input.limits !== undefined) for (const [key, value] of Object.entries(input.limits)) { if (!Object.hasOwn(next.limits, key) || !Number.isInteger(value) || value < 1 || value > 10000) throw fail('INVALID_LIMIT', 'Invalid runtime limit.'); next.limits[key] = value; }
    this.value = next; for (const change of changes) if (change[2] !== change[3]) this.audit(...change); return this.public();
  }
}
export const isSafeModelName = safeName;
