import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planPresentation } from './planner.js';
import { renderPresentation } from './renderer.js';
import { sourceRouter } from './sources.js';
import { repositoryRouter } from './repositories.js';
import { agentRouter, createAgentCore } from './core/agentRouter.js';
import { loadConfig } from './config.js';
import { ModelRegistry } from './models/modelRegistry.js';
import { ModelGateway } from './models/modelGateway.js';
import { OllamaProvider } from './models/providers/ollamaProvider.js';
import { modelRouter } from './models/modelRouter.js';
import { AiSettingsService } from './models/aiSettingsService.js';
import { ModelSelectionService } from './models/modelSelectionService.js';
import { ModelLab } from './models/modelLab.js';
import { AiControlCenter, aiRouter } from './models/aiControlCenter.js';
import { EmbeddingGateway } from './knowledge/embeddingGateway.js';
import { QdrantVectorStore } from './knowledge/qdrantVectorStore.js';
import { KnowledgeHub } from './knowledge/knowledgeHub.js';
import { knowledgeRouter } from './knowledge/knowledgeRouter.js';
import { ProjectStore } from './projects/projectStore.js';
import { ProjectService } from './projects/projectService.js';
import { MissionService } from './missions/missionService.js';
import { missionRouter } from './missions/missionRouter.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'generated');
const config = loadConfig();
const modelRegistry = new ModelRegistry();
if (config.chatModel) modelRegistry.register({ modelId: config.chatModel, providerId: 'ollama', displayName: config.chatModel, capabilities: ['chat'], purposes: ['GENERAL', 'PLANNING', 'CRITIQUE'], enabled: true, defaultTemperature: 0 });
if (config.embeddingModel && config.embeddingModel !== config.chatModel) modelRegistry.register({ modelId: config.embeddingModel, providerId: 'ollama', displayName: config.embeddingModel, capabilities: ['embedding'], purposes: ['EMBEDDING'], enabled: true });
else if (config.embeddingModel) modelRegistry.get(config.chatModel).capabilities.push('embedding');
const ollama = new OllamaProvider({ baseUrl: config.ollamaUrl, timeoutMs: config.timeoutMs });
const models = new ModelGateway({ registry: modelRegistry, timeoutMs: config.timeoutMs });
models.registerProvider(ollama);
const aiSettings = new AiSettingsService({ registry: modelRegistry, defaults: { runtimeProvider: 'local', roles: { general: config.chatModel, planner: config.chatModel, research: config.chatModel, development: config.chatModel, review: config.chatModel, critic: config.chatModel }, embedding: { provider: 'ollama', model: config.embeddingModel } } });
const modelSelection = new ModelSelectionService({ registry: modelRegistry, settings: aiSettings, providers: models.providers });
models.setSelectionService(modelSelection);
const knowledge = new KnowledgeHub({ root, embedding: new EmbeddingGateway({ provider: ollama, model: config.embeddingModel }), store: new QdrantVectorStore({ baseUrl: config.qdrantUrl, timeoutMs: config.timeoutMs }), collection: config.collection, chunkSize: config.chunkSize, chunkOverlap: config.chunkOverlap, topK: config.topK, contextTokens: config.contextTokens });
const core = createAgentCore({ knowledge, models, root });
const modelLab = new ModelLab({ gateway: models, registry: modelRegistry });
const aiControl = new AiControlCenter({ gateway: models, settings: aiSettings, selection: modelSelection, modelLab, knowledge, agentCore: core, config });
const projectStore = new ProjectStore({ file: path.join(root, 'data', 'projects.json') });
const projects = await new ProjectService({ store: projectStore, workspaces: core.workspaces, registry: modelRegistry, root }).init();
const missions = new MissionService({ store: projectStore, projects, core, models });
const app = express();
app.use(express.json({ limit: '128kb' }));
app.use(express.static(path.join(root, 'public')));
app.get('/', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/sources', sourceRouter(root));
app.use('/api/repositories', repositoryRouter(root));
app.use('/api/agent', agentRouter(core));
app.use('/api/models', modelRouter(models));
app.use('/api/ai', aiRouter(aiControl));
app.use('/api/knowledge', knowledgeRouter(knowledge));
app.use('/api', missionRouter({ projects, missions }));
app.post('/api/presentations/generate', async (req, res) => {
  try {
    const plan = planPresentation(req.body);
    await mkdir(outputDir, { recursive: true });
    const id = randomUUID();
    await renderPresentation(plan, path.join(outputDir, `${id}.pptx`));
    res.status(201).json({ id, title: plan.title, outline: plan.slides.map(({ layout, title }) => ({ layout, title })), downloadUrl: `/api/presentations/${id}/download` });
  } catch (error) {
    res.status(error.message.includes('required') || error.message.includes('Slide count') ? 400 : 500).json({ error: error.message });
  }
});
app.get('/api/presentations/:id/download', async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(req.params.id)) return res.sendStatus(400);
  const filename = `${req.params.id}.pptx`;
  const file = path.join(outputDir, filename);
  try { await stat(file); } catch { return res.sendStatus(404); }
  res.download(file, filename);
});
const port = Number(process.env.PORT) || 3000;
app.use((error, _req, res, _next) => res.status(error.status || (error instanceof multer.MulterError || error.message === 'Unsupported file type.' ? 400 : 500)).json({ error: error.message }));
app.listen(port, '127.0.0.1', (error) => {
  if (error) {
    console.error(`PowerPoint Agent could not start on port ${port}: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`PowerPoint Agent: http://127.0.0.1:${port}/app.html`);
});
