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
import { registerResearchTool } from '../tools/researchTool.js';
import { createResearchAgents } from '../agents/researchAgents.js';
import { groundingEvaluator } from '../evaluation/groundingEvaluator.js';
import { validProjectId } from '../knowledge/knowledgeHub.js';

export function createAgentCore({ knowledge = null, models = null } = {}) {
  const store = new MemoryStore();
  const agents = registerDemoAgents(new AgentRegistry());
  const artifacts = new ArtifactRegistry(store);
  const registry = registerDemoTools(new ToolRegistry());
  const evaluationCore = new EvaluationCore();
  if (knowledge && models) {
    registerResearchTool(registry, knowledge);
    createResearchAgents(models).forEach(agent => agents.register(agent));
    evaluationCore.registry.register(groundingEvaluator);
  }
  const approvals = new ApprovalService(store);
  const toolService = new ToolExecutionService({ registry, policy: new PermissionPolicy(), approvals, store });
  return new Orchestrator({ store, agents, artifacts, evaluationCore, toolService, approvals });
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
  const researchDetails = id => {
    const details = core.details(id);
    if (details.kind !== 'research') throw Object.assign(new Error('Research job not found.'), { status: 404 });
    const data = details.tasks.find(task => task.key === 'research')?.result?.data;
    return { ...details, groundedResult: details.status === 'COMPLETED' ? { answer: data?.answer, claims: data?.claims } : null };
  };
  router.post('/research/jobs', (req, res) => {
    try {
      if (!core.agents.has('research.knowledge')) return res.status(503).json({ error: 'Research service is unavailable.' });
      const { projectId, question, topK = 5, maxContextTokens = 2000, maxAttempts = 3 } = req.body || {};
      if (!validProjectId(projectId) || typeof question !== 'string' || !question.trim() || question.length > 1000 || !Number.isInteger(topK) || topK < 1 || topK > 10 || !Number.isInteger(maxContextTokens) || maxContextTokens < 1 || maxContextTokens > 5000 || !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) return res.status(400).json({ error: 'Invalid research request.' });
      res.status(201).json(core.createJob(question, { projectId, kind: 'research', maxIterations: maxAttempts, metadata: { research: { topK, maxContextTokens, maxAttempts } } }));
    } catch (error) { respondError(error, res); }
  });
  router.get('/research/jobs/:id', (req, res) => { try { res.json(researchDetails(req.params.id)); } catch (error) { respondError(error, res); } });
  router.post('/research/jobs/:id/run', async (req, res) => { try { researchDetails(req.params.id); await core.run(req.params.id); res.json(researchDetails(req.params.id)); } catch (error) { respondError(error, res); } });
  return router;
}
