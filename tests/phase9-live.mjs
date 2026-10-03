// One bounded local-model mission, then independent deterministic rendering.
// Only synthetic source data and disposable OS-temp projects are used.
import { performance } from 'node:perf_hooks';
import { fixture, setup, specification } from './presentationFixture.js';
import { loadConfig } from '../src/config.js';
import { ModelRegistry } from '../src/models/modelRegistry.js';
import { ModelGateway } from '../src/models/modelGateway.js';
import { OllamaProvider } from '../src/models/providers/ollamaProvider.js';
import { AiSettingsService } from '../src/models/aiSettingsService.js';
import { ModelSelectionService } from '../src/models/modelSelectionService.js';
import { createAgentCore } from '../src/core/agentRouter.js';
import { MissionService } from '../src/missions/missionService.js';
import { renderPptx, validatePptx } from '../src/presentations/pptxRenderer.js';
import { validateSpecification, presentationEvidence, validateNarrative, validateStoryboard, validatePresentationIR } from '../src/presentations/presentationCore.js';
import { sourceText } from './presentationFixture.js';

const f = await setup(), report = {}, measure = (name, fn) => { const start = performance.now(), value = fn(); report.performance[name] = performance.now() - start; return value; };
report.performance = {};
try {
  const config = loadConfig(), provider = new OllamaProvider({ baseUrl: config.ollamaUrl, timeoutMs: 1500 });
  let model = config.chatModel;
  if (!model) { const inventory = await provider.listModels().catch(() => []); model = inventory.find(name => !/embed/i.test(name)); }
  const local = { attempted: true, provider: 'ollama', model: model || null, retries: 0 };
  const started = performance.now();
  if (!model) local.status = 'ENVIRONMENT / LOCAL MODEL UNAVAILABLE';
  else {
    const registry = new ModelRegistry(); registry.register({ modelId: model, providerId: 'ollama', capabilities: ['chat'], purposes: ['GENERAL'], enabled: true });
    const models = new ModelGateway({ registry, timeoutMs: 10000 }); models.registerProvider(provider);
    const settings = new AiSettingsService({ registry, defaults: { roles: { general: model, planner: model, review: model, critic: model } } }); models.setSelectionService(new ModelSelectionService({ registry, settings, providers: models.providers }));
    const core = createAgentCore({ models, root: f.root }), missions = new MissionService({ store: f.store, projects: f.projects, core, models });
    const mission = await missions.create(f.project.id, { request: 'Create a concise five-slide accomplishment presentation using available project evidence.', mode: 'PRESENTATION', presentation: specification() });
    try { const run = await missions.run(mission.id, { projectId: f.project.id }); local.status = run.status; local.tasks = run.tasks.map(t => ({ type: t.type, status: t.status })); if (run.status === 'WAITING_APPROVAL') await missions.cancel(mission.id, f.project.id); }
    catch (error) { local.status = error.code === 'MODEL_TIMEOUT' ? 'ENVIRONMENT / LOCAL MODEL TIMEOUT' : error.code || 'FAILED'; }
    local.calls = models.calls.map(c => ({ role: c.role, model: c.model, status: c.status, durationMs: c.durationMs, errorCode: c.errorCode }));
  }
  local.durationMs = performance.now() - started; report.local = local;
  report.qdrant = await fetch(`${config.qdrantUrl}/healthz`, { signal: AbortSignal.timeout(1500) }).then(r => ({ available: r.ok, used: false })).catch(() => ({ available: false, used: false }));
  const spec = measure('specification', () => validateSpecification(specification())), evidencePack = measure('evidence', () => presentationEvidence([{ id: 'synthetic', type: 'TXT', originalName: 'synthetic.txt', content: sourceText }], spec, f.project.id));
  const data = fixture(f.project.id);
  measure('narrativeValidation', () => validateNarrative({ coreMessage: 'Project accomplishments', audienceTakeaway: 'Review evidence', sections: [{ purpose: 'Accomplishments', message: evidencePack.items[0].text, evidenceRefs: [evidencePack.items[0].id] }] }, evidencePack));
  measure('storyboardValidation', () => validateStoryboard({ slides: data.ir.slides.map(s => ({ ...s, headline: s.title })) }, data.spec, data.evidencePack));
  measure('irQa', () => validatePresentationIR(data.ir, data.spec, data.evidencePack));
  let startedRender = performance.now(); const file = await renderPptx({ ir: data.ir, specification: data.spec, evidencePack: data.evidencePack, outputDir: f.root }); report.performance.render = performance.now() - startedRender;
  startedRender = performance.now(); const qa = await validatePptx(file.path, data.ir); report.performance.pptxQa = performance.now() - startedRender; report.pptx = { ...file, path: undefined, qa };
  const mission = await f.missions.create(f.project.id, { request: 'Synthetic five-slide accomplishments.', mode: 'PRESENTATION', presentation: specification() }), run = await f.missions.run(mission.id, { projectId: f.project.id });
  const register = f.core.artifacts.register.bind(f.core.artifacts); f.core.artifacts.register = input => { const start = performance.now(), value = register(input); if (input.output.type === 'PRESENTATION_FILE') report.performance.artifactRegistration = performance.now() - start; return value; };
  const approval = f.missions.approvals(run.id, f.project.id)[0], done = await f.missions.resolveApproval(run.id, approval.approvalId, 'APPROVED', f.project.id);
  const previewStart = performance.now(); f.missions.preview(done.id, f.project.id); report.performance.preview = performance.now() - previewStart;
  report.integration = { project: 'Disposable synthetic project', source: 'synthetic.txt', mission: 'PRESENTATION', provider: 'fake', status: done.status, slides: done.presentation.qa.counts.slides, revision: done.presentation.revision, fingerprint: done.presentation.fingerprint, artifact: f.missions.presentation(done.id, f.project.id).artifacts[0].filename, metrics: done.presentation.metrics, stagePerformance: done.presentation.performance };
} finally { await f.cleanup(); report.cleanup = 'Disposable sources, projects, metadata and PPTX artifacts removed.'; }
console.log(JSON.stringify(report, null, 2));
