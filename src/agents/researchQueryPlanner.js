export function planResearchQuery(question, repairGuidance = null) {
  const initial = String(question || '').trim().replace(/\s+/g, ' ');
  if (!initial) throw new Error('Research question is required.');
  const target = typeof repairGuidance?.targetedQuery === 'string' ? repairGuidance.targetedQuery.trim().replace(/\s+/g, ' ') : '';
  return (target || initial).slice(0, 2000);
}
