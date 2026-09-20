# Current State

- **Current phase:** Phase 4 Knowledge Hub and Model Gateway foundation.
- **What currently works:** Existing presentation, source ingestion, and deterministic Agent Core flows; project-scoped knowledge adapters, chunking, embedding interface, in-memory and Qdrant vector stores, retrieval, bounded context, Ollama Model Gateway, and diagnostic APIs. See [KNOWLEDGE_HUB.md](KNOWLEDGE_HUB.md).
- **Current task:** Phase 4 verification and review.
- **Next task:** User review before any specialist-agent phase.
- **Known issues:** Ollama/Qdrant operations require separately running local services and configured models. Knowledge counters, events, and model-call history reset on restart; Qdrant vectors persist. Agent jobs remain in memory. Generation does not yet use sources; scanned PDFs need OCR. Repository analysis remains capped at 500 files and 20 MB of text.
