# Current State

- **Current phase:** Agent Core V1.
- **What currently works:** Presentation generation, document/notes and Git ingestion, plus the deterministic Agent Core demo API.
- **Current task:** Deterministic in-memory Orchestrator, state checks, Agent Registry, validator, artifact registry, and demo Planner/Worker/Critic/Final Reviewer. API: `POST/GET /api/agent/jobs`, `GET /api/agent/jobs/:id`, `POST /api/agent/jobs/:id/run`. Demo retries once after critic guidance, then validates and completes.
- **Tests:** 24 Agent Core tests pass; existing document, repository, frontend, and PPTX smoke tests pass.
- **Next task:** Review V1 before implementing later phases.
- **Known issues:** Agent jobs disappear on restart. Generation does not use sources; scanned PDFs need OCR. Repository analysis is capped at 500 files and 20 MB of text.
