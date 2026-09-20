import pptxgen from 'pptxgenjs';

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
