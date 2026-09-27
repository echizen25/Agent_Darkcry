import { Router } from 'express';
export function modelRouter(gateway) {
  const router = Router();
  router.get('/providers', (_req, res) => res.json({ providers: gateway.providersList() }));
  router.get('/', async (_req, res) => res.json({ models: await gateway.models() }));
  router.get('/health', async (_req, res) => res.json({ providers: await gateway.health() }));
  router.get('/runtime', (_req, res) => { const models = gateway.registry.list(); const chat = models.find(item => item.enabled && item.capabilities.includes('chat')); const embedding = models.find(item => item.enabled && item.capabilities.includes('embedding')); res.json({ mode: 'LOCAL', activeProvider: chat?.providerId || 'not configured', activeModel: chat?.modelId || 'not configured', embeddingProvider: embedding?.providerId || 'not configured', embeddingModel: embedding?.modelId || 'not configured', openaiApi: gateway.providers.has('openai') ? 'configured' : 'not configured', availableModes: ['LOCAL', 'OPENAI_API', 'AUTO'] }); });
  return router;
}
