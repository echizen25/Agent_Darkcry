import pptxgen from 'pptxgenjs';
import { THEMES, blockText } from './presentations/presentationCore.js';

const themes = {
  modern: { bg: 'F7F9FC', ink: '172B4D', accent: '2463EB', soft: 'E6EDFF' },
  classic: { bg: 'FAF8F3', ink: '25313D', accent: '936B39', soft: 'EEE6D8' },
  bold: { bg: '111827', ink: 'F9FAFB', accent: '60A5FA', soft: '24344B' }
};

export async function renderPresentation(plan, filePath) {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'PowerPoint Agent';
  pptx.subject = plan.topic;
  pptx.title = plan.title;
  pptx.lang = 'en-US';
  const t = themes[plan.style];
  const shape = pptx.ShapeType;
  const text = (slide, value, x, y, w, h, size, options = {}) => slide.addText(value, {
    x, y, w, h, fontFace: 'Aptos', fontSize: size, color: t.ink,
    margin: 0, breakLine: false, valign: 'mid', fit: 'shrink',
    ...options
  });
  const base = (item, index) => {
    const slide = pptx.addSlide();
    slide.background = { color: t.bg };
    slide.addShape(shape.rect, { x: 0, y: 0, w: 0.12, h: 7.5, line: { color: t.accent }, fill: { color: t.accent } });
    text(slide, String(index + 1).padStart(2, '0'), 12.05, 6.92, 0.55, 0.22, 10, { color: t.accent, align: 'right' });
    if (item.layout !== 'title') text(slide, item.title, 0.75, 0.55, 11.7, 0.65, 30, { bold: true });
    return slide;
  };
  plan.slides.forEach((item, index) => {
    const slide = base(item, index);
    if (item.layout === 'title') {
      text(slide, item.title, 0.8, 1.65, 11.6, 1.55, 45, { bold: true });
      slide.addShape(shape.line, { x: 0.8, y: 3.48, w: 2.1, h: 0, line: { color: t.accent, width: 3 } });
      text(slide, item.subtitle, 0.8, 3.8, 10.9, 0.9, 21);
      text(slide, `Prepared for ${plan.audience}`, 0.8, 6.35, 10.5, 0.4, 13, { color: t.accent });
    } else if (item.layout === 'content') {
      item.points.forEach((point, i) => {
        slide.addShape(shape.ellipse, { x: 0.82, y: 1.85 + i * 1.35, w: 0.18, h: 0.18, line: { color: t.accent }, fill: { color: t.accent } });
        text(slide, point, 1.22, 1.62 + i * 1.35, 10.9, 0.75, 23);
      });
    } else if (item.layout === 'cards') {
      item.points.forEach((point, i) => {
        const x = 0.75 + i * 4.18;
        slide.addShape(shape.roundRect, { x, y: 2.05, w: 3.75, h: 3.45, rectRadius: 0.12, line: { color: t.soft }, fill: { color: t.soft } });
        text(slide, `0${i + 1}`, x + 0.28, 2.35, 0.9, 0.55, 22, { color: t.accent, bold: true });
        text(slide, point, x + 0.28, 3.24, 3.15, 1.25, 23, { bold: true });
      });
    } else if (item.layout === 'process') {
      item.points.forEach((point, i) => {
        const x = 0.85 + i * 4.18;
        slide.addShape(shape.ellipse, { x, y: 2.1, w: 0.7, h: 0.7, line: { color: t.accent }, fill: { color: t.accent } });
        text(slide, String(i + 1), x, 2.1, 0.7, 0.7, 21, { color: 'FFFFFF', bold: true, align: 'center' });
        text(slide, point, x, 3.2, 3.5, 1.15, 22, { bold: true });
        if (i < 2) slide.addShape(shape.line, { x: x + 0.85, y: 2.45, w: 3.16, h: 0, line: { color: t.accent, width: 2 } });
      });
    } else {
      item.points.forEach((point, i) => {
        text(slide, `0${i + 1}`, 0.85, 1.83 + i * 1.35, 0.75, 0.62, 25, { color: t.accent, bold: true });
        text(slide, point, 1.75, 1.83 + i * 1.35, 10.2, 0.62, 24);
      });
    }
  });
  await pptx.writeFile({ fileName: filePath });
}

// V2 uses the same PPTX library and native objects, with bounded IR layouts.
export async function renderPresentationIR(ir, filePath, evidencePack) {
  const pptx = new pptxgen(), t = THEMES[ir.theme];
  pptx.layout = 'LAYOUT_WIDE'; pptx.title = ir.metadata.title; pptx.author = 'PowerPoint Agent';
  pptx.theme = { headFontFace: t.font, bodyFontFace: t.font, lang: 'en-US' };
  const text = (slide, value, x, y, w, h, size = t.bodySize, options = {}) => slide.addText(String(value ?? ''), { x, y, w, h, fontFace: t.font, fontSize: size, color: t.ink, margin: 0, valign: 'mid', breakLine: false, ...options });
  ir.slides.forEach((item, index) => {
    const slide = pptx.addSlide(), layout = item.visualIntent.layout;
    slide.background = { color: t.background };
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: .12, h: 7.5, fill: { color: t.accent }, line: { color: t.accent } });
    const hero = ['TITLE', 'SECTION', 'CLOSING'].includes(layout);
    text(slide, item.title, .75, hero ? 1.4 : .55, 11.8, hero ? 1.3 : .8, hero ? 40 : t.titleSize, { bold: true });
    if (item.subtitle) text(slide, item.subtitle, .75, hero ? 2.85 : 1.32, 11.8, .45, 16);
    const start = hero ? 3.65 : 1.95, available = hero ? 2.55 : 4.25;
    const columns = layout === 'TITLE_TWO_COLUMN', count = Math.max(1, item.blocks.length), rows = columns ? Math.ceil(count / 2) : count;
    item.blocks.forEach((b, bi) => {
      const x = columns ? .75 + (bi % 2) * 6 : .75, y = start + (columns ? Math.floor(bi / 2) : bi) * available / rows, w = columns ? 5.5 : 11.8, h = available / rows - .15;
      if (b.type === 'TABLE') slide.addTable([b.columns, ...b.rows], { x, y, w, h, fontFace: t.font, fontSize: 14, color: t.ink, border: { color: 'D0D9E5', pt: 1 }, fill: 'FFFFFF', margin: .08, rowH: Math.min(.45, h / (b.rows.length + 1)), autoPage: false, bold: false });
      else if (b.type === 'CHART') { const type = ['BAR', 'COLUMN'].includes(b.chartType) ? pptx.ChartType.bar : b.chartType === 'LINE' ? pptx.ChartType.line : b.chartType === 'PIE' ? pptx.ChartType.pie : pptx.ChartType.doughnut; slide.addChart(type, b.series.map(s => ({ name: s.name, labels: b.categories, values: s.values })), { x, y, w, h, catAxisLabelFontFace: t.font, catAxisLabelFontSize: 12, valAxisLabelFontSize: 12, showLegend: b.series.length > 1, showValue: true, chartColors: [t.accent, '155E75', '936B39', '465A73'], barDir: b.chartType === 'BAR' ? 'bar' : 'col', showTitle: false }); }
      else if (b.type === 'METRIC') { text(slide, b.value, x, y, w, h * .65, Math.min(48, h * 30), { color: t.accent, bold: true }); text(slide, b.label, x, y + h * .65, w, h * .35, 19); }
      else if (b.type === 'IMAGE_PLACEHOLDER') { slide.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color: t.soft }, line: { color: t.accent, dashType: 'dash' } }); text(slide, `Image placeholder: ${b.label || 'Approved asset needed'}`, x + .2, y + .2, w - .4, h - .4, 18, { align: 'center' }); }
      else if (b.type === 'SHAPE') slide.addShape(b.shape === 'LINE' ? pptx.ShapeType.line : b.shape === 'CIRCLE' ? pptx.ShapeType.ellipse : pptx.ShapeType.rect, { x, y, w, h: b.shape === 'LINE' ? 0 : h, fill: { color: t.soft }, line: { color: t.accent } });
      else if (b.type === 'BULLETS' && ['TITLE_PROCESS', 'TITLE_TIMELINE'].includes(layout)) { b.items.forEach((entry, i) => { const stepW = w / b.items.length, sx = x + i * stepW; slide.addShape(pptx.ShapeType.roundRect, { x: sx, y, w: stepW - .2, h, fill: { color: t.soft }, line: { color: t.soft } }); text(slide, typeof entry === 'string' ? entry : [entry.date, entry.label, entry.description].filter(Boolean).join('\n'), sx + .15, y + .2, stepW - .5, h - .4, 18); }); }
      else if (b.type === 'BULLETS') b.items.forEach((entry, i) => text(slide, typeof entry === 'string' ? entry : [entry.date, entry.label, entry.description].filter(Boolean).join(' — '), x + .15, y + i * h / b.items.length, w - .3, h / b.items.length - .06, 20, { bullet: { indent: 14 }, hanging: 3 }));
      else { if (b.type === 'CALLOUT' || b.type === 'QUOTE') slide.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color: t.soft }, line: { color: t.soft } }); text(slide, blockText(b), x + .12, y + .08, w - .24, h - .16, b.type === 'FOOTNOTE' ? 12 : 21, { italic: b.type === 'QUOTE' }); }
    });
    const sources = item.evidenceRefs.map(id => evidencePack.items.find(e => e.id === id)).filter(Boolean);
    text(slide, sources.map(e => e.provenance.filename).filter((v, i, a) => a.indexOf(v) === i).join(' · ').slice(0, 150), .75, 6.85, 10.7, .3, 9, { color: t.accent });
    if (index) text(slide, index + 1, 12, 6.85, .55, .3, 10, { align: 'right', color: t.accent });
    slide.addNotes([...(item.speakerNotes || []), 'Sources:', ...sources.map(e => `${e.id}: ${e.provenance.filename} — ${e.text}`)].join('\n'));
  });
  await pptx.writeFile({ fileName: filePath });
}
