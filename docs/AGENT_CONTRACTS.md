# Proposed contracts

These are design contracts. Agent Core V1 implements a subset with in-memory records; no database or general runtime schema system exists. Identifiers are opaque strings. Timestamps are ISO 8601 UTC. Persist references to large content instead of embedding it in task or agent records.

## Task

Presentation tasks retain the existing contract, with explicit project scope, dependencies, empty tool allowlists, bounded model input, stage acceptance checks and registered specialist IDs. Specification/Narrative Plan/Storyboard/IR and QA records are structured artifacts; renderer output is an approved native PPTX file, never a model binary. Approval binds mission/run/project/revision/canonical IR fingerprint. See [PRESENTATION_IR.md](PRESENTATION_IR.md) and [PRESENTATION_QA.md](PRESENTATION_QA.md).

| Field | Meaning |
| --- | --- |
| `taskId`, `jobId`, `projectId` | Identity and scope |
| `type`, `title`, `objective`, `assignedAgent` | Work and owner |
| `dependencies` | Task IDs that must pass before this task runs |
| `requiredInputs`, `expectedOutputs` | Typed source/artifact references |
| `acceptanceCriteria` | Machine-readable checks, each with validator ID, parameters, required evidence, and pass rule |
| `allowedTools` | Tool IDs further constrained by registry policy |
| `contextBudget` | Maximum input tokens and retrieval limits for this task |
| `maxAttempts`, `timeout` | Bounded execution limits |
| `status`, `priority` | State and scheduling order |
| `createdAt`, `startedAt`, `completedAt` | Lifecycle timestamps; nullable until applicable |

Criteria example: `{ "validatorId": "pptx.slideCount", "params": { "min": 5, "max": 20 }, "evidence": "artifact", "passRule": "withinRange" }`. A task cannot enter READY without valid criteria and required inputs. Retry count belongs to task runs, not an overwritten task result.

## Agent definition and run result

An agent definition has `id`, `name`, `role`, `capabilities`, `allowedTools`, `preferredModel`, `contextPolicy`, `inputSchema`, `outputSchema`, and `validationRequirements`. The Orchestrator matches capabilities and validates inputs/outputs against these schemas. Agent tools remain subject to policy even if listed in `allowedTools`.

Each run returns `{ "status": "completed", "summary": "...", "artifacts": [], "evidence": [], "issues": [], "recommendedNextActions": [] }`. Other run statuses may be `failed`, `blocked`, or `waitingForApproval`. Evidence entries reference logs, files, tests, or source passages; they do not substitute for validation. An agent may recommend next actions but cannot declare the entire job complete.

## Evaluation and issues

Deterministic validators run first where possible. A semantic evaluator checks criteria that require judgment, a Critic diagnoses failures and proposes a specific repair, and a Final Reviewer checks the assembled job after task passes. Separate creation and review agents when practical. Validation result: `{ "status": "fail", "score": null, "issues": [{ "severity": "high", "location": "slide 6", "type": "text_overflow", "description": "Text exceeds the content area.", "suggestedAction": "Restructure the content." }], "evidence": [] }`. Status is `pass`, `fail`, or `inconclusive`; an inconclusive required check cannot silently count as pass. Scores are optional and never override required checks.

## Tools, artifacts, and provenance

Tool definition: `toolId`, `capabilities`, `riskClass`, `allowedAgentTypes`, `requiredPermissions`, `requiresHumanApproval`, and input/output schemas. Artifact metadata: `artifactId`, `projectId`, `jobId`, `taskId`, `type`, `version`, `path`, `creatorAgent`, `createdAt`, `validationStatus`, `sourceLineage`. Source references preserve applicable document page/slide/sheet or repository path/commit and future chunk IDs. Paths are references subject to project permissions, not authority to read arbitrary files.

## Development request and patch proposal

A development request carries `projectId`, canonicalized workspace root, request, acceptance criteria, allowed and denied paths, structured test commands, file/byte/iteration limits, create/delete flags, dry-run mode, and read-only Git preference. The registered workspace ID, rather than later agent input, selects the canonical root.

A patch proposal contains `summary`, `reasoningSummary`, `files`, `testsRecommended`, `risks`, and `assumptions`. Each file has path, `MODIFY|CREATE|DELETE`, full replacement content, expected base hash, and purpose. The SHA-256 fingerprint covers the normalized complete proposal. Approval binds job, task, agent, tool action, workspace, proposal input digest, and fingerprint. Approval is single-use and cannot authorize a changed patch.

Phase 6.1 development task types are `DEV_PLAN`, `CODE_RESEARCH`, `DEVELOP`, `PATCH_EVALUATE`, `CODE_REVIEW`, `PATCH_APPROVAL`, `PATCH_APPLY`, `TEST`, `CRITIQUE_REPAIR`, and `FINAL_REVIEW`. A handoff has `fromAgent`, `toAgent`, `taskId`, `objective`, `artifactRefs`, `contextRefs`, `issues`, `constraints`, and `nextExpectedOutput`; these fields carry data, never permission. `DEVELOPMENT_CONTEXT` records current file ranges, hashes, source, separate knowledge chunks, selection reasons, budget, and truncation. Provider mode changes model selection only.

Phase 6.2 AI settings contain `runtimeProvider`, six chat role assignments, a separate embedding assignment, and bounded limits. Values must resolve to registered eligible models. Public model-call records contain identifiers, role, provider/model, timing, token metadata, retry, error, and fallback information; they exclude prompts, credentials, and model reasoning. Model Lab accepts two distinct registered chat models and one fixed fixture type and returns data-only observations.

Phase 7 Project records bind an opaque project ID to one revalidated workspace, existing repository/source IDs, the same ID as knowledge scope, model preferences, and timestamps. Mission records carry project, request, mode, state, dry-run choice, and current run. Mission Run snapshots append task summaries, actual model-call metadata, context counts, artifact references, approval/test/final state, and structured errors. Project IDs are required when resolving mission and run views; record contents cannot grant tools or permissions.

Phase 8 adds a validated Document Specification, bounded Evidence Pack, Document IR, revision history, grounding/review/QA records, exact fingerprint approval, and final document artifact metadata. Evidence IDs are server-created and project-bound. Final artifact metadata stores the IR fingerprint and a distinct file hash. Only a registered artifact ID plus its project scope can resolve a download.
