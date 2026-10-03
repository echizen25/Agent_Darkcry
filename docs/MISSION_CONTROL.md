# Mission Control

Mission Control is the project-scoped web interface over the existing Agent Core and Orchestrator. A mission records a user objective; each execution creates a run snapshot with task status, actual model calls, context metrics, artifact references, approvals, tests, and final state. Supported modes are `RESEARCH`, `DEVELOPMENT`, `DOCUMENT` and `PRESENTATION`. Development starts as a dry run unless the user explicitly clears that option; document and presentation release always pause for approval.

Presentation missions expose optional type/title/audience/language/tone/period/slide count/duration/theme/topics, actual task progression, Narrative Plan and Storyboard, expandable safe slide cards, evidence, QA/review, revision fingerprints, approval and PPTX downloads. Polling reads actual Orchestrator task state. Preview uses structured DOM text, not model HTML or a pixel-perfect thumbnail. See [PRESENTATION_TEAM.md](PRESENTATION_TEAM.md).

## Lifecycle

`READY -> RUNNING -> WAITING_APPROVAL -> COMPLETED|BLOCKED|FAILED|CANCELLED`

Research missions use the registered research workflow and the project's knowledge scope. Development missions create the existing Phase 6.1 task graph. Document missions run the Phase 8 report team and expose optional type, title, audience, language, tone, period, style, and DOCX output fields. The browser never invokes an agent directly. Run history is append only. The UI derives its timeline from real task records and displays roles, provider/model calls, context counts, safe selection reasons, evidence, structured document preview, unsupported issues, artifacts, approval state, test/QA state, repair tasks, downloads, and the final result. Artifact values are bounded and rendered with `textContent`; prompts and reasoning are excluded.

## Approval and cancellation

Pending patch approval comes from the existing ApprovalService. Resolution verifies the run, project, job, and approval record before resuming the same Orchestrator job. The underlying approval remains bound to the exact patch fingerprint. Rejection blocks the job. Cancelling a run waiting for approval denies that action and releases its workspace lock. Cancellation of a currently executing model or tool call is recorded as requested and takes effect only at a safe boundary.

## Degraded dependencies

Mission Control never starts Docker, Qdrant, Ollama, or another service. Local code discovery remains available when Qdrant is unavailable. Knowledge-dependent work returns its existing structured unavailable or blocked result.
