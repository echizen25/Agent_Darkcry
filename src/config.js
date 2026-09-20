const integer = (name, fallback, min, max) => {
  const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}.`);
  return value;
};
const endpoint = (name, fallback) => {
  const value = process.env[name] || fallback;
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error(`Invalid ${name}.`);
  return url.href.replace(/\/$/, '');
};
export function loadConfig() {
  const chunkSize = integer('KNOWLEDGE_CHUNK_SIZE', 1200, 100, 10000);
  const chunkOverlap = integer('KNOWLEDGE_CHUNK_OVERLAP', 120, 0, chunkSize - 1);
  const collectionPrefix = process.env.QDRANT_COLLECTION_PREFIX || 'powerpoint_agent';
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,40}$/.test(collectionPrefix)) throw new Error('Invalid QDRANT_COLLECTION_PREFIX.');
  return {
    ollamaUrl: endpoint('OLLAMA_BASE_URL', 'http://127.0.0.1:11434'),
    qdrantUrl: endpoint('QDRANT_URL', 'http://127.0.0.1:6333'),
    chatModel: process.env.OLLAMA_CHAT_MODEL || null,
    embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || null,
    collection: `${collectionPrefix}_knowledge`, chunkSize, chunkOverlap,
    topK: integer('KNOWLEDGE_TOP_K', 5, 1, 50),
    contextTokens: integer('KNOWLEDGE_CONTEXT_TOKENS', 3000, 1, 20000),
    timeoutMs: integer('SERVICE_TIMEOUT_MS', 10000, 100, 120000)
  };
}
