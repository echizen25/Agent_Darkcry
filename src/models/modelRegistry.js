export class ModelRegistry {
  constructor() { this.models = new Map(); }
  register(model) {
    if (!model?.modelId || !model.providerId || !Array.isArray(model.capabilities) || !Array.isArray(model.purposes) || typeof model.enabled !== 'boolean') throw new Error('Invalid model definition.');
    if (this.models.has(model.modelId)) throw new Error('Model already registered.');
    this.models.set(model.modelId, { ...model }); return model;
  }
  get(id) { return this.models.get(id) || null; }
  upsert(model) {
    if (!model?.modelId || !model.providerId || !Array.isArray(model.capabilities) || !Array.isArray(model.purposes) || typeof model.enabled !== 'boolean') throw new Error('Invalid model definition.');
    const current = this.models.get(model.modelId);
    this.models.set(model.modelId, current ? { ...current, ...model } : { ...model });
    return this.models.get(model.modelId);
  }
  list() { return [...this.models.values()]; }
  resolve({ modelId, capability }) {
    const model = modelId ? this.get(modelId) : this.list().find(item => item.enabled && item.capabilities.includes(capability));
    if (!model?.enabled || !model.capabilities.includes(capability)) throw Object.assign(new Error('Configured model is unavailable for this capability.'), { code: 'MODEL_NOT_FOUND', status: 503 });
    return model;
  }
}
