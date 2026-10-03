// Actual application startup and HTTP regressions; no model generation.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

const root = process.cwd(), port = 3019, base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['src/server.js'], { cwd: root, env: { ...process.env, PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let generatedId = null, output = '';
child.stdout.on('data', chunk => { output += chunk.toString(); }); child.stderr.on('data', chunk => { output += chunk.toString(); });
try {
  const started = Date.now();
  while (!output.includes(`PowerPoint Agent: http://127.0.0.1:${port}/app.html`)) { if (child.exitCode !== null || Date.now() - started > 5000) throw new Error('Application startup failed or timed out.'); await new Promise(resolve => setTimeout(resolve, 50)); }
  const call = async route => { const response = await fetch(base + route); assert.equal(response.status, 200, route); return response.json(); };
  assert.equal((await call('/')).status, 'ok');
  assert.match(await (await fetch(`${base}/app.html`)).text(), /missionControl/);
  assert.match(await (await fetch(`${base}/app.js`)).text(), /setupPresentationUI/);
  assert.ok(Array.isArray((await call('/api/sources')).sources));
  assert.ok(Array.isArray((await call('/api/repositories')).repositories));
  assert.ok(Array.isArray((await call('/api/projects')).projects));
  assert.ok(Array.isArray((await call('/api/agent/jobs')).jobs));
  await call('/api/ai/status'); await call('/api/ai/settings'); await call('/api/ai/context');
  const response = await fetch(`${base}/api/presentations/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: 'Disposable Phase 9 legacy HTTP regression', slideCount: 5 }) });
  assert.equal(response.status, 201); const generated = await response.json(); generatedId = generated.id;
  assert.match(generatedId, /^[0-9a-f-]{36}$/i); const download = await fetch(base + generated.downloadUrl); assert.equal(download.status, 200);
  const zip = await JSZip.loadAsync(await download.arrayBuffer()); assert.equal(Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length, 5);
  console.log('PASS: actual server, frontend, sources, repositories, projects, Agent Core, AI status/settings/context, and legacy PPTX generation/download.');
} finally {
  child.kill();
  if (generatedId && /^[0-9a-f-]{36}$/i.test(generatedId)) { const file = path.resolve(root, 'generated', `${generatedId}.pptx`); assert.equal(path.dirname(file), path.resolve(root, 'generated')); await rm(file, { force: true }); }
}
