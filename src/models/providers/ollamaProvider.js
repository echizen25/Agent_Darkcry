export class OllamaProvider {
  constructor({ baseUrl, timeoutMs = 10000, fetchImpl = fetch }) { this.id = 'ollama'; this.capabilities = ['chat', 'embedding']; this.baseUrl = baseUrl; this.timeoutMs = timeoutMs; this.fetch = fetchImpl; }
  async call(route, options = {}) {
    const response = await this.fetch(`${this.baseUrl}${route}`, { ...options, signal: options.signal || AbortSignal.timeout(this.timeoutMs) });
    if (!response.ok) throw Object.assign(new Error('Ollama request failed.'), { code: response.status === 404 ? 'MODEL_NOT_FOUND' : 'PROVIDER_UNAVAILABLE' });
    return response.json();
  }
  async health() { try { await this.call('/api/tags'); return true; } catch { return false; } }
  async listModels() { const result = await this.call('/api/tags'); return (result.models || []).map(item => item.name); }
  async generate({ model, messages, prompt, systemInstruction, temperature, maxOutputTokens, signal }) {
    const turns = [...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []), ...(messages || (prompt ? [{ role: 'user', content: prompt }] : []))];
    const result = await this.call('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages: turns, stream: false, options: { temperature, ...(maxOutputTokens ? { num_predict: maxOutputTokens } : {}) } }), signal });
    return { content: result.message?.content, usage: { inputTokens: result.prompt_eval_count ?? null, outputTokens: result.eval_count ?? null, totalTokens: result.prompt_eval_count != null && result.eval_count != null ? result.prompt_eval_count + result.eval_count : null }, metadata: {} };
  }
  async embed({ model, texts, signal }) {
    const result = await this.call('/api/embed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, input: texts }), signal });
    return result.embeddings;
  }
}
