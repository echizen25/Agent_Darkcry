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
