# AI Production Studio: proposed architecture

This is the design for a local-first platform. Agent Core V1 implements deterministic demo agents and in-memory orchestration; the current PowerPoint Agent remains operational as the first production capability. See [ARCHITECTURE.md](ARCHITECTURE.md) for its present boundaries, [AGENT_CONTRACTS.md](AGENT_CONTRACTS.md) for records and interfaces, [JOB_STATE_MACHINE.md](JOB_STATE_MACHINE.md) for execution rules, and [ROADMAP.md](ROADMAP.md) for migration.

## Coordination

One Orchestrator accepts a goal, identifies deliverables, asks a Planner for a dependency graph of bounded tasks, and dispatches each ready task to a registered specialist. It owns job state, budgets, retries, approvals, artifact references, and completion decisions. Specialists do production or review work; the Orchestrator does not replace them. The Evaluator tests acceptance criteria, the Critic diagnoses failures, and the Final Reviewer checks the whole deliverable before completion. Every task result and state transition is recorded. Task dependencies, not a fixed agent sequence, determine what can run.

The initial registry can describe agent families without instantiating them: Core (Orchestrator, Planner, Evaluator, Critic, Final Reviewer); Knowledge (Source Analyst, Research Agent, Git/Code Analyst, Data Analyst); Development (Developer, Debugger, Test, Browser/UI Test, Code Reviewer); PowerPoint (Presentation Researcher, Storyline, Designer, Chart/Diagram, Inspector, Fact Checker); Report (Researcher, Writer, Technical Writer, Reviewer); Media (Script Writer, Storyboard, Image, Video Director, Generator, Editor, Reviewer); and Crypto Research (Market Data, Technical Analysis, Multi-Timeframe, Strategy, Risk, Backtesting, Trade Critic, Trade Journal/Review). Adding a specialist should register its contract and tools, without changing Orchestrator control flow.

## Knowledge Hub and context

The existing `src/sources.js` stores uploaded documents and notes as extracted JSON. `src/repositories.js` stores repository summaries and individual file records. A future Knowledge Hub should expose both through a common source reference while keeping originals and provenance intact. A future pipeline is extract → normalize → chunk → embed → Qdrant index → retrieve. Qdrant would be a retrieval index, not the job database or source of truth. Generated artifacts and future research sources can enter the same catalog after explicit provenance and permissions are defined.

Each retrieved passage should carry applicable fields: sourceId, sourceType, filename, repository identity, relative path, commit, page, slide, sheet, chunkId, and createdAt. Missing fields remain absent. Source text stays separate from generated claims and artifacts. A task receives its instructions, relevant project state, ranked source chunks within a retrieval limit, artifact references, and short dependency-result summaries. Never send a whole repository, all documents, full chat history, or every agent output by default. Enforce a per-task context budget; compact old results into evidence-linked summaries and keep project memory scoped by project.

## Model Gateway and Tool Registry

The Model Gateway centralizes provider settings, model selection, request limits, and usage records. Ollama is the first optional provider; OpenAI and compatible providers remain future options. Research agents use the gateway interface rather than provider-specific calls.

A permission-aware Tool Registry declares tool ID, capability, risk class, allowed agent types, required permissions, and approval requirement. Prefer API, then CLI, then programmatic integration, then GUI/computer use when practical. Potential adapters include filesystem, Git, source ingestion, retrieval, models, browser, PowerPoint, office documents, image, FFmpeg, and approved desktop apps. Tool calls and approvals pass through a policy check before execution. Computer use is an optional future adapter with an application allowlist, workspace limits, action log, screenshots/checkpoints, timeout, emergency stop, and approval gates. It must not bypass security controls, silently publish, or silently delete.

## Artifact registry, project memory, and storage

An Artifact Registry tracks PPTX, DOCX, PDF, XLSX, images, video, patches, reports, screenshots, and test evidence by artifactId, projectId, jobId, taskId, type, version, path, creatorAgent, createdAt, validationStatus, and sourceLineage. Keep binaries on disk and metadata in a future database. A project-scoped memory records approved terminology, audience, branding, facts, decisions, source references, and artifact versions. Do not create global free-form memory.

SQLite is a plausible initial metadata store for projects, jobs, tasks, task_dependencies, task_runs, agents, agent_runs, evaluations, issues, sources, source_chunks, artifacts, approvals, and tool_runs. This database does not exist yet. Store foreign keys and immutable run/evidence references so retries and revisions remain auditable. Existing file-based source records can be adapted incrementally rather than migrated in one step.

Structured logs should include project, job, task, agent, iteration, model/tool identifiers, duration, changed-file paths, validation outcome, issues, artifact IDs, errors, and approval events. Do not log credentials, raw secrets, or full prompts by default. A later dashboard can show project, job, dependency graph, active agent/step, iteration count, source references, issues, approvals, artifacts, and logs from the same records. It should display waiting and blocked work distinctly.

## Specialist workflows

**Development:** inspect the repository and relevant docs → identify affected files → plan → create a Git checkpoint → change only relevant files → inspect diff → test → start/inspect the app and logs if needed → Browser/UI Test → evaluate → diagnose/revise within limits → review and report. Keep failure and test evidence. Never silently change unrelated files or commit credentials. Destructive Git operations and deletion of user files require approval; checkpoints and rollback must be explicit and verifiable.

**PowerPoint:** Presentation Researcher → Storyline → Designer → existing planner/rendering adapter → Inspector → Fact Checker → Critic/revision. Future deterministic checks should cover file existence/openability, slide count, placeholders, required-slide emptiness, overflow, overlap, bounds, image aspect ratio, and readable fonts. Semantic checks should cover topic coverage, source-grounded claims, visual consistency, and content density. Current `src/planner.js` and `src/renderer.js` do not implement this team or validation pipeline.

**Reports and media:** Report research/writing/review and research → script → storyboard → asset plan/generation → assembly → editing → quality review/revision use the same task, artifact, and evaluation contracts. Deterministic video assembly should prefer FFmpeg; an approved GUI adapter such as CapCut is optional where programmatic methods are insufficient.

**Crypto research:** A separate decision-support team may analyze OHLCV, volume, trends, levels, indicators, multiple timeframes, backtests, paper trades, alerts, and read-only history. Its output should distinguish observed regime and evidence from possible setup, entry zone, invalidation, targets, risk/reward, and assumptions. Any future live order execution must be a separate permission-controlled tool requiring explicit human approval. Exchange credentials must never enter Git, prompts, Qdrant, project memory, logs, or source documents.

## Intended module boundaries

Keep the current `src/server.js`, `src/planner.js`, `src/renderer.js`, `src/sources.js`, `src/repositories.js`, and vanilla `public/` UI working. As capabilities are implemented, introduce `src/core/` (job engine/state), `src/agents/` (registry/adapters), `src/tools/` (policy and adapters), `src/knowledge/` (catalog/retrieval), `src/models/` (gateway), `src/evaluation/`, `src/artifacts/`, and `src/storage/`. These are proposed boundaries, not folders to create now. API routes should remain adapters over domain modules. Preserve current endpoints while migrating their internals only when a phase requires it.
