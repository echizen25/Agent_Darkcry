# Current State

- **Current phase:** Phase 5.1 local AI validation.
- **What currently works:** Existing presentation, ingestion, Agent Core, tools, Model Gateway, and Knowledge Hub flows; a read-only research job with project-scoped retrieval, bounded context, structured claims, deterministic grounding checks, targeted critic retry, and final review. See [RESEARCH_AGENT.md](RESEARCH_AGENT.md).
- **Current task:** Phase 5.1 review after live Ollama and real embedding validation.
- **Next task:** User review; persistent Qdrant validation needs a running local Qdrant service.
- **Known issues:** Qdrant is unavailable locally, so live validation used real embeddings with an in-memory vector store. Grounding is a conservative lexical check and can reject unsupported claims after a bounded retry. Research/model histories reset on restart. Presentation generation does not use research yet; scanned PDFs need OCR. Repository analysis remains capped at 500 files and 20 MB of text.
