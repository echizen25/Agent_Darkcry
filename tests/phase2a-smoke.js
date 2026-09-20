import assert from 'node:assert/strict';
import JSZip from 'jszip';
import XLSX from 'xlsx';
import pptxgen from 'pptxgenjs';
import PDFDocument from 'pdfkit';

const base = process.env.TEST_URL || 'http://127.0.0.1:3001';
const call = async (route, options) => {
  const response = await fetch(base + route, options);
  return { status: response.status, data: response.status === 204 ? null : response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text() };
};
const upload = async (name, bytes) => {
  const form = new FormData();
  form.append('files', new Blob([bytes]), name);
  const result = await call('/api/sources/upload', { method: 'POST', body: form });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  const detail = await call(`/api/sources/${result.data.sources[0].id}`);
  assert.equal(detail.data.extractionStatus, 'ready', JSON.stringify(detail.data.metadata));
  return detail.data;
};
function pdfBuffer() {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument(); const chunks = [];
    document.on('data', chunk => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
    document.text('PDF sample text'); document.end();
  });
}

assert.equal((await call('/')).data.status, 'ok');
assert.match((await upload('sample.txt', Buffer.from('TXT sample content'))).content, /TXT sample content/);
assert.match((await upload('sample.md', Buffer.from('# Markdown sample'))).content, /Markdown sample/);
const zip = new JSZip();
zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DOCX sample paragraph</w:t></w:r></w:p></w:body></w:document>');
assert.match((await upload('sample.docx', await zip.generateAsync({ type: 'nodebuffer' }))).content, /DOCX sample paragraph/);
const deck = new pptxgen(); deck.layout = 'LAYOUT_WIDE';
deck.addSlide().addText('PPTX first slide', { x: 1, y: 1, w: 5, h: 1 });
deck.addSlide().addText('PPTX second slide', { x: 1, y: 1, w: 5, h: 1 });
const pptx = await upload('sample.pptx', await deck.write({ outputType: 'nodebuffer' }));
assert.equal(pptx.metadata.slides.length, 2);
assert.match(pptx.metadata.slides[1].text, /PPTX second slide/);
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Item', 'Value'], ['Sample', 42]]), 'Data');
const xlsx = await upload('sample.xlsx', XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
assert.equal(xlsx.metadata.sheets[0].name, 'Data');
assert.match(xlsx.content, /Sample\t42/);
const pdf = await upload('sample.pdf', await pdfBuffer());
assert.match(pdf.content, /PDF sample text/);
assert.equal(pdf.metadata.pages.length, 1);
const notes = await call('/api/sources/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'Pasted sample notes' }) });
assert.equal(notes.status, 201);
assert.match((await call(`/api/sources/${notes.data.id}`)).data.content, /Pasted sample notes/);
const listed = (await call('/api/sources')).data.sources;
assert.ok(listed.length >= 7);
assert.ok(listed.every(source => !('content' in source) && !('metadata' in source)));
assert.equal((await call(`/api/sources/${notes.data.id}`, { method: 'DELETE' })).status, 204);
assert.equal((await call(`/api/sources/${notes.data.id}`)).status, 404);
const multiple = new FormData();
multiple.append('files', new Blob(['first']), 'first.txt');
multiple.append('files', new Blob(['second']), 'second.md');
const batch = await call('/api/sources/upload', { method: 'POST', body: multiple });
assert.equal(batch.status, 201);
assert.equal(batch.data.sources.length, 2);
const bad = new FormData(); bad.append('files', new Blob(['invalid']), 'bad.exe');
assert.equal((await call('/api/sources/upload', { method: 'POST', body: bad })).status, 400);
const generated = await call('/api/presentations/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: 'Phase 2A regression', slideCount: 5 }) });
assert.equal(generated.status, 201);
assert.equal(generated.data.outline.length, 5);
console.log('Passed: health, TXT, MD, DOCX, PPTX, XLSX, PDF, notes, list, multiple upload, delete, rejection, presentation generation');
