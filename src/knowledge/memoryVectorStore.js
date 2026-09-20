const cosine = (a, b) => {
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
};
const matches = (payload, filters = {}) => Object.entries(filters).every(([key, value]) => value == null || (key === 'repositoryId' || key === 'relativePath' ? payload.provenance?.[key] === value : payload[key] === value));
export class MemoryVectorStore {
  constructor() { this.type = 'memory'; this.collections = new Map(); }
  async healthCheck() { return true; }
  async ensureCollection(name, dimension) { const existing = this.collections.get(name); if (existing && existing.dimension !== dimension) throw Object.assign(new Error('Vector dimensions do not match.'), { code: 'VECTOR_DIMENSION_MISMATCH', status: 409 }); if (!existing) this.collections.set(name, { dimension, points: new Map() }); }
  async upsertChunks(name, points) { const collection = this.collections.get(name); if (!collection) throw new Error('Collection is missing.'); for (const point of points) { if (point.vector.length !== collection.dimension) throw Object.assign(new Error('Vector dimensions do not match.'), { code: 'VECTOR_DIMENSION_MISMATCH', status: 409 }); collection.points.set(point.id, point); } }
  async search(name, { projectId, vector, topK = 5, filters = {} }) {
    const collection = this.collections.get(name); if (!collection) return [];
    if (vector.length !== collection.dimension) throw Object.assign(new Error('Vector dimensions do not match.'), { code: 'VECTOR_DIMENSION_MISMATCH', status: 409 });
    return [...collection.points.values()].filter(point => point.payload.projectId === projectId && matches(point.payload, filters)).map(point => ({ ...point.payload, chunkId: point.id, score: cosine(point.vector, vector) })).sort((a, b) => b.score - a.score).slice(0, topK);
  }
  async deleteBySource(name, projectId, sourceId) { const points = this.collections.get(name)?.points; if (points) for (const [id, point] of points) if (point.payload.projectId === projectId && point.payload.sourceId === sourceId) points.delete(id); }
  async deleteByProject(name, projectId) { const points = this.collections.get(name)?.points; if (points) for (const [id, point] of points) if (point.payload.projectId === projectId) points.delete(id); }
  async counts(name) { const points = [...(this.collections.get(name)?.points.values() || [])]; return { chunks: points.length, documents: new Set(points.map(item => `${item.payload.projectId}:${item.payload.documentId}`)).size }; }
}
