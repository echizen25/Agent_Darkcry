import { Router } from 'express';

export function knowledgeRouter(hub) {
  const router = Router();
  const error = (cause, res) => res.status(cause.status || 500).json({ error: { code: cause.code || 'KNOWLEDGE_ERROR', message: cause.status ? cause.message : 'Knowledge operation failed.' } });
  router.get('/status', async (_req, res) => { try { res.json(await hub.status()); } catch (cause) { error(cause, res); } });
  router.post('/index/source/:sourceId', async (req, res) => { try { res.status(201).json(await hub.indexSource(req.body?.projectId, req.params.sourceId)); } catch (cause) { error(cause, res); } });
  router.post('/index/repository/:repositoryId', async (req, res) => { try { res.status(201).json(await hub.indexRepository(req.body?.projectId, req.params.repositoryId)); } catch (cause) { error(cause, res); } });
  router.post('/query', async (req, res) => { try { res.json(await hub.query(req.body || {})); } catch (cause) { error(cause, res); } });
  router.delete('/source/:sourceId', async (req, res) => { try { await hub.deleteSource(req.body?.projectId, req.params.sourceId); res.status(204).end(); } catch (cause) { error(cause, res); } });
  router.delete('/project/:projectId', async (req, res) => { try { await hub.deleteProject(req.params.projectId); res.status(204).end(); } catch (cause) { error(cause, res); } });
  return router;
}
