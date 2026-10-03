import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateSpecification, presentationEvidence } from '../src/presentations/presentationCore.js';
import { ModelRegistry } from '../src/models/modelRegistry.js';
import { ModelGateway } from '../src/models/modelGateway.js';
import { createAgentCore } from '../src/core/agentRouter.js';
import { WorkspaceRegistry } from '../src/development/workspaceRegistry.js';
import { ProjectStore } from '../src/projects/projectStore.js';
import { ProjectService } from '../src/projects/projectService.js';
import { MissionService } from '../src/missions/missionService.js';

export const sourceText = 'GeoKlik field validation was conducted on September 9, 2026. GeoKlik completed 193 infrastructure sites. RCEF sites total 100 and CTF sites total 50.';
export const specification = () => validateSpecification({ title: 'Synthetic Accomplishments', targetSlideCount: 5, period: 'September 2026', presentationType: 'ACCOMPLISHMENT' }, 'Create a five-slide accomplishment presentation.');
export const pack = (projectId = 'project-a') => presentationEvidence([{ id: 'source-a', type: 'TXT', originalName: 'synthetic.txt', content: sourceText }], specification(), projectId);
export function storyboard(evidence) { return { slides: [ ['TITLE', 'Synthetic Accomplishments', []], ['CONTENT', 'Field validation', [evidence[0].id]], ['TABLE', 'Infrastructure sites', [evidence[1].id]], ['CHART', 'RCEF and CTF sites', [evidence[2].id]], ['SUMMARY', 'Accomplishments', [evidence[1].id]] ].map(([type, headline, evidenceRefs], i) => ({ id: `slide-0${i + 1}`, type, headline, purpose: i ? `Present ${headline}` : 'Introduce the presentation', message: headline, evidenceRefs })) }; }
export function slides(evidence) {
  const board = storyboard(evidence).slides;
  return board.map((s, i) => ({ ...s, title: s.headline, speakerNotes: [], blocks: i === 0 ? [] : i === 1 ? [{ type: 'TEXT', text: evidence[0].text, evidenceRefs: s.evidenceRefs }] : i === 2 ? [{ type: 'TABLE', columns: ['GeoKlik', 'sites'], rows: [['infrastructure sites', '193']], evidenceRefs: s.evidenceRefs }] : i === 3 ? [{ type: 'CHART', chartType: 'COLUMN', categories: ['RCEF', 'CTF'], series: [{ name: 'sites', values: [100, 50] }], evidenceRefs: s.evidenceRefs }] : [{ type: 'METRIC', value: 193, label: 'infrastructure sites', evidenceRefs: s.evidenceRefs }] }));
}
export const visual = s => ({ layout: s.type === 'TITLE' ? 'TITLE' : s.type === 'TABLE' ? 'TITLE_TABLE' : s.type === 'CHART' ? 'TITLE_CHART' : s.type === 'SUMMARY' ? 'TITLE_METRIC' : 'TITLE_CONTENT', visualType: s.type === 'TABLE' ? 'TABLE' : s.type === 'CHART' ? 'CHART' : s.type === 'SUMMARY' ? 'METRIC' : 'TEXT', emphasis: '', notes: '' });
export function fixture(projectId = 'project-a') { const evidencePack = pack(projectId), spec = specification(), ir = { metadata: { title: spec.title, projectId, revision: 1 }, theme: spec.theme, slides: slides(evidencePack.items).map(s => ({ ...s, visualIntent: visual(s) })) }; return { spec, evidencePack, ir }; }
export async function setup(override = null) {
  const root = await mkdtemp(path.join(tmpdir(), 'darkcry-phase9-')), workspace = path.join(root, 'workspace'); await mkdir(workspace); await mkdir(path.join(root, 'data', 'sources'), { recursive: true });
  const sourceId = randomUUID(); await writeFile(path.join(root, 'data', 'sources', `${sourceId}.json`), JSON.stringify({ id: sourceId, type: 'TXT', originalName: 'synthetic.txt', extractionStatus: 'ready', content: sourceText }));
  const registry = new ModelRegistry(); registry.register({ modelId: 'fake', providerId: 'fake', capabilities: ['chat'], purposes: ['GENERAL'], enabled: true });
  let allEvidence;
  const models = new ModelGateway({ registry }); models.registerProvider({ id: 'fake', async health() { return true; }, async embed() { return []; }, async generate(request) {
    const p = JSON.parse(request.prompt), instruction = request.systemInstruction; let value;
    if (override) { const custom = await override(request, p); if (custom !== undefined) return { content: JSON.stringify(custom) }; }
    if (instruction.startsWith('Create a presentation specification')) value = specification();
    else if (instruction.startsWith('Create Narrative Plan')) { allEvidence = p.evidence; value = { coreMessage: 'Project accomplishments supported by records', audienceTakeaway: 'Review the accomplishments', sections: p.evidence.map(e => ({ purpose: 'Present project evidence', message: e.text, evidenceRefs: [e.id] })) }; }
    else if (instruction.startsWith('Create storyboard')) value = storyboard(allEvidence);
    else if (instruction.startsWith('Write {slides')) value = { slides: slides(allEvidence).filter(s => p.storyboard.slides.some(v => v.id === s.id)) };
    else if (instruction.startsWith('Return {slides')) value = { slides: p.slides.map(s => ({ id: s.id, visualIntent: visual(s) })) };
    else if (instruction.startsWith('Review story')) value = { status: 'PASS', issues: [] };
    else if (instruction.startsWith('Return {repair')) value = { repairInstructions: ['Use supported evidence on affected slides.'], needsResearch: false };
    else if (instruction.startsWith('Review final')) value = { passed: true, comment: 'Synthetic fixture checks passed.' };
    else throw new Error('Unexpected specialist call');
    return { content: JSON.stringify(value), usage: { inputTokens: 100, outputTokens: 100 } };
  } });
  const workspaces = new WorkspaceRegistry({ snapshotRoot: path.join(root, 'snapshots') }), core = createAgentCore({ models, workspaces, root }); const store = new ProjectStore({ file: path.join(root, 'data', 'projects.json') }); await store.load(); const projects = new ProjectService({ store, workspaces, registry, root }), missions = new MissionService({ store, projects, core, models }); const project = await projects.create({ name: 'Disposable Presentation Project', description: '', workspace: { root: workspace, allowedPaths: ['.'], deniedPaths: [], testCommands: [] }, repositoryIds: [], sourceIds: [sourceId], modelPreferences: {} });
  return { root, sourceId, core, store, projects, missions, project, models, cleanup: () => rm(root, { recursive: true, force: true }) };
}
