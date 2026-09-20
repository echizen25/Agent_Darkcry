const failure = (code, message, status = 503) => Object.assign(new Error(message), { code, status });
export class QdrantVectorStore {
  constructor({ baseUrl, fetchImpl = fetch, timeoutMs = 10000 }) { this.type = 'qdrant'; this.baseUrl = baseUrl; this.fetch = fetchImpl; this.timeoutMs = timeoutMs; }
  async call(route, method = 'GET', body) {
    let response;
    try { response = await this.fetch(`${this.baseUrl}${route}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(this.timeoutMs) }); }
    catch { throw failure('VECTOR_STORE_UNAVAILABLE', 'Vector store unavailable.'); }
    if (!response.ok) throw failure('VECTOR_STORE_UNAVAILABLE', `Vector store returned HTTP ${response.status}.`);
    return response.json();
  }
  async healthCheck() { try { await this.call('/collections'); return true; } catch { return false; } }
  async ensureCollection(name, dimension) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(name)) throw failure('INVALID_COLLECTION', 'Invalid collection name.', 400);
    const list = await this.call('/collections');
    if (!list.result?.collections?.some(item => item.name === name)) await this.call(`/collections/${name}`, 'PUT', { vectors: { size: dimension, distance: 'Cosine' } });
    else {
      const existing = await this.call(`/collections/${name}`);
      if (existing.result?.config?.params?.vectors?.size !== dimension) throw failure('VECTOR_DIMENSION_MISMATCH', 'Vector dimensions do not match.', 409);
    }
  }
  async upsertChunks(name, points) { await this.call(`/collections/${name}/points?wait=true`, 'PUT', { points: points.map(item => ({ id: item.id, vector: item.vector, payload: item.payload })) }); }
  filter(projectId, filters = {}) {
    const must = [{ key: 'projectId', match: { value: projectId } }];
    for (const [key, value] of Object.entries(filters)) if (value != null) must.push({ key: ['repositoryId', 'relativePath'].includes(key) ? `provenance.${key}` : key, match: { value } });
    return { must };
  }
  async search(name, { projectId, vector, topK = 5, filters = {} }) {
    const response = await this.call(`/collections/${name}/points/query`, 'POST', { query: vector, limit: topK, with_payload: true, filter: this.filter(projectId, filters) });
    return (response.result?.points || []).filter(item => item.payload?.projectId === projectId).map(item => ({ ...item.payload, chunkId: item.id, score: item.score }));
  }
  async deleteBySource(name, projectId, sourceId) { await this.call(`/collections/${name}/points/delete?wait=true`, 'POST', { filter: this.filter(projectId, { sourceId }) }); }
  async deleteByProject(name, projectId) { await this.call(`/collections/${name}/points/delete?wait=true`, 'POST', { filter: this.filter(projectId) }); }
  async counts(name) { try { const result = await this.call(`/collections/${name}`); return { chunks: result.result?.points_count ?? 0, documents: null }; } catch { return { chunks: null, documents: null }; } }
}
