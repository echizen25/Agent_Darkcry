# Developer Team V1

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
