# Model Routing

The existing Model Gateway accepts a normalized role and optional registered per-job override. `ModelSelectionService` resolves `GENERAL`, `PLANNER`, `RESEARCH`, `DEVELOPMENT`, `REVIEW`, and `CRITIC` assignments; embedding selection is separate.

- `local`: use an eligible registered Ollama model only.
- `openai`: use a separately configured OpenAI API provider only; otherwise return `PROVIDER_NOT_CONFIGURED`.
- `auto`: use healthy configured local Ollama, then a separately configured OpenAI provider, otherwise return a structured unavailable result.

Fallback order is role assignment, general assignment, provider default. Missing requested models are never represented as if they ran. Selection events record requested provider/model, actual provider/model, and fallback reason without prompt or secret data.

Installed Ollama names are discovered through the adapter. Names containing an embedding marker, plus the configured embedding model, are conservatively classified as embedding models. Other installed models are chat candidates. Registry eligibility is checked before saving settings or running Model Lab.
