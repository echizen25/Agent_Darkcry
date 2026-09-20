import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import mammoth from 'mammoth';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import XLSX from 'xlsx';

const allowed = new Set(['pdf', 'docx', 'pptx', 'xlsx', 'txt', 'md']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const xml = new XMLParser({ ignoreAttributes: false });
const safeName = (name) => path.basename(String(name).replace(/\\/g, '/')).replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120) || 'source';
const publicSource = ({ content, storedName, metadata, ...source }) => source;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 10 }, fileFilter(_req, file, done) {
  const type = path.extname(file.originalname).slice(1).toLowerCase();
  done(allowed.has(type) ? null : new Error('Unsupported file type.'), allowed.has(type));
} });

function texts(node) {
  if (node == null) return [];
  if (Array.isArray(node)) return node.flatMap(texts);
  if (typeof node !== 'object') return [];
  return Object.entries(node).flatMap(([key, value]) => key === 'a:t' ? [String(value)] : texts(value));
}

async function extract(type, buffer) {
  if (type === 'txt' || type === 'md') return { content: buffer.toString('utf8'), metadata: {} };
  if (type === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    return { content: result.value, metadata: { paragraphs: result.value.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean) } };
  }
  if (type === 'pdf') {
    const pages = [];
    const document = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, disableFontFace: true }).promise;
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const data = await page.getTextContent();
      const text = data.items.map(item => item.str).join(' ');
      pages.push({ page: number, text });
    }
    return { content: pages.map(p => `Page ${p.page}\n${p.text}`).join('\n\n'), metadata: { pageCount: document.numPages, pages } };
  }
  if (type === 'xlsx') {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheets = workbook.SheetNames.map(name => ({ name, rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', raw: false }) }));
    return { content: sheets.map(s => `Sheet: ${s.name}\n${s.rows.map(row => row.join('\t')).join('\n')}`).join('\n\n'), metadata: { sheets } };
  }
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/slide(\d+)/)[1]) - Number(b.match(/slide(\d+)/)[1]));
  const slides = [];
  for (const name of slideFiles) {
    const doc = xml.parse(await zip.file(name).async('string'));
    const paragraphs = [];
    const visit = node => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(visit);
      for (const [key, value] of Object.entries(node)) {
        if (key === 'a:p') {
          for (const p of Array.isArray(value) ? value : [value]) {
            const line = texts(p).join('').trim();
            if (line) paragraphs.push(line);
          }
        } else visit(value);
      }
    };
    visit(doc);
    slides.push({ slide: Number(name.match(/slide(\d+)/)[1]), text: paragraphs.join('\n') });
  }
  return { content: slides.map(s => `Slide ${s.slide}\n${s.text}`).join('\n\n'), metadata: { slides } };
}

export function sourceRouter(root) {
  const uploads = path.join(root, 'data', 'uploads');
  const records = path.join(root, 'data', 'sources');
  const router = Router();
  const dirs = () => Promise.all([mkdir(uploads, { recursive: true }), mkdir(records, { recursive: true })]);
  const recordPath = id => path.join(records, `${id}.json`);
  const save = source => writeFile(recordPath(source.id), JSON.stringify(source, null, 2));

  router.post('/upload', upload.array('files', 10), async (req, res, next) => {
    try {
      if (!req.files?.length) return res.status(400).json({ error: 'Choose at least one file.' });
      await dirs();
      const sources = [];
      for (const file of req.files) {
        const id = randomUUID();
        const originalName = safeName(file.originalname);
        const type = path.extname(originalName).slice(1).toLowerCase();
        const storedName = `${id}.${type}`;
        await writeFile(path.join(uploads, storedName), file.buffer);
        const source = { id, originalName, type, size: file.size, uploadedAt: new Date().toISOString(), extractionStatus: 'ready', content: '', metadata: {}, storedName };
        try { Object.assign(source, await extract(type, file.buffer)); }
        catch (error) { source.extractionStatus = 'failed'; source.metadata = { error: error.message }; }
        await save(source);
        sources.push(publicSource(source));
      }
      res.status(201).json({ sources });
    } catch (error) { next(error); }
  });

  router.post('/notes', async (req, res, next) => {
    try {
      const content = req.body?.content;
      if (typeof content !== 'string' || !content.trim()) return res.status(400).json({ error: 'Notes cannot be empty.' });
      if (content.length > 100000) return res.status(400).json({ error: 'Notes are too long.' });
      await dirs();
      const source = { id: randomUUID(), originalName: 'Pasted notes', type: 'notes', size: Buffer.byteLength(content), uploadedAt: new Date().toISOString(), extractionStatus: 'ready', content, metadata: {} };
      await save(source);
      res.status(201).json(publicSource(source));
    } catch (error) { next(error); }
  });

  router.get('/', async (_req, res, next) => {
    try {
      await dirs();
      const files = (await readdir(records)).filter(name => /^[0-9a-f-]+\.json$/.test(name));
      const sources = await Promise.all(files.map(async name => publicSource(JSON.parse(await readFile(path.join(records, name), 'utf8')))));
      res.json({ sources: sources.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)) });
    } catch (error) { next(error); }
  });
  router.get('/:id', async (req, res, next) => {
    if (!uuid.test(req.params.id)) return res.sendStatus(400);
    try { const { storedName, ...source } = JSON.parse(await readFile(recordPath(req.params.id), 'utf8')); res.json(source); }
    catch (error) { if (error.code === 'ENOENT') return res.sendStatus(404); next(error); }
  });
  router.delete('/:id', async (req, res, next) => {
    if (!uuid.test(req.params.id)) return res.sendStatus(400);
    try {
      const source = JSON.parse(await readFile(recordPath(req.params.id), 'utf8'));
      await rm(recordPath(source.id));
      if (source.storedName) await rm(path.join(uploads, source.storedName), { force: true });
      res.sendStatus(204);
    } catch (error) { if (error.code === 'ENOENT') return res.sendStatus(404); next(error); }
  });
  return router;
}
