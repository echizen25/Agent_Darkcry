import { Router } from 'express';
export function modelRouter(gateway) {
  const router = Router();
  router.get('/providers', (_req, res) => res.json({ providers: gateway.providersList() }));
  router.get('/', async (_req, res) => res.json({ models: await gateway.models() }));
  router.get('/health', async (_req, res) => res.json({ providers: await gateway.health() }));
  return router;
}
