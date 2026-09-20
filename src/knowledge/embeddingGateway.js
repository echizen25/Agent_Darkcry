export class EmbeddingGateway {
  constructor({ provider, model }) { this.provider = provider; this.model = model; this.dimension = null; }
  async embed(texts) {
    if (!this.model) throw Object.assign(new Error('Embedding model is not configured.'), { code: 'MODEL_NOT_FOUND', status: 503 });
    if (!Array.isArray(texts) || !texts.length) return [];
    let vectors;
    try { vectors = await this.provider.embed({ model: this.model, texts }); }
    catch (cause) { throw Object.assign(new Error('Embedding provider unavailable.'), { code: cause.code || 'EMBEDDING_FAILED', status: 503 }); }
    if (!Array.isArray(vectors) || vectors.length !== texts.length || vectors.some(vector => !Array.isArray(vector) || !vector.length || vector.some(value => typeof value !== 'number' || !Number.isFinite(value)))) throw Object.assign(new Error('Invalid embedding response.'), { code: 'EMBEDDING_FAILED', status: 502 });
    const dimension = vectors[0].length;
    if (vectors.some(vector => vector.length !== dimension) || this.dimension && this.dimension !== dimension) throw Object.assign(new Error('Embedding dimensions do not match.'), { code: 'VECTOR_DIMENSION_MISMATCH', status: 409 });
    this.dimension = dimension; return vectors;
  }
}
