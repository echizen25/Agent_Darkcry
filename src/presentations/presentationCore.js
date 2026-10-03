import { createHash } from 'node:crypto';
import { buildEvidencePack, safeFilename as documentFilename } from '../documents/documentCore.js';
import { ContextBudgetManager } from '../development/contextBudgetManager.js';
import { groundingEvaluator } from '../evaluation/groundingEvaluator.js';

export const PRESENTATION_TYPES = ['EXECUTIVE', 'PROJECT_UPDATE', 'ACCOMPLISHMENT', 'TECHNICAL', 'RESEARCH', 'TRAINING', 'BRIEFING', 'GENERAL'];
export const SLIDE_TYPES = ['TITLE', 'SECTION', 'CONTENT', 'BULLETS', 'METRIC', 'COMPARISON', 'TIMELINE', 'PROCESS', 'TABLE', 'CHART', 'IMAGE', 'QUOTE', 'SUMMARY', 'CLOSING'];
export const BLOCK_TYPES = ['TEXT', 'BULLETS', 'METRIC', 'TABLE', 'CHART', 'IMAGE_PLACEHOLDER', 'QUOTE', 'CALLOUT', 'FOOTNOTE', 'SHAPE'];
export const LAYOUTS = ['TITLE', 'TITLE_CONTENT', 'TITLE_TWO_COLUMN', 'TITLE_METRIC', 'TITLE_CHART', 'TITLE_TABLE', 'TITLE_TIMELINE', 'TITLE_PROCESS', 'TITLE_IMAGE', 'SECTION', 'SUMMARY', 'CLOSING'];
export const THEMES = Object.freeze({ PROFESSIONAL: { font: 'Aptos', fallbackFont: 'Arial', background: 'F7F9FC', ink: '172B4D', accent: '2463EB', soft: 'E6EDFF', titleSize: 30, bodySize: 21, margin: .75 }, MINIMAL: { font: 'Arial', fallbackFont: 'Arial', background: 'FFFFFF', ink: '202938', accent: '155E75', soft: 'E5F3F5', titleSize: 30, bodySize: 21, margin: .75 } });
export const LIMITS = Object.freeze({ maxTitle: 100, maxBullet: 180, maxBullets: 6, maxText: 600, maxWords: 140, maxBlocks: 6, maxRows: 8, maxColumns: 6, maxNotes: 3000, maxIRBytes: 250000, maxEvidencePerSlide: 5 });
export const invalid = message => Object.assign(new Error(message), { code: 'PRESENTATION_INVALID', status: 400 });
const text = (v, max, fallback = '') => { if (v === undefined) return fallback; if (typeof v !== 'string' || v.length > max || v.includes('\0')) throw invalid('Invalid bounded text.'); return v.trim(); };
const list = (v, max) => { if (v === undefined) return []; if (!Array.isArray(v) || v.length > max) throw invalid('Invalid bounded list.'); return v; };
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().filter(k => !['createdAt', 'generatedAt'].includes(k)).map(k => [k, canonical(v[k])])) : v;
export const fingerprint = v => createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
export const safeFilename = v => documentFilename(v).replace(/\.docx$/, '.pptx');

export function validateSpecification(input = {}, request = '') {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('Invalid specification.');
  const presentationType = input.presentationType || 'GENERAL', language = input.language || 'English', theme = input.theme || 'PROFESSIONAL';
  if (!PRESENTATION_TYPES.includes(presentationType) || !['English', 'Filipino', 'Taglish'].includes(language) || !Object.hasOwn(THEMES, theme) || (input.sourcePolicy !== undefined && input.sourcePolicy !== 'PROJECT_ONLY')) throw invalid('Invalid type, language, theme or source policy.');
  const requested = request.match(/\b(\d{1,3})[ -]slides?\b/i), targetSlideCount = input.targetSlideCount ?? (requested ? Number(requested[1]) : 8);
  if (!Number.isInteger(targetSlideCount) || targetSlideCount < 3 || targetSlideCount > 40) throw invalid('Slide count must be 3–40.');
  const durationMinutes = input.durationMinutes ?? null;
  if (durationMinutes !== null && (!Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 180)) throw invalid('Duration must be 1–180 minutes.');
  const requiredTopics = list(input.requiredTopics, 20).map(v => text(v, 120));
  if (input.title !== undefined && !text(input.title, 100) || requiredTopics.some(v => !v)) throw invalid('Title and required topics must be nonempty.');
  return { title: text(input.title, 100, request.slice(0, 100) || 'Project Presentation'), purpose: text(input.purpose, 500, request.slice(0, 500)), audience: text(input.audience, 120, 'Project stakeholders'), language, tone: text(input.tone, 80, 'Professional'), presentationType, targetSlideCount, durationMinutes, period: text(input.period, 100), theme, sourcePolicy: 'PROJECT_ONLY', requiredTopics, constraints: { ...LIMITS, maxRevisions: 2, allowPlaceholders: input.allowPlaceholders === true } };
}

export function presentationEvidence(records, spec, projectId, budget = new ContextBudgetManager()) {
  if (records.some(r => r.projectId && r.projectId !== projectId)) throw invalid('Cross-project source rejected.');
  const pack = buildEvidencePack(records, { ...spec, requiredFacts: spec.requiredTopics }, projectId);
  const selected = budget.select(pack.items.map(item => ({ key: item.id, value: item, priority: item.relevance === 'PERIOD_MATCH' ? 2 : 1 })), { role: 'research', budget: 4000 });
  return { ...pack, items: selected.items.map(item => item.value), estimatedTokens: selected.estimatedTokens, pressure: selected.pressure, budget: selected.budget, retrieval: { mode: 'DIRECT_PROJECT_SOURCES', semanticUsed: false, limitation: 'Only associated project sources were read; no semantic retrieval performed.' } };
}
function checkRefs(refs, pack, location, issues) {
  if (!Array.isArray(refs) || refs.length > LIMITS.maxEvidencePerSlide) { issues.push({ type: 'INVALID_EVIDENCE_REFS', location }); return []; }
  const cited = [];
  for (const id of refs) { const item = pack.items.find(v => v.id === id); if (!item) issues.push({ type: 'UNKNOWN_EVIDENCE', location, evidenceId: id }); else if (item.projectId !== pack.projectId) issues.push({ type: 'CROSS_PROJECT_EVIDENCE', location, evidenceId: id }); else cited.push(item); }
  return cited;
}
const report = issues => ({ status: issues.length ? 'FAIL' : 'PASS', issues });
export function validateNarrative(value, pack) {
  const issues = [];
  if (!value || typeof value.coreMessage !== 'string' || !value.coreMessage.trim() || value.coreMessage.length > 500 || typeof value.audienceTakeaway !== 'string' || !value.audienceTakeaway.trim() || value.audienceTakeaway.length > 500 || !Array.isArray(value.sections) || !value.sections.length || value.sections.length > 38) return report([{ type: 'INVALID_NARRATIVE' }]);
  for (const section of value.sections) { if (!section || typeof section.purpose !== 'string' || !section.purpose.trim() || section.purpose.length > 300 || typeof section.message !== 'string' || !section.message.trim() || section.message.length > 600) issues.push({ type: 'INVALID_NARRATIVE_SECTION' }); checkRefs(section?.evidenceRefs, pack, section?.purpose, issues); }
  return report(issues);
}
export function validateStoryboard(value, spec, pack) {
  const issues = [], ids = new Set();
  if (!Array.isArray(value?.slides) || value.slides.length !== spec.targetSlideCount) return report([{ type: 'SLIDE_COUNT' }]);
  if (value.slides[0]?.type !== 'TITLE') issues.push({ type: 'TITLE_SLIDE_REQUIRED' });
  for (const slide of value.slides) { if (!slide || typeof slide.id !== 'string' || !/^slide-[\w-]{1,40}$/.test(slide.id) || ids.has(slide.id)) issues.push({ type: 'DUPLICATE_OR_INVALID_ID' }); ids.add(slide?.id); if (!SLIDE_TYPES.includes(slide?.type) || ['purpose', 'headline', 'message'].some(k => typeof slide?.[k] !== 'string' || !slide[k].trim() || slide[k].length > (k === 'headline' ? 100 : 600))) issues.push({ type: 'INVALID_STORYBOARD_SLIDE', location: slide?.id }); checkRefs(slide?.evidenceRefs, pack, slide?.id, issues); }
  for (const topic of spec.requiredTopics) if (!JSON.stringify(value).toLowerCase().includes(topic.toLowerCase())) issues.push({ type: 'REQUIRED_TOPIC_MISSING', location: topic });
  return report(issues);
}
export const blockText = b => b.type === 'TABLE' ? [...(Array.isArray(b.columns) ? b.columns : []), ...(Array.isArray(b.rows) ? b.rows : []).flat()].join(' ') : b.type === 'CHART' ? [ ...(Array.isArray(b.categories) ? b.categories : []), ...(Array.isArray(b.series) ? b.series : []).flatMap(s => [s?.name, ...(Array.isArray(s?.values) ? s.values : [])]) ].join(' ') : b.type === 'METRIC' ? `${b.value} ${b.label}` : Array.isArray(b.items) ? b.items.map(v => typeof v === 'string' ? v : [v?.date, v?.label, v?.description].filter(Boolean).join(' ')).join(' ') : b.text || b.label || '';

export function validatePresentationIR(ir, spec, pack) {
  const issues = [], warnings = [], ids = new Set(), titles = new Set(), body = new Set(), summary = new Set(), bodyRefs = new Set(), summaryRefs = new Set(), metrics = new Map();
  const add = (type, location, details = {}) => issues.push({ type, location, ...details });
  if (!ir || Buffer.byteLength(JSON.stringify(ir)) > LIMITS.maxIRBytes) return report([{ type: 'IR_SIZE_OR_MISSING' }]);
  if (ir.metadata?.title !== spec.title || ir.metadata?.projectId !== pack.projectId || !Number.isInteger(ir.metadata?.revision) || ir.metadata.revision < 1 || ir.theme !== spec.theme) add('INVALID_METADATA', 'metadata');
  if (!Array.isArray(ir.slides) || ir.slides.length !== spec.targetSlideCount) return report([...issues, { type: 'SLIDE_COUNT' }]);
  if (ir.slides[0]?.type !== 'TITLE') add('TITLE_SLIDE_REQUIRED', 'slides');
  const claims = [];
  for (const slide of ir.slides) {
    if (!slide || typeof slide !== 'object') { add('INVALID_SLIDE', 'slides'); continue; }
    const loc = slide.id;
    if (typeof loc !== 'string' || !/^slide-[\w-]{1,40}$/.test(loc) || ids.has(loc)) add('DUPLICATE_OR_INVALID_ID', loc); ids.add(loc);
    if (!SLIDE_TYPES.includes(slide.type)) add('INVALID_SLIDE_TYPE', loc);
    if (typeof slide.title !== 'string' || !slide.title.trim() || slide.title.length > LIMITS.maxTitle) add('TITLE_BOUNDS', loc);
    if (slide.subtitle !== undefined && (typeof slide.subtitle !== 'string' || slide.subtitle.length > 200)) add('SUBTITLE_BOUNDS', loc);
    const titleKey = String(slide.title).toLowerCase(); if (titles.has(titleKey)) add('DUPLICATE_TITLE', loc); titles.add(titleKey);
    if (typeof slide.purpose !== 'string' || !slide.purpose.trim() || slide.purpose.length > 300 || typeof slide.message !== 'string' || !slide.message.trim() || slide.message.length > 600) add('SLIDE_PURPOSE_MESSAGE', loc);
    if (!LAYOUTS.includes(slide.visualIntent?.layout) || !['NONE', 'TEXT', 'METRIC', 'TABLE', 'CHART', 'PROCESS', 'TIMELINE', 'COMPARISON', 'IMAGE_PLACEHOLDER'].includes(slide.visualIntent?.visualType)) add('INVALID_VISUAL_INTENT', loc);
    const slideEvidence = checkRefs(slide.evidenceRefs, pack, loc, issues);
    for (const id of Array.isArray(slide.evidenceRefs) ? slide.evidenceRefs : []) (slide.type === 'SUMMARY' ? summaryRefs : bodyRefs).add(id);
    const headerItems = [slide.title, slide.subtitle, slide.message, ...(Array.isArray(slide.speakerNotes) ? slide.speakerNotes : [])].filter(v => typeof v === 'string');
    const headers = headerItems.join(' '), sourceHeaders = slideEvidence.map(e => e.text).join(' ');
    for (const content of headerItems.filter(v => /\b(?:was|were|completed|conducted|reported|achieved|total|won|increased|decreased)\b|\d/i.test(v))) { if (!slideEvidence.length) add('MISSING_EVIDENCE', loc); else claims.push({ text: content, location: loc, evidence: slideEvidence.map(e => ({ chunkId: e.id, quote: e.text })) }); }
    for (const n of headers.match(/\b\d+(?:[.,]\d+)?%?/g) || []) if (!(sourceHeaders.match(/\b\d+(?:[.,]\d+)?%?/g) || []).includes(n)) add('UNSUPPORTED_NUMERIC_CLAIM', loc, { value: n });
    for (const d of headers.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/gi) || []) if (!sourceHeaders.toLowerCase().includes(d.toLowerCase())) add('UNSUPPORTED_DATE_CLAIM', loc, { value: d });
    if (!Array.isArray(slide.blocks) || slide.blocks.length > LIMITS.maxBlocks || (!slide.blocks.length && !['TITLE', 'SECTION', 'CLOSING'].includes(slide.type))) add('BLOCK_COUNT', loc);
    if (!Array.isArray(slide.speakerNotes) || slide.speakerNotes.some(n => typeof n !== 'string') || slide.speakerNotes.join(' ').length > LIMITS.maxNotes) add('NOTES_BOUNDS', loc);
    let words = 0;
    for (const [index, b] of (Array.isArray(slide.blocks) ? slide.blocks : []).entries()) {
      const location = `${loc}/block:${index}`;
      if (!b || !BLOCK_TYPES.includes(b.type)) { add('INVALID_BLOCK_TYPE', location); continue; }
      const cited = checkRefs(b.evidenceRefs, pack, location, issues), value = blockText(b), content = typeof value === 'string' ? value : '';
      if (Array.isArray(b.evidenceRefs) && b.evidenceRefs.some(id => !Array.isArray(slide.evidenceRefs) || !slide.evidenceRefs.includes(id))) add('SLIDE_EVIDENCE_MISSING', location);
      words += content.split(/\s+/).length;
      if (/\b(TODO|TBD|INSERT HERE|Lorem ipsum)\b|\[(NAME|DATE)\]/i.test(content) && !spec.constraints.allowPlaceholders) add('UNRESOLVED_PLACEHOLDER', location);
      if (b.path || b.url || b.assetId || b.html || b.code || b.type === 'SHAPE' && !['RECT', 'LINE', 'CIRCLE'].includes(b.shape)) add('INVALID_ASSET_OR_CODE', location);
      if (b.type === 'IMAGE_PLACEHOLDER' && (typeof b.label !== 'string' || !b.label || b.label.length > 180)) add('INVALID_IMAGE_PLACEHOLDER', location);
      if (b.type === 'TABLE' && (!Array.isArray(b.columns) || !b.columns.length || b.columns.length > LIMITS.maxColumns || !Array.isArray(b.rows) || !b.rows.length || b.rows.length > LIMITS.maxRows || b.rows.some(r => !Array.isArray(r) || r.length !== b.columns.length || r.some(c => !['string', 'number'].includes(typeof c) || String(c).length > 180)) || b.columns.some(c => typeof c !== 'string' || c.length > 100))) add('MALFORMED_OR_OVERSIZED_TABLE', location);
      if (b.type === 'CHART' && (!['BAR', 'COLUMN', 'LINE', 'PIE', 'DOUGHNUT'].includes(b.chartType) || !Array.isArray(b.categories) || b.categories.length < 2 || b.categories.length > 12 || b.categories.some(v => typeof v !== 'string' || !v || v.length > 80) || !Array.isArray(b.series) || !b.series.length || b.series.length > 4 || b.series.some(s => !s || typeof s.name !== 'string' || !Array.isArray(s.values) || s.values.length !== b.categories.length || s.values.some(v => !Number.isFinite(v))) || ['PIE', 'DOUGHNUT'].includes(b.chartType) && (b.series.length !== 1 || b.series[0].values.some(v => v < 0)))) add('INVALID_CHART', location);
      if (b.type === 'BULLETS' && (!Array.isArray(b.items) || !b.items.length || b.items.length > LIMITS.maxBullets || b.items.some(v => typeof v === 'string' ? v.length > LIMITS.maxBullet : !v || typeof v.label !== 'string' || v.label.length > LIMITS.maxBullet || v.date && typeof v.date !== 'string'))) add('BULLET_DENSITY', location);
      if (b.type === 'METRIC' && (!['string', 'number'].includes(typeof b.value) || typeof b.label !== 'string' || !b.label || b.label.length > 120)) add('INVALID_METRIC', location);
      if (['TEXT', 'QUOTE', 'CALLOUT', 'FOOTNOTE'].includes(b.type) && (typeof b.text !== 'string' || !b.text.trim() || b.text.length > LIMITS.maxText)) add('TEXT_DENSITY', location);
      if (!['IMAGE_PLACEHOLDER', 'SHAPE'].includes(b.type) && content && !cited.length) add('MISSING_EVIDENCE', location);
      const citedText = cited.map(c => c.text).join(' '), numberTokens = content.match(/\b\d+(?:[.,]\d+)?%?/g) || [], supportedNumbers = new Set(citedText.match(/\b\d+(?:[.,]\d+)?%?/g) || []);
      if (b.type === 'CHART' && Array.isArray(b.categories) && Array.isArray(b.series) && b.categories.every(c => typeof c === 'string')) {
        // Conservatively bind each category to numbers in its source segment,
        // rather than merely finding both numbers anywhere in an excerpt.
        const lower = citedText.toLowerCase();
        for (const [ci, category] of b.categories.entries()) for (const s of b.series) {
          const start = lower.indexOf(category.toLowerCase());
          const ends = b.categories.filter(c => c !== category).map(c => lower.indexOf(c.toLowerCase(), start + category.length)).filter(pos => pos > start);
          const segment = start < 0 ? '' : citedText.slice(start, ends.length ? Math.min(...ends) : undefined);
          if (!s?.values || !(segment.match(/\b\d+(?:[.,]\d+)?%?/g) || []).includes(String(s.values[ci]))) add('CHART_CATEGORY_VALUE_UNSUPPORTED', location, { category, value: s?.values?.[ci] });
        }
      }
      if (b.type === 'METRIC' && typeof b.label === 'string') { const key = b.label.toLowerCase().replace(/\W+/g, ' '), value = String(b.value); if (metrics.has(key) && metrics.get(key) !== value) add('METRIC_CONTRADICTION', location, { label: b.label }); metrics.set(key, value); }
      const blockCount = Array.isArray(slide.blocks) ? slide.blocks.length : 0, columns = slide.visualIntent?.layout === 'TITLE_TWO_COLUMN', rows = columns ? Math.ceil(blockCount / 2) : blockCount, hero = ['TITLE', 'SECTION', 'CLOSING'].includes(slide.visualIntent?.layout), height = (hero ? 2.55 : 4.25) / Math.max(1, rows) - .31;
      const width = columns ? 5.26 : 11.56, font = b.type === 'FOOTNOTE' ? 12 : 21;
      const estimatedLines = Math.max(1, Math.ceil(content.length / Math.max(1, width * 72 / (font * .55))));
      if (['TEXT', 'CALLOUT', 'QUOTE', 'FOOTNOTE'].includes(b.type) && estimatedLines * font * 1.2 / 72 > height || b.type === 'CHART' && height < 2 || b.type === 'TABLE' && Array.isArray(b.rows) && (b.rows.length + 1) * .35 > height) add('LIKELY_OVERFLOW', location, { estimatedLines, height });
      for (const n of numberTokens) if (!supportedNumbers.has(n)) add('UNSUPPORTED_NUMERIC_CLAIM', location, { value: n });
      for (const d of content.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/gi) || []) if (!citedText.toLowerCase().includes(d.toLowerCase())) add('UNSUPPORTED_DATE_CLAIM', location, { value: d });
      if (b.type === 'QUOTE' && !citedText.includes(content)) add('UNSUPPORTED_QUOTE', location);
      if (content && cited.length) claims.push({ text: content, location, evidence: cited.map(c => ({ chunkId: c.id, quote: c.text })) });
      for (const n of numberTokens) (slide.type === 'SUMMARY' ? summary : body).add(n);
    }
    if (words > LIMITS.maxWords || (slide.blocks?.length || 0) > 4 && words > 90) add('LIKELY_OVERFLOW', loc, { words });
    if (words > 90) warnings.push({ type: 'DENSE_SLIDE', location: loc });
  }
  for (const n of summary) if (!body.has(n)) add('SUMMARY_INCONSISTENCY', 'summary', { value: n });
  for (const id of summaryRefs) if (!bodyRefs.has(id)) add('SUMMARY_NEW_EVIDENCE', 'summary', { evidenceId: id });
  for (const topic of spec.requiredTopics) if (!JSON.stringify(ir.slides).toLowerCase().includes(topic.toLowerCase())) add('REQUIRED_TOPIC_MISSING', topic);
  for (const entry of pack.coverage || []) if (entry.status === 'UNSUPPORTED') add('REQUIRED_TOPIC_UNSUPPORTED', entry.fact);
  const grounded = groundingEvaluator.evaluate({ result: { data: { claims, retrievedContext: { items: pack.items.map(c => ({ chunkId: c.id, text: c.text })) }, question: spec.purpose, projectId: pack.projectId, limitations: [] } } });
  issues.push(...grounded.issues.map(issue => ({ ...issue, location: claims[Number(issue.location?.split(':')[1])]?.location || issue.location })));
  return { ...report(issues), warnings, fingerprint: fingerprint(ir), counts: { slides: ir.slides.length, evidence: pack.items.length }, overflowMethod: 'Character, word, block and table bounds; no PowerPoint layout engine.' };
}
