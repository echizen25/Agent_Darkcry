import { Router } from 'express';
import { MemoryStore } from '../storage/memoryStore.js';
import { AgentRegistry } from '../agents/agentRegistry.js';
import { registerDemoAgents } from '../agents/demoAgents.js';
import { ArtifactRegistry } from '../artifacts/artifactRegistry.js';
import { Orchestrator } from './orchestrator.js';
import { ToolRegistry } from '../tools/toolRegistry.js';
import { registerDemoTools } from '../tools/demoTools.js';
import { PermissionPolicy } from '../tools/permissionPolicy.js';
import { ApprovalService } from '../tools/approvalService.js';
import { ToolExecutionService } from '../tools/toolExecutionService.js';
import { EvaluationCore } from '../evaluation/evaluationCore.js';

export function createAgentCore() {
  const store = new MemoryStore();
  const agents = registerDemoAgents(new AgentRegistry());
  const artifacts = new ArtifactRegistry(store);
  const registry = registerDemoTools(new ToolRegistry());
  const approvals = new ApprovalService(store);
  const toolService = new ToolExecutionService({ registry, policy: new PermissionPolicy(), approvals, store });
  return new Orchestrator({ store, agents, artifacts, evaluationCore: new EvaluationCore(), toolService, approvals });
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
  router.get('/approvals', (_req, res) => res.json({ approvals: core.approvals.list() }));
  router.get('/approvals/:id', (req, res) => { try { res.json(core.approvals.get(req.params.id)); } catch (error) { respondError(error, res); } });
  router.post('/approvals/:id/approve', async (req, res) => { try { res.json(await core.approve(req.params.id)); } catch (error) { respondError(error, res); } });
  router.post('/approvals/:id/deny', (req, res) => { try { res.json(core.deny(req.params.id)); } catch (error) { respondError(error, res); } });
  return router;
}
