import { randomUUID } from 'node:crypto';
import { estimateTokens } from '../knowledge/chunker.js';

export class ModelGateway {
  constructor({ registry, timeoutMs = 10000 }) { this.registry = registry; this.timeoutMs = timeoutMs; this.providers = new Map(); this.calls = []; this.events = []; }
  registerProvider(provider) {
    if (!provider?.id || typeof provider.generate !== 'function' || typeof provider.embed !== 'function' || this.providers.has(provider.id)) throw new Error('Invalid or duplicate model provider.');
    this.providers.set(provider.id, provider); return provider;
  }
  providersList() { return [...this.providers.values()].map(item => ({ id: item.id, capabilities: item.capabilities || [] })); }
  async health() { return Promise.all([...this.providers.values()].map(async provider => ({ providerId: provider.id, available: await provider.health().catch(() => false) }))); }
  async models() { return this.registry.list(); }
  async request({ capability = 'chat', modelId, providerMode = 'local', messages, prompt, systemInstruction, temperature, maxOutputTokens, responseFormat, timeout, metadata = {}, projectId = null, jobId = null, taskId = null, agentId = null, purpose = 'GENERAL' }) {
    const started = Date.now();
    const record = { modelCallId: randomUUID(), projectId, jobId, taskId, agentId, provider: null, model: modelId || null, purpose, startedAt: new Date().toISOString(), completedAt: null, durationMs: null, status: 'RUNNING', estimatedInputTokens: estimateTokens(JSON.stringify(messages || prompt || '')), usage: null, errorCode: null };
    this.calls.push(record); this.events.push({ type: 'MODEL_REQUEST_STARTED', modelCallId: record.modelCallId });
    try {
      if (!['local', 'openai', 'auto'].includes(providerMode)) throw Object.assign(new Error('Invalid provider mode.'), { code: 'PROVIDER_MODE_INVALID' });
      const candidates = this.registry.list().filter(item => item.enabled && item.capabilities.includes(capability));
      const local = candidates.find(item => item.providerId === 'ollama');
      const cloud = candidates.find(item => item.providerId === 'openai');
      let selectedId = modelId;
      if (!selectedId && providerMode === 'openai') selectedId = cloud?.modelId;
      if (!selectedId && providerMode === 'local') selectedId = local?.modelId;
      if (!selectedId && providerMode === 'auto') selectedId = local && await this.providers.get(local.providerId)?.health?.().catch(() => false) ? local.modelId : cloud?.modelId || local?.modelId;
      if (providerMode === 'openai' && !selectedId) throw Object.assign(new Error('OpenAI API provider is not configured.'), { code: 'PROVIDER_NOT_CONFIGURED' });
      const model = this.registry.resolve({ modelId: selectedId, capability });
      if (providerMode === 'openai' && model.providerId !== 'openai') throw Object.assign(new Error('OpenAI API provider is not configured.'), { code: 'PROVIDER_NOT_CONFIGURED' });
      if (providerMode === 'local' && model.providerId === 'openai') throw Object.assign(new Error('Local provider is not configured.'), { code: 'PROVIDER_NOT_CONFIGURED' });
      record.model = model.modelId; record.provider = model.providerId;
      const provider = this.providers.get(model.providerId);
      if (!provider) throw Object.assign(new Error('Model provider unavailable.'), { code: 'PROVIDER_UNAVAILABLE' });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout || this.timeoutMs);
      let raw;
      try {
        const call = provider.generate({ model: model.modelId, messages, prompt, systemInstruction, temperature: temperature ?? model.defaultTemperature ?? 0, maxOutputTokens, responseFormat, metadata, signal: controller.signal });
        raw = await Promise.race([call, new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(Object.assign(new Error('Model timed out.'), { name: 'AbortError' })), { once: true }))]);
      }
      finally { clearTimeout(timer); }
      if (typeof raw?.content !== 'string') throw Object.assign(new Error('Model response has no text.'), { code: 'INVALID_MODEL_RESPONSE' });
      record.status = 'SUCCESS'; record.usage = raw.usage || null;
      return { status: 'success', provider: model.providerId, model: model.modelId, content: raw.content, usage: { inputTokens: raw.usage?.inputTokens ?? null, outputTokens: raw.usage?.outputTokens ?? null, totalTokens: raw.usage?.totalTokens ?? null }, timing: { durationMs: Date.now() - started }, metadata: raw.metadata || {} };
    } catch (cause) {
      const code = cause.name === 'AbortError' ? 'MODEL_TIMEOUT' : cause.code || 'PROVIDER_UNAVAILABLE';
      record.status = 'ERROR'; record.errorCode = code;
      return { status: 'error', error: { code, message: code === 'MODEL_TIMEOUT' ? 'Model request timed out.' : ['MODEL_NOT_FOUND', 'PROVIDER_NOT_CONFIGURED', 'PROVIDER_MODE_INVALID'].includes(code) ? cause.message : 'Model provider request failed.' } };
    } finally {
      record.completedAt = new Date().toISOString(); record.durationMs = Date.now() - started;
      this.events.push({ type: record.status === 'SUCCESS' ? 'MODEL_REQUEST_COMPLETED' : 'MODEL_REQUEST_FAILED', modelCallId: record.modelCallId, errorCode: record.errorCode });
    }
  }
}
