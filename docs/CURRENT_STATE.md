# Current State

- **Current phase:** Phase 5.2 persistent Qdrant validation.
- **What currently works:** Existing presentation, ingestion, Agent Core, tools, Model Gateway, and Knowledge Hub flows; a read-only research job with project-scoped retrieval, bounded context, structured claims, deterministic grounding checks, targeted critic retry, and final review. See [RESEARCH_AGENT.md](RESEARCH_AGENT.md).
- **Current task:** User review of Phase 5.2 real Qdrant persistence and grounded research validation.
- **Next task:** Review Phase 5.2 before any Phase 6 work.
- **Known issues:** Grounding and abstention relevance use conservative lexical checks, not semantic proof. Research/model histories reset on restart. Presentation generation does not use research yet; scanned PDFs need OCR. Repository analysis remains capped at 500 files and 20 MB of text.
