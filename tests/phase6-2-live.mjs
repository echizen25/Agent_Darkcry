// Optional live local-model validation. Writes only to disposable OS temp workspaces.
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.js';
import { ModelRegistry } from '../src/models/modelRegistry.js';
import { ModelGateway } from '../src/models/modelGateway.js';
import { OllamaProvider } from '../src/models/providers/ollamaProvider.js';
import { AiSettingsService } from '../src/models/aiSettingsService.js';
import { ModelSelectionService } from '../src/models/modelSelectionService.js';
import { WorkspaceRegistry } from '../src/development/workspaceRegistry.js';
import { createAgentCore } from '../src/core/agentRouter.js';

const dryRun = process.argv[2] !== 'write', config = loadConfig(), model = config.chatModel || 'llama3.1:8b';
const registry = new ModelRegistry();
registry.register({ modelId: model, providerId: 'ollama', capabilities: ['chat'], purposes: ['GENERAL'], enabled: true });
const models = new ModelGateway({ registry, timeoutMs: 120000 }); models.registerProvider(new OllamaProvider({ baseUrl: config.ollamaUrl, timeoutMs: 120000 }));
const settings = new AiSettingsService({ registry, defaults: { runtimeProvider: 'local', roles: Object.fromEntries(['general', 'planner', 'research', 'development', 'review', 'critic'].map(role => [role, model])), embedding: { provider: 'ollama', model: null } } });
models.setSelectionService(new ModelSelectionService({ registry, settings, providers: models.providers }));
const root = await mkdtemp(path.join(tmpdir(), 'darkcry-phase62-live-'));
try {
  await mkdir(path.join(root, 'src')); await writeFile(path.join(root, 'src/greet.mjs'), "export const greet = () => 'Hello';\n"); await writeFile(path.join(root, 'test.mjs'), "import assert from 'node:assert/strict'; import { greet } from './src/greet.mjs'; assert.equal(greet(), 'Hello, Darkcry');\n");
  const workspaces = new WorkspaceRegistry({ snapshotRoot: path.join(root, '.snapshots') });
  const ws = await workspaces.register({ projectId: 'Phase62Live', root, allowedPaths: ['src', 'test.mjs'], testCommands: [{ id: 'test', executable: 'node', args: ['test.mjs'], timeoutMs: 10000 }] });
  const development = { projectId: 'Phase62Live', workspaceId: ws.workspaceId, request: 'Change greet() to return exactly Hello, Darkcry. Modify only src/greet.mjs.', acceptanceCriteria: ['greet() returns exactly Hello, Darkcry'], allowedPaths: ['src', 'test.mjs'], deniedPaths: [], testCommandIds: ['test'], contextFiles: ['src/greet.mjs', 'test.mjs'], maxFilesChanged: 2, maxPatchBytes: 30000, maxIterations: 2, allowCreateFiles: false, allowDeleteFiles: false, dryRun, orchestrationVersion: 2, providerMode: 'local', modelOverrides: {} };
  const core = createAgentCore({ models, workspaces }), job = core.createJob(development.request, { projectId: development.projectId, kind: 'development', maxIterations: 30, metadata: { development } }), started = Date.now();
  let result = await core.run(job.jobId); if (!dryRun && result.status === 'WAITING_FOR_APPROVAL') result = await core.approve(result.approvals.at(-1).approvalId);
  console.log(JSON.stringify({ dryRun, disposableWorkspace: true, status: result.status, failureReason: result.failureReason, calls: models.calls.map(item => ({ role: item.role, provider: item.provider, model: item.model, status: item.status, durationMs: item.durationMs, inputTokens: item.usage?.inputTokens, outputTokens: item.usage?.outputTokens, retry: item.retry })), context: result.artifacts.find(item => item.type === 'DEVELOPMENT_CONTEXT')?.value?.metrics, taskGraph: result.tasks.map(item => `${item.type}:${item.status}`), durationMs: Date.now() - started }));
  if (!dryRun && result.status === 'COMPLETED') console.log(JSON.stringify({ finalFile: await readFile(path.join(root, 'src/greet.mjs'), 'utf8') }));
  process.exitCode = result.status === 'COMPLETED' ? 0 : 1;
} finally { await rm(root, { recursive: true, force: true }); }
