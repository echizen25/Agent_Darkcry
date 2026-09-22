// Optional real Ollama integration. Uses disposable workspaces only.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.js';
import { ModelRegistry } from '../src/models/modelRegistry.js';
import { ModelGateway } from '../src/models/modelGateway.js';
import { OllamaProvider } from '../src/models/providers/ollamaProvider.js';
import { WorkspaceRegistry } from '../src/development/workspaceRegistry.js';
import { TestCommandRegistry } from '../src/development/testCommandRegistry.js';
import { createAgentCore } from '../src/core/agentRouter.js';

const config = loadConfig(), provider = new OllamaProvider({ baseUrl: config.ollamaUrl, timeoutMs: config.timeoutMs });
const registry = new ModelRegistry(); registry.register({ modelId: config.chatModel, providerId: 'ollama', capabilities: ['chat'], purposes: ['GENERAL', 'REPAIR'], enabled: true });
const models = new ModelGateway({ registry, timeoutMs: config.timeoutMs }); models.registerProvider(provider);
const makeFixture = async () => { const root = await mkdtemp(path.join(tmpdir(), 'darkcry-phase6-live-')); await mkdir(path.join(root, 'src')); await writeFile(path.join(root, 'src', 'greet.mjs'), "export const greet = () => 'Hello';\n"); await writeFile(path.join(root, 'test.mjs'), "import assert from 'node:assert/strict'; import { greet } from './src/greet.mjs'; assert.equal(greet(), 'Hello, Darkcry');\n"); return root; };
const run = async dryRun => {
  const root = await makeFixture(), workspaces = new WorkspaceRegistry({ snapshotRoot: path.join(root, '.snapshots') });
  try {
    const workspace = await workspaces.register({ projectId: 'Phase6Live', root, allowedPaths: ['src', 'test.mjs'], testCommands: [{ id: 'test', executable: 'node', args: ['test.mjs'], timeoutMs: 10000 }] });
    const development = { projectId: 'Phase6Live', workspaceId: workspace.workspaceId, request: 'Change the greeting returned by greet() from Hello to Hello, Darkcry.', acceptanceCriteria: ['greet() returns exactly Hello, Darkcry'], allowedPaths: ['src', 'test.mjs'], deniedPaths: [], testCommandIds: ['test'], contextFiles: ['src/greet.mjs', 'test.mjs'], maxFilesChanged: 2, maxPatchBytes: 30000, maxIterations: 2, allowCreateFiles: false, allowDeleteFiles: false, allowGitRead: false, allowGitWrite: false, dryRun };
    const core = createAgentCore({ models, workspaces, testCommands: new TestCommandRegistry() }), job = core.createJob(development.request, { projectId: 'Phase6Live', kind: 'development', maxIterations: 2, metadata: { development } }), started = performance.now();
    let result = await core.run(job.jobId);
    if (result.status === 'FAILED') console.log(JSON.stringify({ dryRun, failed: true, failureReason: result.failureReason, task: { attempt: result.tasks[0]?.attempt, summary: result.tasks[0]?.result?.summary, data: result.tasks[0]?.result?.data, validations: result.tasks[0]?.validations }, calls: models.calls.map(item => ({ status: item.status, durationMs: item.durationMs, errorCode: item.errorCode })) }));
    if (dryRun) { assert.equal(result.status, 'COMPLETED'); assert.equal(await readFile(path.join(root, 'src', 'greet.mjs'), 'utf8'), "export const greet = () => 'Hello';\n"); }
    else { assert.equal(result.status, 'WAITING_FOR_APPROVAL'); result = await core.approve(result.approvals.at(-1).approvalId); assert.equal(result.status, 'COMPLETED'); assert.match(await readFile(path.join(root, 'src', 'greet.mjs'), 'utf8'), /Hello, Darkcry/); }
    const task = result.tasks[0], proposal = task.result?.data?.proposal || task.pendingState?.proposal;
    console.log(JSON.stringify({ dryRun, status: result.status, model: config.chatModel, files: development.contextFiles, contextCharacters: result.events.find(item => item.type === 'DEVELOPMENT_CONTEXT_BUILT')?.details?.estimatedCharacters, patchBytes: proposal ? Buffer.byteLength(JSON.stringify(proposal)) : null, durationMs: Math.round(performance.now() - started), attempts: task.attempt, review: task.result?.data?.review?.status || task.pendingState?.review?.status, tests: task.result?.data?.tests?.map(item => ({ status: item.status, durationMs: item.durationMs })) || [] }));
  } finally { await rm(root, { recursive: true, force: true }); }
};
await run(true);
await run(false);
