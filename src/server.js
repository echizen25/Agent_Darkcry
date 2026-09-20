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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'generated');
const app = express();
app.use(express.json({ limit: '128kb' }));
app.use(express.static(path.join(root, 'public')));
app.get('/', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/sources', sourceRouter(root));
app.use('/api/repositories', repositoryRouter(root));
app.use('/api/agent', agentRouter(createAgentCore()));
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
