import { Router } from 'express';
import { MODEL_LAB_TASKS } from './modelLab.js';

const classify = (name, configuredChat, configuredEmbedding) => name === configuredEmbedding || /(^|[-_:])embed(ding)?/i.test(name) ? ['embedding'] : name === configuredChat ? ['chat'] : ['chat'];
const publicCall = call => ({ modelCallId: call.modelCallId, projectId: call.projectId, jobId: call.jobId, taskId: call.taskId, agentId: call.agentId, role: call.role, provider: call.provider, model: call.model, purpose: call.purpose, startedAt: call.startedAt, completedAt: call.completedAt, durationMs: call.durationMs, status: call.status, estimatedInputTokens: call.estimatedInputTokens, inputTokens: call.usage?.inputTokens ?? null, outputTokens: call.usage?.outputTokens ?? null, retry: call.retry, errorCode: call.errorCode, fallback: call.fallback });

export class AiControlCenter {
  constructor({ gateway, settings, selection, modelLab, knowledge, agentCore, config, fetchImpl = fetch, healthTtlMs = 5000 }) { this.gateway = gateway; this.settings = settings; this.selection = selection; this.modelLab = modelLab; this.knowledge = knowledge; this.agentCore = agentCore; this.config = config; this.fetch = fetchImpl; this.healthTtlMs = healthTtlMs; this.healthCache = null; }
  async discoverModels() {
    const ollama = this.gateway.providers.get('ollama');
    let installed = [];
    try { installed = await ollama.listModels(); } catch {}
    for (const name of installed) this.gateway.registry.upsert({ modelId: name, providerId: 'ollama', displayName: name, capabilities: classify(name, this.config.chatModel, this.config.embeddingModel), purposes: ['GENERAL'], enabled: true, availability: 'AVAILABLE' });
    return this.gateway.registry.list().map(item => ({ provider: item.providerId, name: item.modelId, capabilities: item.capabilities, availability: installed.includes(item.modelId) || item.providerId !== 'ollama' ? 'AVAILABLE' : 'UNAVAILABLE', enabled: item.enabled }));
  }
  async health({ refresh = false } = {}) {
    if (!refresh && this.healthCache && Date.now() - this.healthCache.at < this.healthTtlMs) return { ...this.healthCache.value, cached: true };
    const models = await this.discoverModels(), ollamaAvailable = await this.gateway.providers.get('ollama')?.health().catch(() => false) || false;
    let qdrant = { status: 'UNAVAILABLE', reachable: false, collection: this.config.collection, available: false, vectorDimension: null };
    try { const response = await this.fetch(`${this.config.qdrantUrl}/collections/${encodeURIComponent(this.config.collection)}`, { signal: AbortSignal.timeout(this.config.timeoutMs) }); const body = response.ok ? await response.json() : null; qdrant = { status: response.ok ? 'HEALTHY' : response.status === 404 ? 'DEGRADED' : 'UNAVAILABLE', reachable: response.status !== 0, collection: this.config.collection, available: response.ok, vectorDimension: body?.result?.config?.params?.vectors?.size ?? null }; } catch {}
    const embedding = models.find(item => item.name === this.settings.public().embedding.model && item.capabilities.includes('embedding'));
    const value = { ollama: { status: ollamaAvailable ? 'HEALTHY' : 'UNAVAILABLE', reachable: ollamaAvailable, installedModelCount: models.filter(item => item.provider === 'ollama' && item.availability === 'AVAILABLE').length }, qdrant, embedding: { status: ollamaAvailable && embedding?.availability === 'AVAILABLE' ? 'HEALTHY' : 'UNAVAILABLE', provider: 'ollama', model: this.settings.public().embedding.model, available: embedding?.availability === 'AVAILABLE' }, openai: { status: this.gateway.providers.has('openai') ? 'UNKNOWN' : 'NOT_CONFIGURED' }, codexDevelopment: { status: 'UNKNOWN', wording: 'Codex development environment status is not available to the application runtime.' }, headroom: { status: 'UNKNOWN', wording: 'Headroom status is diagnostic only and is not probed by the application runtime.' } };
    this.healthCache = { at: Date.now(), value }; return { ...value, cached: false };
  }
  usage() { const calls = this.gateway.calls.map(publicCall); return { totals: { modelCalls: calls.length, successful: calls.filter(item => item.status === 'SUCCESS').length, failed: calls.filter(item => item.status === 'ERROR').length, estimatedInputTokens: calls.reduce((sum, item) => sum + (item.estimatedInputTokens || 0), 0), providerInputTokens: calls.reduce((sum, item) => sum + (item.inputTokens || 0), 0), providerOutputTokens: calls.reduce((sum, item) => sum + (item.outputTokens || 0), 0), retries: calls.reduce((sum, item) => sum + (item.retry || 0), 0) }, calls: calls.slice(-50) }; }
  context() { const jobs = this.agentCore?.store?.listJobs?.() || []; const contexts = jobs.flatMap(job => job.artifacts || []).filter(item => item.type === 'DEVELOPMENT_CONTEXT'); const latest = contexts.at(-1)?.value; return latest ? { estimatedTokens: latest.budget?.estimatedTokens ?? null, files: latest.files?.length || 0, ranges: latest.files?.reduce((sum, file) => sum + (file.ranges?.length || 0), 0) || 0, symbols: latest.symbols?.length || 0, qdrantChunks: latest.knowledgeChunks?.length || 0, pressure: latest.budget?.pressure || 'UNKNOWN', paths: (latest.files || []).map(item => item.relativePath) } : { estimatedTokens: 0, files: 0, ranges: 0, symbols: 0, qdrantChunks: 0, pressure: 'UNKNOWN', paths: [] }; }
  status() { return { development: { codex: 'UNKNOWN', authentication: 'Not inspected by application', headroom: 'UNKNOWN', distinction: 'ChatGPT/Codex development authentication is separate from OpenAI API runtime authentication.' }, runtime: this.settings.public(), context: this.context() }; }
}

const sendError = (error, res) => res.status(error.status || 500).json({ error: { code: error.code || 'AI_CONTROL_ERROR', message: error.status ? error.message : 'AI control request failed.' } });
export function aiRouter(control) {
  const router = Router();
  router.get('/status', (_req, res) => res.json(control.status()));
  router.get('/settings', (_req, res) => res.json({ settings: control.settings.public(), persistence: 'PROCESS_LOCAL', events: control.settings.events.slice(-20) }));
  router.put('/settings', (req, res) => { try { res.json({ settings: control.settings.update(req.body), events: control.settings.events.slice(-20) }); } catch (error) { sendError(error, res); } });
  router.get('/models', async (_req, res) => { try { res.json({ models: await control.discoverModels() }); } catch (error) { sendError(error, res); } });
  router.get('/health', async (req, res) => { try { res.json(await control.health({ refresh: req.query.refresh === 'true' })); } catch (error) { sendError(error, res); } });
  router.get('/roles', (_req, res) => res.json({ roles: control.settings.public().roles, fallbackPolicy: ['role-specific model', 'general model', 'provider default'] }));
  router.get('/usage', (_req, res) => res.json(control.usage()));
  router.get('/context', (_req, res) => res.json(control.context()));
  router.get('/model-lab/history', (_req, res) => res.json({ results: control.modelLab.history }));
  router.post('/test', async (req, res) => { try { res.json(await control.modelLab.run({ model: req.body?.model, taskType: 'structured_json', providerMode: req.body?.providerMode || control.settings.public().runtimeProvider })); } catch (error) { sendError(error, res); } });
  router.post('/model-lab/compare', async (req, res) => { try { res.json(await control.modelLab.compare({ modelA: req.body?.modelA, modelB: req.body?.modelB, taskType: req.body?.taskType, providerMode: req.body?.providerMode || control.settings.public().runtimeProvider })); } catch (error) { sendError(error, res); } });
  router.get('/model-lab/tasks', (_req, res) => res.json({ taskTypes: MODEL_LAB_TASKS }));
  router.get('/export', (_req, res) => res.json({ exportedAt: new Date().toISOString(), ...control.settings.public() }));
  return router;
}
