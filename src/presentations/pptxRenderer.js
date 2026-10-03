import { mkdir, readFile, stat, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import JSZip from 'jszip';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { renderPresentationIR } from '../renderer.js';
import { validatePresentationIR, safeFilename, fingerprint, blockText, invalid } from './presentationCore.js';

export async function renderPptx({ ir, specification, evidencePack, outputDir }) {
  const qa = validatePresentationIR(ir, specification, evidencePack);
  if (qa.status !== 'PASS') throw Object.assign(invalid('IR failed rendering gate.'), { issues: qa.issues });
  await mkdir(outputDir, { recursive: true });
  const filename = safeFilename(specification.title), filePath = path.join(outputDir, filename);
  try { await renderPresentationIR(ir, filePath, evidencePack); }
  catch (error) { await rm(filePath, { force: true }); throw error; }
  const data = await readFile(filePath);
  return { path: filePath, filename, mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', size: data.length, fileHash: createHash('sha256').update(data).digest('hex'), irFingerprint: fingerprint(ir), revision: ir.metadata.revision };
}
export async function validatePptx(file, ir) {
  const issues = [], parser = new XMLParser({ ignoreAttributes: false }), text = v => typeof v === 'string' || typeof v === 'number' ? [String(v)] : Array.isArray(v) ? v.flatMap(text) : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, value]) => k === 'a:t' ? text(value) : k.startsWith('@_') ? [] : text(value)) : [];
  try {
    const data = await readFile(file), zip = await JSZip.loadAsync(data, { checkCRC32: true });
    for (const name of ['[Content_Types].xml', '_rels/.rels', 'ppt/presentation.xml', 'ppt/_rels/presentation.xml.rels']) if (!zip.file(name)) issues.push({ type: 'PPTX_PACKAGE_MISSING', location: name });
    const slides = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/(\d+)\.xml$/)[1]) - Number(b.match(/(\d+)\.xml$/)[1]));
    if (slides.length !== ir.slides.length) issues.push({ type: 'PPTX_SLIDE_COUNT' });
    let tables = 0, charts = 0, editableObjects = 0;
    for (const [index, name] of slides.entries()) {
      const xml = await zip.file(name).async('string'); if (XMLValidator.validate(xml) !== true) issues.push({ type: 'PPTX_INVALID_XML', location: name });
      const allText = text(parser.parse(xml)).join(' '), expected = ir.slides[index];
      if (!expected || !allText.includes(expected.title)) issues.push({ type: 'PPTX_TITLE_MISSING', location: name });
      for (const b of expected?.blocks || []) if (['TEXT', 'QUOTE', 'CALLOUT', 'FOOTNOTE'].includes(b.type) && !allText.includes(blockText(b))) issues.push({ type: 'PPTX_TEXT_MISSING', location: name });
      for (const b of expected?.blocks || []) {
        const parts = b.type === 'METRIC' ? [b.value, b.label] : b.type === 'TABLE' ? [...b.columns, ...b.rows.flat()] : b.type === 'BULLETS' ? b.items.flatMap(v => typeof v === 'string' ? [v] : [v.date, v.label, v.description].filter(Boolean)) : [];
        if (parts.some(part => !allText.replace(/\s+/g, ' ').includes(String(part).replace(/\s+/g, ' ')))) issues.push({ type: 'PPTX_BLOCK_TEXT_MISSING', location: name });
      }
      tables += (xml.match(/<a:tbl>/g) || []).length; charts += (xml.match(/<c:chart\b/g) || []).length; editableObjects += (xml.match(/<p:sp>/g) || []).length;
      if (!xml.includes('<p:sp>')) issues.push({ type: 'PPTX_NOT_EDITABLE', location: name });
    }
    for (const name of Object.keys(zip.files).filter(n => n.endsWith('.xml') || n.endsWith('.rels'))) {
      const xml = await zip.file(name).async('string'); if (XMLValidator.validate(xml) !== true) issues.push({ type: 'PPTX_INVALID_XML', location: name });
      if (name.endsWith('.rels')) { const parsed = parser.parse(xml), rels = parsed.Relationships?.Relationship || []; for (const r of Array.isArray(rels) ? rels : [rels]) if (r['@_TargetMode'] !== 'External') { const dir = name === '_rels/.rels' ? '' : path.posix.dirname(name).replace(/\/_rels$/, ''); const rawTarget = r['@_Target'] || ''; const target = path.posix.normalize(rawTarget.startsWith('/') ? rawTarget.slice(1) : path.posix.join(dir, rawTarget)); if (!zip.file(target)) issues.push({ type: 'PPTX_BROKEN_RELATIONSHIP', location: target }); } }
    }
    const requiredTables = ir.slides.flatMap(s => s.blocks).filter(b => b.type === 'TABLE').length, requiredCharts = ir.slides.flatMap(s => s.blocks).filter(b => b.type === 'CHART').length;
    if (tables !== requiredTables || charts !== requiredCharts) issues.push({ type: 'PPTX_NATIVE_OBJECT_MISSING' });
    return { status: issues.length ? 'FAIL' : 'PASS', issues, size: data.length, slideCount: slides.length, editableObjects, tables, charts, fileHash: createHash('sha256').update(data).digest('hex'), limitations: ['Structural checks do not measure PowerPoint visual layout or font substitution.'] };
  } catch { return { status: 'FAIL', issues: [{ type: 'PPTX_INVALID_PACKAGE' }], size: (await stat(file).catch(() => ({ size: 0 }))).size }; }
}
