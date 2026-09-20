const clean = (value, max = 100) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

export function planPresentation(input = {}) {
  const topic = clean(input.topic);
  if (!topic) throw new Error('Topic is required.');
  const count = Number(input.slideCount);
  if (!Number.isInteger(count) || count < 5 || count > 20) throw new Error('Slide count must be between 5 and 20.');
  const audience = clean(input.audience, 80) || 'General audience';
  const title = clean(input.title, 90) || topic;
  const style = ['modern', 'classic', 'bold'].includes(input.style) ? input.style : 'modern';
  const middle = [
    { layout: 'content', title: 'Why it matters', points: [`What ${topic} means for ${audience}`, 'The main opportunity or challenge', 'What a useful outcome looks like'] },
    { layout: 'cards', title: 'Key considerations', points: ['People and needs', 'Resources and constraints', 'Measures of progress'] },
    { layout: 'process', title: 'A practical approach', points: ['Define the objective', 'Choose the first actions', 'Review results'] },
    { layout: 'content', title: 'Decisions to make', points: ['Agree on scope and ownership', 'Set a realistic timeline', 'Identify the next checkpoint'] }
  ];
  const slides = [{ layout: 'title', title, subtitle: `A focused introduction to ${topic}` }];
  for (let i = 0; i < count - 2; i++) {
    const base = middle[i % middle.length];
    const round = Math.floor(i / middle.length);
    slides.push({ ...base, title: round ? `${base.title} ${round + 1}` : base.title });
  }
  slides.push({ layout: 'closing', title: 'Next steps', points: ['Confirm the priority', 'Assign an owner', 'Schedule a review'] });
  return { title, topic, audience, style, slides };
}
