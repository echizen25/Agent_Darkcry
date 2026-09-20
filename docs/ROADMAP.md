# Incremental migration roadmap

Each phase preserves the current presentation and source endpoints and has a testable exit gate. Phase 1 design is approved; Phase 2 Agent Core V1 implements the deterministic, in-memory subset.

| Phase | Deliverable | Exit gate |
| --- | --- | --- |
| 0 — Preserve | Capture current API and PPTX/source regression checks | Existing generation, document/notes, and repository flows pass |
| 1 — Contracts | Architecture, task/agent contracts, state and approval rules | Design reviewed; no runtime change |
| 2 — Core engine | Project/job/task metadata and bounded scheduler, initially local | State transitions and dependency tests pass |
| 3 — Evaluation | Deterministic validators, evidence, Critic/revision loop, final review | Failed task repairs or stops within limits |
| 4 — Tool policy | Permission-aware registry and approval records | Unauthorized calls are rejected and audited |
| 5 — Knowledge | Common source catalog, provenance, chunking, later retrieval | Relevant chunks selected within context budgets; originals retained |
| 6 — Development team | Git checkpoint, scoped edit/test/review workflow | Diff and test evidence accompany each change |
| 7 — PowerPoint team | Adapt existing planner/renderer to specialist tasks | Current PPTX path still passes; new slide checks pass |
| 8 — Reports | Document/report specialists and artifact validation | Report output and review pass |
| 9 — Media | Script/storyboard/assets, FFmpeg-first production | Timed output and review pass |
| 10 — Crypto analysis | Read-only market analysis and paper workflow | Evidence, assumptions, and risk checks pass; no live orders |
| 11 — Computer use | Optional approved desktop adapters | Allowlist, logging, timeout, stop, and approval gates pass |
| 12 — Dashboard | Unified project/job/task/source/artifact view | UI matches recorded state and approvals |

SQLite and the Model Gateway belong in the earliest phase that actually needs durable orchestration or model calls. Ollama can be the first model provider; Qdrant is optional until chunk retrieval is useful. Defer live trading to a separately reviewed scope. Avoid migrating working source storage or PowerPoint rendering solely to fit proposed folders.

Decisions for review before implementation: persistence location and backup policy; whether local repository paths may extend outside the workspace; default model and per-task budgets; which controlled actions require standing authorization; and whether optional external providers or desktop adapters are permitted for a project.
