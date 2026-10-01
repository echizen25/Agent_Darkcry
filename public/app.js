const form = document.querySelector('#form');
const button = document.querySelector('#generate');
const status = document.querySelector('#status');
const result = document.querySelector('#result');
async function request(url, options) {
  const response = await fetch(url, options);
  if (response.status === 204) return null;
  const label = `HTTP ${response.status} ${response.statusText}`.trim();
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`${label}: ${url} returned ${contentType || 'an unknown content type'} instead of JSON. Check that the current app server is running.`);
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error(`${label}: ${url} returned invalid JSON.`); }
  if (!response.ok) throw new Error(`${label}: ${data.error || 'Request failed.'}`);
  return data;
}
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  result.hidden = true;
  button.disabled = true;
  button.textContent = 'Generating…';
  status.textContent = 'Building your editable PowerPoint…';
  try {
    const data = await request('/api/presentations/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    const outline = document.querySelector('#outline');
    outline.replaceChildren(...data.outline.map((slide) => { const li = document.createElement('li'); li.textContent = slide.title; return li; }));
    document.querySelector('#download').href = data.downloadUrl;
    result.hidden = false;
    status.textContent = 'Presentation ready.';
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; button.textContent = 'Generate presentation'; }
});

const sourceStatus = document.querySelector('#sourceStatus');
const sourceList = document.querySelector('#sourceList');
const preview = document.querySelector('#preview');
const files = document.querySelector('#files');
const dropzone = document.querySelector('#dropzone');
async function refreshSources() {
  const { sources } = await request('/api/sources');
  sourceList.replaceChildren(...sources.map(source => {
    const item = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = source.originalName;
    const detail = document.createElement('small');
    detail.textContent = `${source.type.toUpperCase()} · ${(source.size / 1024).toFixed(1)} KB · ${source.extractionStatus}`;
    name.append(detail);
    const view = document.createElement('button');
    view.type = 'button'; view.className = 'secondary'; view.textContent = 'Preview';
    view.onclick = async () => { try { const full = await request(`/api/sources/${source.id}`); preview.textContent = full.content || full.metadata?.error || '(No extractable text)'; } catch (error) { sourceStatus.textContent = error.message; } };
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'secondary'; remove.textContent = 'Remove';
    remove.onclick = async () => { try { await request(`/api/sources/${source.id}`, { method: 'DELETE' }); preview.textContent = 'Select a source to inspect its extracted content.'; await refreshSources(); } catch (error) { sourceStatus.textContent = error.message; } };
    item.append(name, view, remove);
    return item;
  }));
}
async function uploadFiles(selected) {
  if (!selected.length) return;
  const body = new FormData();
  for (const file of selected) body.append('files', file);
  sourceStatus.textContent = 'Extracting files…';
  try { const data = await request('/api/sources/upload', { method: 'POST', body }); sourceStatus.textContent = `${data.sources.length} source(s) added.`; await refreshSources(); }
  catch (error) { sourceStatus.textContent = error.message; }
}
document.querySelector('#browse').onclick = () => files.click();
files.onchange = () => { uploadFiles(files.files); files.value = ''; };
dropzone.ondragover = event => { event.preventDefault(); dropzone.classList.add('dragging'); };
dropzone.ondragleave = () => dropzone.classList.remove('dragging');
dropzone.ondrop = event => { event.preventDefault(); dropzone.classList.remove('dragging'); uploadFiles(event.dataTransfer.files); };
dropzone.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); files.click(); } };
document.querySelector('#addNotes').onclick = async () => {
  const textarea = document.querySelector('#notes');
  try { await request('/api/sources/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: textarea.value }) }); textarea.value = ''; sourceStatus.textContent = 'Notes added.'; await refreshSources(); }
  catch (error) { sourceStatus.textContent = error.message; }
};
refreshSources().catch(error => { sourceStatus.textContent = error.message; });

const repoStatus = document.querySelector('#repoStatus');
const repoList = document.querySelector('#repoList');
const repoBrowser = document.querySelector('#repoBrowser');
const repoFiles = document.querySelector('#repoFiles');
const repoSearch = document.querySelector('#repoSearch');
let selectedRepository = null;
async function refreshRepositories() {
  const { repositories } = await request('/api/repositories');
  repoList.replaceChildren(...repositories.map(repo => {
    const item = document.createElement('li');
    const details = document.createElement('span');
    details.textContent = repo.name;
    const meta = document.createElement('small');
    meta.textContent = `${repo.branch} · ${repo.commit?.slice(0, 10) || 'No commit'} · ${repo.fileCount} files · ${repo.languages.join(', ') || 'No supported files'} · ${repo.analysisStatus}`;
    details.append(meta);
    const inspect = document.createElement('button');
    inspect.type = 'button'; inspect.className = 'secondary'; inspect.textContent = 'Inspect';
    inspect.onclick = () => openRepository(repo);
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'secondary'; remove.textContent = 'Remove';
    remove.onclick = async () => {
      try {
        await request(`/api/repositories/${repo.id}`, { method: 'DELETE' });
        if (selectedRepository?.id === repo.id) { selectedRepository = null; repoBrowser.hidden = true; }
        await refreshRepositories();
      } catch (error) { repoStatus.textContent = error.message; }
    };
    item.append(details, inspect, remove);
    return item;
  }));
}
async function loadRepositoryFiles() {
  if (!selectedRepository) return;
  const { files } = await request(`/api/repositories/${selectedRepository.id}/files?q=${encodeURIComponent(repoSearch.value)}`);
  repoFiles.replaceChildren(...files.map(file => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${file.path} (${file.language})`;
    button.onclick = async () => {
      try {
        const full = await request(`/api/repositories/${selectedRepository.id}/files/${file.id}`);
        document.querySelector('#repoFileInfo').textContent = `${full.path} · ${full.language} · ${(full.size / 1024).toFixed(1)} KB`;
        document.querySelector('#repoPreview').textContent = full.content;
      } catch (error) { repoStatus.textContent = error.message; }
    };
    item.append(button);
    return item;
  }));
}
async function openRepository(repo) {
  selectedRepository = repo;
  repoSearch.value = '';
  document.querySelector('#repoHeading').textContent = `${repo.name} files`;
  document.querySelector('#repoFileInfo').textContent = '';
  document.querySelector('#repoPreview').textContent = 'Select a file to inspect its source text.';
  repoBrowser.hidden = false;
  try { await loadRepositoryFiles(); } catch (error) { repoStatus.textContent = error.message; }
}
repoSearch.oninput = () => loadRepositoryFiles().catch(error => { repoStatus.textContent = error.message; });
document.querySelector('#repoForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.querySelector('#analyzeRepo');
  button.disabled = true;
  repoStatus.textContent = 'Analyzing repository…';
  try {
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const repo = await request('/api/repositories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    repoStatus.textContent = `Analyzed ${repo.fileCount} files from ${repo.name}.`;
    await refreshRepositories();
    await openRepository(repo);
  } catch (error) { repoStatus.textContent = error.message; }
  finally { button.disabled = false; }
});
refreshRepositories().catch(error => { repoStatus.textContent = error.message; });

const aiStatus = document.querySelector('#aiStatus');
const roles = ['general', 'planner', 'research', 'development', 'review', 'critic'];
let aiModels = [];
const option = model => { const item = document.createElement('option'); item.value = model.name; item.textContent = `${model.name} · ${model.provider}`; return item; };
const badge = (element, state) => { const value = String(state || 'UNKNOWN'); element.textContent = value.replaceAll('_', ' '); element.className = `badge ${value.toLowerCase()}`; };
const metrics = values => Object.entries(values).flatMap(([name, value]) => { const key = document.createElement('span'); key.textContent = name; const data = document.createElement('strong'); data.textContent = value ?? 'Unknown'; return [key, data]; });
async function refreshAi(refresh = false) {
  const [settingsData, modelsData, health, context] = await Promise.all([request('/api/ai/settings'), request('/api/ai/models'), request(`/api/ai/health${refresh ? '?refresh=true' : ''}`), request('/api/ai/context')]);
  aiModels = modelsData.models;
  document.querySelector('#runtimeProvider').value = settingsData.settings.runtimeProvider;
  document.querySelector('#openaiStatus').textContent = `OpenAI API: ${health.openai.status.replaceAll('_', ' ')}`;
  badge(document.querySelector('#codexStatus'), health.codexDevelopment.status); badge(document.querySelector('#headroomStatus'), health.headroom.status);
  const healthSummary = document.querySelector('#healthSummary'); healthSummary.replaceChildren(...metrics({ Ollama: health.ollama.status, Qdrant: health.qdrant.status, Embedding: health.embedding.status, 'Knowledge collection': health.qdrant.available ? 'AVAILABLE' : 'UNAVAILABLE' }));
  const contextSummary = document.querySelector('#contextSummary'); contextSummary.replaceChildren(...metrics({ 'Estimated tokens': context.estimatedTokens, Pressure: context.pressure, Files: context.files, Ranges: context.ranges, Symbols: context.symbols, 'Qdrant chunks': context.qdrantChunks }));
  const chat = aiModels.filter(model => model.enabled && model.availability === 'AVAILABLE' && model.capabilities.includes('chat'));
  const embeddings = aiModels.filter(model => model.enabled && model.availability === 'AVAILABLE' && model.capabilities.includes('embedding'));
  const roleAssignments = document.querySelector('#roleAssignments'); roleAssignments.replaceChildren(...roles.map(role => { const label = document.createElement('label'); label.textContent = role[0].toUpperCase() + role.slice(1); const select = document.createElement('select'); select.dataset.role = role; select.replaceChildren(...chat.map(option)); select.value = settingsData.settings.roles[role] || ''; label.append(select); return label; }));
  const embedding = document.querySelector('#embeddingModel'); embedding.replaceChildren(...embeddings.map(option)); embedding.value = settingsData.settings.embedding.model || '';
  for (const id of ['labModelA', 'labModelB']) document.querySelector(`#${id}`).replaceChildren(...chat.map(option));
  if (chat[1]) document.querySelector('#labModelB').value = chat[1].name;
}
document.querySelector('#refreshAi').onclick = () => refreshAi(true).then(() => { aiStatus.textContent = 'Health refreshed.'; }).catch(error => { aiStatus.textContent = error.message; });
document.querySelector('#saveAi').onclick = async () => {
  try { const roleValues = Object.fromEntries([...document.querySelectorAll('[data-role]')].map(select => [select.dataset.role, select.value])); await request('/api/ai/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runtimeProvider: document.querySelector('#runtimeProvider').value, roles: roleValues, embedding: { provider: 'ollama', model: document.querySelector('#embeddingModel').value } }) }); aiStatus.textContent = 'Runtime settings saved for this process.'; await refreshAi(); } catch (error) { aiStatus.textContent = error.message; }
};
document.querySelector('#runLab').onclick = async () => {
  const button = document.querySelector('#runLab'); button.disabled = true; aiStatus.textContent = 'Running models sequentially…';
  try { const data = await request('/api/ai/model-lab/compare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modelA: document.querySelector('#labModelA').value, modelB: document.querySelector('#labModelB').value, taskType: document.querySelector('#labTask').value }) }); document.querySelector('#labResults').replaceChildren(...data.results.map(item => { const card = document.createElement('div'); card.className = 'lab-result'; const title = document.createElement('h4'); title.textContent = item.model; const list = document.createElement('dl'); list.replaceChildren(...metrics({ Status: item.status, 'Contract valid': item.contractValid ? 'PASS' : 'FAIL', 'Schema valid': item.schemaValid ? 'PASS' : 'FAIL', 'Duration ms': item.durationMs, 'Input tokens': item.inputTokens ?? 'Unknown', 'Output tokens': item.outputTokens ?? 'Unknown' })); card.append(title, list); return card; })); aiStatus.textContent = 'Controlled comparison completed.'; } catch (error) { aiStatus.textContent = error.message; } finally { button.disabled = false; }
};
refreshAi().catch(error => { aiStatus.textContent = error.message; });

let selectedProjectId = '', selectedMissionId = '', missionPoll = null;
const missionStatus = document.querySelector('#missionStatus');
const projectStatus = document.querySelector('#projectStatus');
const selectedValues = select => [...select.options].filter(item => item.selected).map(item => item.value);
const makeOption = (value, label) => { const item = document.createElement('option'); item.value = value; item.textContent = label; return item; };
const setMissionBadge = (element, value) => { element.textContent = value || 'UNKNOWN'; element.className = `badge ${String(value || 'unknown').toLowerCase().replaceAll(' ', '_')}`; };
async function refreshProjectChoices() {
  const [{ projects }, { repositories }, { sources }] = await Promise.all([request(`/api/projects?q=${encodeURIComponent(document.querySelector('#projectSearch').value || '')}`), request('/api/repositories'), request('/api/sources')]);
  const selector = document.querySelector('#currentProject'); selector.replaceChildren(makeOption('', 'Create or select a project'), ...projects.map(item => makeOption(item.id, item.name))); selector.value = selectedProjectId;
  document.querySelector('#projectRepositories').replaceChildren(...repositories.map(item => makeOption(item.id, item.name || item.location)));
  document.querySelector('#projectSources').replaceChildren(...sources.map(item => makeOption(item.id, item.originalName)));
  const list = document.querySelector('#projectList'); list.replaceChildren(...projects.map(project => { const li = document.createElement('li'), button = document.createElement('button'); button.type = 'button'; button.textContent = `${project.name} · ${project.workspace.available ? 'Workspace available' : 'Workspace unavailable'}`; button.onclick = () => selectProject(project.id); li.append(button); return li; }));
  return projects;
}
async function selectProject(id) {
  selectedProjectId = id; selectedMissionId = ''; document.querySelector('#currentProject').value = id; document.querySelector('#deleteProject').disabled = !id; document.querySelector('#missionDetail').hidden = true;
  if (!id) { document.querySelector('#projectSummary').replaceChildren(); document.querySelector('#missionList').replaceChildren(); return; }
  const project = await request(`/api/projects/${id}`); document.querySelector('#projectSummary').replaceChildren(...metrics({ Workspace: project.workspace.available ? 'AVAILABLE' : 'UNAVAILABLE', Repositories: project.repositoryIds.length, Sources: project.sourceIds.length, Missions: project.missions.length })); renderMissionList(project.missions);
}
function renderMissionList(items) {
  const query = document.querySelector('#missionSearch').value.toLowerCase(); const list = document.querySelector('#missionList');
  list.replaceChildren(...items.filter(item => !query || item.title.toLowerCase().includes(query) || item.request.toLowerCase().includes(query)).map(mission => { const li = document.createElement('li'), button = document.createElement('button'); button.type = 'button'; button.textContent = `${mission.title} · ${mission.mode} · ${mission.status}`; button.onclick = () => showMission(mission.id); li.append(button); return li; }));
}
async function showMission(id) {
  selectedMissionId = id; const mission = await request(`/api/missions/${id}?projectId=${encodeURIComponent(selectedProjectId)}`), panel = document.querySelector('#missionDetail'); panel.hidden = false; document.querySelector('#missionTitle').textContent = mission.title; document.querySelector('#missionRequestView').textContent = mission.request; setMissionBadge(document.querySelector('#missionState'), mission.status);
  const run = mission.latestRun; document.querySelector('#missionMetrics').replaceChildren(...metrics({ Mode: mission.mode, Runs: mission.runCount, 'Dry run': mission.dryRun ? 'YES' : 'NO', Updated: mission.updatedAt }));
  if (!run) { document.querySelector('#taskTimeline').replaceChildren(); document.querySelector('#missionArtifacts').replaceChildren(); return; }
  const tasks = document.querySelector('#taskTimeline'); tasks.replaceChildren(...run.tasks.map(task => { const li = document.createElement('li'), icon = document.createElement('span'), body = document.createElement('span'), state = document.createElement('span'), strong = document.createElement('strong'), small = document.createElement('small'); icon.textContent = ['COMPLETED', 'PASS'].includes(task.status) ? '✓' : task.status === 'RUNNING' ? '●' : task.status === 'FAILED' ? '×' : '○'; strong.textContent = task.title || task.type; small.textContent = `${task.role || 'Orchestrator'}${task.summary ? ` · ${task.summary}` : ''}`; state.textContent = task.status; body.append(strong, small); li.append(icon, body, state); return li; }));
  const context = run.context || {}; document.querySelector('#missionContext').replaceChildren(...metrics({ Files: context.files ?? 0, Ranges: context.ranges ?? 0, Symbols: context.symbols ?? 0, 'Qdrant chunks': context.qdrantChunks ?? 0, 'Estimated tokens': context.estimatedTokens ?? 'Unknown', Pressure: context.pressure ?? 'Unknown' }));
  const [{ artifacts }, { approvals }] = await Promise.all([request(`/api/mission-runs/${run.id}/artifacts?projectId=${encodeURIComponent(mission.projectId)}`), request(`/api/mission-runs/${run.id}/approvals?projectId=${encodeURIComponent(mission.projectId)}`)]);
  document.querySelector('#missionArtifacts').replaceChildren(...artifacts.map(artifact => { const card = document.createElement('div'), heading = document.createElement('strong'), pre = document.createElement('pre'); card.className = 'artifact'; heading.textContent = `${artifact.type} · ${artifact.validationStatus || 'Recorded'}`; pre.textContent = JSON.stringify(artifact.value ?? artifact, null, 2); card.append(heading, pre); return card; }));
  const approvalBox = document.querySelector('#missionApprovals'); approvalBox.replaceChildren(...approvals.map(approval => { const card = document.createElement('div'), label = document.createElement('p'); label.textContent = `${approval.status} · ${approval.requestPreview?.summary || approval.riskLevel}`; card.append(label); if (approval.status === 'PENDING') for (const decision of ['reject', 'approve']) { const button = document.createElement('button'); button.type = 'button'; button.className = decision === 'reject' ? 'danger' : ''; button.textContent = decision === 'reject' ? 'Reject' : 'Approve exact patch'; button.onclick = async () => { try { await request(`/api/mission-runs/${run.id}/approvals/${approval.approvalId}/${decision}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: mission.projectId }) }); await showMission(id); await selectProject(mission.projectId); } catch (error) { missionStatus.textContent = error.message; } }; card.append(button); } return card; }));
  document.querySelector('#missionResult').textContent = JSON.stringify(run.finalResult || { status: run.status, errorCode: run.errorCode, test: run.testResult }, null, 2);
  if (['RUNNING', 'WAITING_APPROVAL'].includes(mission.status) && !missionPoll) missionPoll = setInterval(() => showMission(id).catch(error => { missionStatus.textContent = error.message; }), 3000); else if (!['RUNNING', 'WAITING_APPROVAL'].includes(mission.status) && missionPoll) { clearInterval(missionPoll); missionPoll = null; }
}
document.querySelector('#projectForm').addEventListener('submit', async event => { event.preventDefault(); const data = new FormData(event.currentTarget); try { const project = await request('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: data.get('name'), description: data.get('description'), workspace: { root: data.get('workspaceRoot'), allowedPaths: String(data.get('allowedPaths') || '.').split(',').map(item => item.trim()).filter(Boolean), deniedPaths: [], testCommands: [] }, repositoryIds: selectedValues(document.querySelector('#projectRepositories')), sourceIds: selectedValues(document.querySelector('#projectSources')), modelPreferences: {} }) }); projectStatus.textContent = 'Project registered.'; event.currentTarget.reset(); await refreshProjectChoices(); await selectProject(project.id); } catch (error) { projectStatus.textContent = error.message; } });
document.querySelector('#currentProject').onchange = event => selectProject(event.target.value).catch(error => { projectStatus.textContent = error.message; });
document.querySelector('#projectSearch').oninput = () => refreshProjectChoices().catch(error => { projectStatus.textContent = error.message; });
document.querySelector('#missionSearch').oninput = () => selectedProjectId && selectProject(selectedProjectId).catch(error => { missionStatus.textContent = error.message; });
document.querySelector('#deleteProject').onclick = async () => { if (!selectedProjectId || !confirm('Remove Darkcry project metadata and associations? Workspace, repository, and source files will not be deleted.')) return; try { await request(`/api/projects/${selectedProjectId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true }) }); selectedProjectId = ''; document.querySelector('#deleteProject').disabled = true; await refreshProjectChoices(); await selectProject(''); projectStatus.textContent = 'Project metadata removed.'; } catch (error) { projectStatus.textContent = error.message; } };
document.querySelector('#missionMode').onchange = event => { const dry = document.querySelector('#missionDryRun'); dry.checked = true; dry.disabled = event.target.value === 'RESEARCH'; };
document.querySelector('#runMission').onclick = async () => { if (!selectedProjectId) { missionStatus.textContent = 'Select a project first.'; return; } const requestText = document.querySelector('#missionRequest').value; const mode = document.querySelector('#missionMode').value, dryRun = mode === 'RESEARCH' || document.querySelector('#missionDryRun').checked; try { const mission = await request(`/api/projects/${selectedProjectId}/missions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request: requestText, mode, dryRun }) }); selectedMissionId = mission.id; missionStatus.textContent = 'Mission running through the Orchestrator…'; const running = request(`/api/missions/${mission.id}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: selectedProjectId, dryRun }) }); await showMission(mission.id); const result = await running; missionStatus.textContent = `Mission ${result.status}.`; await showMission(mission.id); await selectProject(selectedProjectId); } catch (error) { missionStatus.textContent = error.message; if (selectedMissionId) await showMission(selectedMissionId).catch(() => {}); } };
document.querySelector('#refreshMissions').onclick = () => selectedProjectId ? selectProject(selectedProjectId).then(() => selectedMissionId && showMission(selectedMissionId)).catch(error => { missionStatus.textContent = error.message; }) : refreshProjectChoices().catch(error => { missionStatus.textContent = error.message; });
refreshProjectChoices().catch(error => { projectStatus.textContent = error.message; });
