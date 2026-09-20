import { chunkDocument } from './chunker.js';
import { buildContext } from './contextBuilder.js';
import { documentsFromSource, documentsFromRepository } from './sourceAdapters.js';

const bad = (status, code, message) => Object.assign(new Error(message), { status, code });
export const validProjectId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
export class KnowledgeHub {
  constructor({ root, embedding, store, collection, chunkSize = 1200, chunkOverlap = 120, topK = 5, contextTokens = 3000 }) {
    this.root = root; this.embedding = embedding; this.store = store; this.collection = collection; this.chunkSize = chunkSize; this.chunkOverlap = chunkOverlap; this.topK = topK; this.contextTokens = contextTokens; this.events = []; this.index = new Map();
  }
  event(type, details = {}) { this.events.push({ type, at: new Date().toISOString(), ...details }); }
  async indexDocuments(projectId, documents) {
    if (!validProjectId(projectId)) throw bad(400, 'INVALID_PROJECT', 'Invalid project ID.');
    const chunks = [];
    for (const doc of documents) {
      if (doc.projectId !== projectId || !doc.documentId || !doc.sourceId || !['DOCUMENT', 'NOTES', 'REPOSITORY_FILE', 'ARTIFACT', 'SYSTEM'].includes(doc.sourceType) || typeof doc.text !== 'string') throw bad(400, 'INVALID_DOCUMENT', 'Invalid knowledge document.');
      this.event('KNOWLEDGE_DOCUMENT_NORMALIZED', { projectId, documentId: doc.documentId });
      chunks.push(...chunkDocument(doc, { chunkSize: this.chunkSize, overlap: this.chunkOverlap }));
    }
    this.event('KNOWLEDGE_CHUNKS_CREATED', { projectId, count: chunks.length });
    if (!chunks.length) return { documentCount: 0, chunkCount: 0 };
    const unique = [...new Map(chunks.map(item => [item.chunkId, item])).values()];
    this.event('EMBEDDING_STARTED', { projectId, count: unique.length });
    const vectors = await this.embedding.embed(unique.map(item => item.text));
    this.event('EMBEDDING_COMPLETED', { projectId, count: vectors.length });
    await this.store.ensureCollection(this.collection, vectors[0].length);
    for (const sourceId of new Set(documents.map(item => item.sourceId))) await this.store.deleteBySource(this.collection, projectId, sourceId);
    await this.store.upsertChunks(this.collection, unique.map((chunk, index) => ({ id: chunk.chunkId, vector: vectors[index], payload: chunk })));
    this.event('VECTOR_UPSERT_COMPLETED', { projectId, count: unique.length });
    for (const doc of documents) this.index.set(`${projectId}:${doc.documentId}`, { projectId, sourceId: doc.sourceId });
    return { documentCount: documents.length, chunkCount: unique.length };
  }
  async indexSource(projectId, sourceId) { return this.indexDocuments(projectId, await documentsFromSource(this.root, projectId, sourceId)); }
  async indexRepository(projectId, repositoryId) { return this.indexDocuments(projectId, await documentsFromRepository(this.root, projectId, repositoryId)); }
  async query({ projectId, query, topK = this.topK, maxContextTokens = this.contextTokens, maxChunks = topK, minScore = -1, filters = {} }) {
    if (!validProjectId(projectId) || typeof query !== 'string' || !query.trim() || query.length > 2000 || !Number.isInteger(topK) || topK < 1 || topK > 50) throw bad(400, 'INVALID_QUERY', 'Invalid knowledge query.');
    if (!Number.isInteger(maxContextTokens) || maxContextTokens < 1 || maxContextTokens > 20000 || !Number.isInteger(maxChunks) || maxChunks < 1 || maxChunks > 50 || typeof filters !== 'object' || Array.isArray(filters) || Object.keys(filters).some(key => !['sourceId', 'sourceType', 'repositoryId', 'relativePath'].includes(key))) throw bad(400, 'INVALID_QUERY', 'Invalid retrieval settings.');
    this.event('KNOWLEDGE_QUERY_STARTED', { projectId });
    const [vector] = await this.embedding.embed([query]);
    const results = await this.store.search(this.collection, { projectId, vector, topK, filters });
    if (results.some(item => item.projectId !== projectId)) throw bad(500, 'PROJECT_ISOLATION_FAILED', 'Vector store returned cross-project knowledge.');
    this.event('KNOWLEDGE_QUERY_COMPLETED', { projectId, count: results.length });
    const context = buildContext({ query, results, maxTokens: maxContextTokens, maxChunks, minScore });
    this.event('CONTEXT_BUILT', { projectId, count: context.items.length, tokens: context.budget.estimatedUsedTokens });
    return { results, context };
  }
  async deleteSource(projectId, sourceId) { if (!validProjectId(projectId)) throw bad(400, 'INVALID_PROJECT', 'Invalid project ID.'); await this.store.deleteBySource(this.collection, projectId, sourceId); for (const [key, item] of this.index) if (item.projectId === projectId && item.sourceId === sourceId) this.index.delete(key); this.event('KNOWLEDGE_SOURCE_DELETED', { projectId, sourceId }); }
  async deleteProject(projectId) { if (!validProjectId(projectId)) throw bad(400, 'INVALID_PROJECT', 'Invalid project ID.'); await this.store.deleteByProject(this.collection, projectId); for (const [key, item] of this.index) if (item.projectId === projectId) this.index.delete(key); }
  async status() { const counts = await this.store.counts(this.collection).catch(() => ({ chunks: null, documents: null })); return { vectorStore: this.store.type, embeddingProvider: this.embedding.provider.id, embeddingModelConfigured: Boolean(this.embedding.model), indexedDocumentCount: this.index.size || counts.documents, indexedChunkCount: counts.chunks, vectorStoreAvailable: await this.store.healthCheck() }; }
}
