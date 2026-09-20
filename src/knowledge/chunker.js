import { createHash } from 'node:crypto';

export const estimateTokens = text => Math.ceil(String(text || '').length / 4);
export const normalizeText = (text, code = false) => {
  const normalized = String(text || '').replace(/\r\n?/g, '\n').split('\n').map(line => code ? line.replace(/\s+$/, '') : line.trim()).join('\n').replace(/\n{3,}/g, '\n\n');
  return code ? normalized.replace(/^\n+|\n+$/g, '') : normalized.trim();
};

export function chunkDocument(document, { chunkSize = 1200, overlap = 120 } = {}) {
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || !Number.isInteger(overlap) || overlap < 0 || overlap >= chunkSize) throw new Error('Invalid chunk settings.');
  const code = document.sourceType === 'REPOSITORY_FILE';
  const text = normalizeText(document.text, code);
  const units = code ? text.split('\n') : text.split(/\n\n+/);
  const chunks = []; let current = '', startLine = 1, line = 1;
  const push = () => {
    if (!current.trim()) return;
    const chunkIndex = chunks.length;
    const provenance = { ...document.provenance, ...(code ? { lineStart: startLine, lineEnd: Math.max(startLine, line - 1) } : {}) };
    const hash = createHash('sha256').update(`${document.projectId}\n${document.documentId}\n${chunkIndex}\n${current}`).digest('hex');
    const chunkId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
    chunks.push({ chunkId, projectId: document.projectId, documentId: document.documentId, sourceId: document.sourceId, sourceType: document.sourceType, text: current, chunkIndex, characterCount: current.length, estimatedTokenCount: estimateTokens(current), provenance, metadata: document.metadata || {} });
  };
  const separator = code ? '\n' : '\n\n';
  for (const unit of units) {
    const pieces = unit.length > chunkSize ? unit.match(new RegExp(`[\\s\\S]{1,${chunkSize}}`, 'g')) || [] : [unit];
    for (const piece of pieces) {
      if (current && current.length + separator.length + piece.length > chunkSize) {
        push();
        const tail = code ? '' : current.slice(-overlap);
        current = tail && tail.length + piece.length + separator.length <= chunkSize ? tail + separator + piece : piece;
        startLine = line;
      } else current = current ? `${current}${separator}${piece}` : piece;
    }
    line += code ? 1 : unit.split('\n').length + 1;
  }
  push(); return chunks;
}
