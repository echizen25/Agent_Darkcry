# Current State

- **Current phase:** Phase 6.2 AI Runtime Control Center and model routing implementation and review.
- **What currently works:** Existing presentation, ingestion, Agent Core, Model Gateway, persistent Knowledge Hub, grounded research, and a controlled development workflow with scoped workspaces, patch proposals, deterministic safety review, exact human approval, stale protection, snapshots, rollback, allowlisted tests, critic repair, and final review. See [DEVELOPER_TEAM.md](DEVELOPER_TEAM.md).
- **Current task:** Validate the Control Center, role routing, installed-model discovery, health, observability, and controlled Model Lab.
- **Next task:** User review of Phase 6.2 before any later-phase work.
- **Known issues:** Code intelligence and review use conservative text heuristics rather than compiler or AST analysis. Each file currently contributes one bounded range; large files can exceed the development context budget and stop proposal generation. Runtime orchestration and symbol-index records are process local. Local model JSON proposals can need a bounded repair attempt. Grounding and abstention relevance remain lexical. Presentation generation does not use research yet; scanned PDFs need OCR.
