const providerId = mode => mode === 'openai' ? 'openai' : 'ollama';
const fail = (code, message) => Object.assign(new Error(message), { code, status: 503 });

export class ModelSelectionService {
  constructor({ registry, settings, providers }) { this.registry = registry; this.settings = settings; this.providers = providers; this.events = []; }
  async resolve({ role = 'general', capability = 'chat', providerMode, modelOverride } = {}) {
    const config = this.settings.public(), mode = providerMode || config.runtimeProvider;
    if (!['local', 'openai', 'auto'].includes(mode)) throw fail('PROVIDER_MODE_INVALID', 'Invalid provider mode.');
    let provider = providerId(mode), autoReason = null;
    if (mode === 'auto') { const local = this.providers.get('ollama'); const healthy = local ? await local.health().catch(() => false) : false; provider = healthy ? 'ollama' : this.providers.has('openai') ? 'openai' : null; if (!provider) throw fail('PROVIDER_UNAVAILABLE', 'No configured healthy provider is available.'); autoReason = healthy ? 'AUTO_HEALTHY_LOCAL' : 'AUTO_LOCAL_UNAVAILABLE'; }
    if (!this.providers.has(provider)) throw fail('PROVIDER_NOT_CONFIGURED', provider === 'openai' ? 'OpenAI API provider is not configured.' : 'Local provider is not configured.');
    const candidates = this.registry.list().filter(item => item.enabled && item.providerId === provider && item.capabilities.includes(capability));
    const requested = modelOverride || (capability === 'embedding' ? config.embedding.model : config.roles[role]);
    const general = capability === 'chat' ? config.roles.general : null;
    let model = requested && candidates.find(item => item.modelId === requested), reason = autoReason;
    if (!model && requested && general && requested !== general) { model = candidates.find(item => item.modelId === general); reason = 'ROLE_MODEL_MISSING_GENERAL_FALLBACK'; }
    if (!model) { model = candidates[0]; if (requested) reason ||= 'PROVIDER_DEFAULT_FALLBACK'; }
    if (!model) throw fail('MODEL_NOT_AVAILABLE', 'No eligible model is available.');
    const result = { requestedProvider: mode, requestedModel: requested || null, actualProvider: provider, actualModel: model.modelId, role, capability, fallback: Boolean(reason && !reason.startsWith('AUTO_HEALTHY')), reason };
    this.events.push({ type: result.fallback ? 'MODEL_FALLBACK' : 'MODEL_SELECTED', ...result, timestamp: new Date().toISOString() }); if (this.events.length > 200) this.events.shift();
    return result;
  }
}
