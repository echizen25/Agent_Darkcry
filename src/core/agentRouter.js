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
import { WorkspaceRegistry } from '../development/workspaceRegistry.js';
import { TestCommandRegistry } from '../development/testCommandRegistry.js';
import { registerWorkspaceTools } from '../tools/workspaceTools.js';
import { createPatchSafetyEvaluator } from '../evaluation/patchSafetyEvaluator.js';
import { developmentResultEvaluator } from '../evaluation/developmentResultEvaluator.js';
import { createDevelopmentAgents } from '../agents/developmentAgents.js';

export function createAgentCore({ knowledge = null, models = null, workspaces = null, testCommands = null } = {}) {
  const store = new MemoryStore();
  const agents = registerDemoAgents(new AgentRegistry());
  const artifacts = new ArtifactRegistry(store);
  const registry = registerDemoTools(new ToolRegistry());
  const evaluationCore = new EvaluationCore();
  workspaces ||= new WorkspaceRegistry(); testCommands ||= new TestCommandRegistry();
  registerWorkspaceTools(registry, workspaces, testCommands);
  evaluationCore.registry.register(createPatchSafetyEvaluator(workspaces));
  evaluationCore.registry.register(developmentResultEvaluator);
  if (knowledge && models) {
    registerResearchTool(registry, knowledge);
    createResearchAgents(models).forEach(agent => agents.register(agent));
    evaluationCore.registry.register(groundingEvaluator);
  }
  if (models) createDevelopmentAgents({ models, workspaces, evaluation: evaluationCore }).agents.forEach(agent => agents.register(agent));
  const approvals = new ApprovalService(store);
  const toolService = new ToolExecutionService({ registry, policy: new PermissionPolicy(), approvals, store });
  const core = new Orchestrator({ store, agents, artifacts, evaluationCore, toolService, approvals }); core.workspaces = workspaces; core.testCommands = testCommands; return core;
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
    return { ...details, groundedResult: details.status === 'COMPLETED' ? { answer: data?.answer, claims: data?.claims, limitations: data?.limitations || [] } : null };
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
  router.post('/development/jobs', async (req, res) => {
    try {
      if (!core.agents.has('development.developer')) return res.status(503).json({ error: 'Development service is unavailable.' });
      const body = req.body || {}, projectId = body.projectId;
      if (!validProjectId(projectId) || typeof body.workspaceRoot !== 'string' || typeof body.request !== 'string' || !body.request.trim() || body.request.length > 2000 || !Array.isArray(body.acceptanceCriteria) || !Array.isArray(body.allowedPaths) || !body.allowedPaths.length || !Array.isArray(body.deniedPaths || []) || !Array.isArray(body.testCommands || []) || !Number.isInteger(body.maxFilesChanged ?? 10) || !Number.isInteger(body.maxPatchBytes ?? 100000) || !Number.isInteger(body.maxIterations ?? 3)) return res.status(400).json({ error: 'Invalid development request.' });
      if (body.allowGitWrite === true || body.allowDeleteFiles && body.dryRun) return res.status(400).json({ error: 'Invalid development permissions.' });
      body.testCommands.forEach(command => core.testCommands.validate(command));
      const workspace = await core.workspaces.register({ projectId, root: body.workspaceRoot, allowedPaths: body.allowedPaths, deniedPaths: body.deniedPaths || [], testCommands: body.testCommands });
      const contextFiles = Array.isArray(body.contextFiles) ? body.contextFiles : body.allowedPaths.filter(item => item !== '.');
      const development = { projectId, workspaceId: workspace.workspaceId, request: body.request.trim(), acceptanceCriteria: body.acceptanceCriteria, allowedPaths: body.allowedPaths, deniedPaths: body.deniedPaths || [], testCommandIds: Array.isArray(body.testCommandIds) ? body.testCommandIds : body.testCommands.map(item => item.id), contextFiles, maxFilesChanged: body.maxFilesChanged ?? 10, maxPatchBytes: body.maxPatchBytes ?? 100000, maxIterations: body.maxIterations ?? 3, allowCreateFiles: body.allowCreateFiles !== false, allowDeleteFiles: body.allowDeleteFiles === true, allowGitRead: body.allowGitRead !== false, allowGitWrite: false, dryRun: body.dryRun === true };
      res.status(201).json(core.createJob(development.request, { projectId, kind: 'development', maxIterations: development.maxIterations, metadata: { development } }));
    } catch (error) { respondError(error, res); }
  });
  router.get('/development/jobs/:id', (req, res) => { try { const result = core.details(req.params.id); if (result.kind !== 'development') throw Object.assign(new Error('Development job not found.'), { status: 404 }); res.json(result); } catch (error) { respondError(error, res); } });
  router.post('/development/jobs/:id/run', async (req, res) => { try { const job = core.getJob(req.params.id); if (job.kind !== 'development') throw Object.assign(new Error('Development job not found.'), { status: 404 }); res.json(await core.run(job.jobId)); } catch (error) { respondError(error, res); } });
  return router;
}
