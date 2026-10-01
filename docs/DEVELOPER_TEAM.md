# Developer Team V1

## Phase 7 Mission Control

Development missions wrap this existing team without adding another engine. Project configuration supplies the validated workspace, registered tests, repository association, knowledge scope, and model preferences. Dry run is the default. A write-capable run holds one workspace lock through exact approval, controlled apply, tests, and final review. Mission Control shows real specialist tasks, repair attempts, safe context metrics, artifacts, and final state. See [MISSION_CONTROL.md](MISSION_CONTROL.md).

## Phase 6.2 runtime selection

Runtime model calls resolve through validated process-local settings and the central Model Gateway. Development uses the `development` role and project research uses `research`; registered per-job overrides may select a different eligible model without changing authority. Provider and fallback events are observable. Local Ollama remains the default, OpenAI API is optional and separate from ChatGPT/Codex, and `auto` prefers healthy local service.

## Phase 6.1 task graph

New development API jobs use an explicit graph: `DEV_PLAN → CODE_RESEARCH → DEVELOP → PATCH_EVALUATE → CODE_REVIEW → PATCH_APPROVAL → PATCH_APPLY → TEST → FINAL_REVIEW`. Dry runs omit approval, apply, and test. Each stage is a separate task with its own registered agent and dependencies. Failed review, patch evaluation, or tests append `CRITIQUE_REPAIR → CODE_RESEARCH → DEVELOP` and a new downstream graph within the bounded attempt limit. An exact changed patch receives a fresh fingerprint and approval. The accepted Phase 6 direct-job flow remains available for older callers.

`DevelopmentPlannerAgent` returns a goal, criteria, investigation/implementation/test tasks, likely areas, knowledge queries, risks, and clarification flag. The orchestrator owns stage transitions and records compact handoffs: source/target agent, task ID, objective, artifact/context IDs, issues, trusted constraints, and expected output. Handoffs are data; Tool Registry and Permission Policy alone grant capabilities. Reviewer, TestAgent, Critic, and FinalReviewer are explicit tasks. Review is deterministic and cannot override patch safety. TestAgent runs only registered command IDs and passes a short failure excerpt downstream; the full bounded log is kept as a `TEST_RESULT` artifact. The final task checks criteria evidence, exact approval, current file hashes, test result, unresolved issues, rollback state, and required artifacts.

## Code discovery and context

`CodeIntelligenceService` scans only allowed text files and builds a lightweight workspace symbol index. It heuristically discovers definitions, references, imports/includes, routes/config hints, and related tests for JavaScript, TypeScript, C#, Java, Classic ASP/VBScript, SQL, HTML, CSS, JSON, XML, and Markdown. `code.symbolSearch`, `code.findReferences`, and `code.relatedTests` are bounded read-only tools. Results are candidates, not compiler-level answers. The index is invalidated after an approved write.

`CODE_RESEARCH` ranks explicit paths, path/symbol matches, import hints, and related tests. It optionally queries the existing project-scoped Knowledge Hub with a repository filter and bounded top K. Qdrant is discovery data. Current workspace content and SHA-256 hashes are read before a patch; the Developer refreshes any file that changed since research. Knowledge chunks are separate and marked `STALE_KNOWLEDGE` when they conflict with current file content. Qdrant unavailability leaves local discovery working. No new vector store or reindex is started.

The `DEVELOPMENT_CONTEXT` artifact contains request, criteria, current file ranges and hashes, symbols, knowledge chunks, tests, constraints, estimated tokens, context pressure, and truncation. Defaults: 4,000 developer tokens, 8 files, 3 ranges per file, Qdrant top K 3, and 20 symbols; configure with `DEVELOPMENT_CONTEXT_TOKENS`, `DEVELOPMENT_MAX_FILES`, `DEVELOPMENT_MAX_RANGES_PER_FILE`, `DEVELOPMENT_QDRANT_TOP_K`, and `DEVELOPMENT_MAX_SYMBOL_RESULTS`. Duplicate file/chunk references are removed. Handoffs carry artifact IDs, and each specialist loads only needed sections. After a write, repair research reads the affected files again.

Per-job metrics include estimated context tokens, bytes, file/chunk counts, context pressure, artifact reference reuse, model calls, and actual provider tokens when returned. Token estimates use the existing rough character heuristic, not billing figures. The optional compression hook accepts only logs, terminal output, search descriptions, and repetitive JSON; missing or failed compression passes the bounded original through. Security instructions, approvals, hashes, patches, commands, IDs, and error codes are excluded from lossy compression.

## Model boundary

Codex authenticated through the user's ChatGPT plan is the preferred cloud assistant for building this project. It is separate from Darkcry's runtime Model Gateway. Runtime jobs accept `providerMode: local|openai|auto`; the default is local. `local` uses Ollama (`llama3.1:8b` in this setup), and the existing Knowledge Hub uses local `embeddinggemma:300m`. `auto` prefers a healthy local provider and can select a separately configured OpenAI API provider if local health fails. `openai` means that separate API provider and does not use ChatGPT Plus authentication. No API key is required for Phase 6.1; an unconfigured OpenAI API mode returns a structured provider error. Provider selection cannot change tool permissions. `GET /api/models/runtime` reports active model/provider and configuration status.

Phase 6 adds controlled development jobs to the shared Orchestrator. DeveloperAgent builds a structured full-content patch proposal from bounded workspace reads. PatchSafetyEvaluator runs before the read-only CodeReviewerAgent. A non-dry-run job then pauses in `WAITING_FOR_APPROVAL`; approval records the exact SHA-256 patch fingerprint, workspace, affected paths, operations, and summary. Approval resumes the same job. Any changed patch is rejected.

## Workspace and paths

A workspace has an opaque ID, project ID, canonical root, allowed and denied paths, registered test commands, creation time, and status. Paths resolve under the canonical root. Absolute paths, drive switching, traversal, and detectable junction or symlink escapes are rejected. `.env` variants, credentials, secrets, private keys, Docker credentials, archives, images, Office documents, executables, databases, and model binaries are denied. Reads are size bounded and return at most 400 lines by default. Listings and searches are bounded and skip links, denied paths, binaries, and oversized files.

## Patch and rollback

Patch proposals contain a summary, concise rationale, files, tests, risks, and assumptions. Each file declares `MODIFY`, `CREATE`, or `DELETE`, full replacement content, purpose, and the expected original SHA-256 hash where applicable. Patch JSON is data and is never evaluated as code. Safety checks enforce workspace scope, file and byte limits, create/delete policy, denied formats, and suspicious high-risk additions.

Immediately before applying, every existing target is rehashed. A mismatch returns `STALE_PATCH` with no write. Darkcry snapshots only affected files under ignored application data. It validates all targets first, uses temporary-file replacement, and restores changed files if a multi-file operation fails. A terminal failed development run restores its snapshots in reverse order. Rollback can only reference snapshots created by this workspace registry.

## Tests and Git

Test commands are registered as executable and argument arrays. V1 allows structured `node`, `npm`, `npx`, `dotnet`, `python`, `python3`, `mvn`, or `gradle` commands. It rejects shell chaining, pipes, substitution, PowerShell, `cmd /c`, downloads, registry commands, and shutdown. Execution uses `shell: false`, canonical workspace cwd, bounded output, timeout, and process termination. Results become `TEST_RESULT` artifacts. Git support is read-only (`status`, `diff`, recent `log`); no Git write tool exists.

## Roles and permissions

| Role | Allowed capabilities |
| --- | --- |
| ResearchKnowledgeAgent | Project-scoped `knowledge.retrieve`; no writes |
| DeveloperAgent | Bounded list/read/search, optional knowledge and Git reads, exact approved patch apply, registered tests |
| CodeReviewerAgent | Bounded reads/search; no writes or shell |
| TestAgent | Limited reads and registered tests; no patch or arbitrary shell |
| DevelopmentCriticAgent | Structured issues, test results, and repair guidance only |

On review or test failure, the existing retry engine invokes DevelopmentCriticAgent. A changed repair patch receives fresh evaluation, review, and approval. Repeated issue fingerprints trigger `NO_PROGRESS`; terminal failure rolls back approved writes. Dry runs stop after proposal, evaluation, and review and never request approval or write files.

## API and limits

`POST /api/agent/development/jobs` validates and registers the workspace and creates a job. `POST /api/agent/development/jobs/:id/run` starts it. `GET /api/agent/development/jobs/:id` returns the audit record. Existing approval endpoints approve or deny the exact pending patch. No endpoint commits, pushes, or accepts arbitrary commands.

V1 uses bounded text context and full replacement content rather than language-specific AST edits. Review is deterministic and conservative. Workspace, job, approval, and snapshot metadata remain process local; snapshot content is stored under ignored application data. Model patches depend on the configured local model following the strict JSON contract.
