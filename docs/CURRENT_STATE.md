# Current State

- **Current phase:** Phase 5 grounded ResearchKnowledgeAgent.
- **What currently works:** Existing presentation, ingestion, Agent Core, tools, Model Gateway, and Knowledge Hub flows; a read-only research job with project-scoped retrieval, bounded context, structured claims, deterministic grounding checks, targeted critic retry, and final review. See [RESEARCH_AGENT.md](RESEARCH_AGENT.md).
- **Current task:** Phase 5 verification and review.
- **Next task:** User review before Phase 6.
- **Known issues:** Grounding is a conservative lexical check, not semantic proof. Ollama/Qdrant require configured local services; research/model histories reset on restart. Presentation generation does not use research yet; scanned PDFs need OCR. Repository analysis remains capped at 500 files and 20 MB of text.
