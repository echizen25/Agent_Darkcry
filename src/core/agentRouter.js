import { Router } from 'express';
import { MemoryStore } from '../storage/memoryStore.js';
import { AgentRegistry } from '../agents/agentRegistry.js';
import { registerDemoAgents } from '../agents/demoAgents.js';
import { ArtifactRegistry } from '../artifacts/artifactRegistry.js';
import { validate } from '../evaluation/validator.js';
import { Orchestrator } from './orchestrator.js';

export function createAgentCore() {
  const store = new MemoryStore();
  const agents = registerDemoAgents(new AgentRegistry());
  const artifacts = new ArtifactRegistry(store);
  return new Orchestrator({ store, agents, artifacts, validate });
}

export function agentRouter(core) {
  const router = Router();
  const respondError = (error, res) => res.status(error.status || 500).json({ error: error.status ? error.message : 'Agent Core execution failed.' });
  router.post('/jobs', (req, res) => {
    try { res.status(201).json(core.createJob(req.body?.goal)); }
    catch (error) { respondError(error, res); }
  });
  router.get('/jobs', (_req, res) => res.json({ jobs: core.listJobs() }));
  router.get('/jobs/:id', (req, res) => {
    try { res.json(core.details(req.params.id)); }
    catch (error) { respondError(error, res); }
  });
  router.post('/jobs/:id/run', async (req, res) => {
    try { res.json(await core.run(req.params.id)); }
    catch (error) { respondError(error, res); }
  });
  return router;
}
