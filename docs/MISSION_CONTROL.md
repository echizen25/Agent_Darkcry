# Mission Control

Mission Control is the project-scoped web interface over the existing Agent Core and Orchestrator. A mission records a user objective; each execution creates a run snapshot with task status, actual model calls, context metrics, artifact references, approvals, tests, and final state. Supported modes are `RESEARCH` and `DEVELOPMENT`. Development starts as a dry run unless the user explicitly clears that option.

## Lifecycle

`READY -> RUNNING -> WAITING_APPROVAL -> COMPLETED|BLOCKED|FAILED|CANCELLED`

Research missions use the registered research workflow and the project's knowledge scope. Development missions create the existing Phase 6.1 task graph. The browser never invokes an agent directly. Run history is append only. The UI derives its timeline from real task records and displays roles, provider/model calls, context counts, safe selection reasons, artifacts, approval state, test state, repair tasks, and the final result. Artifact values are bounded and rendered with `textContent`; prompts and reasoning are excluded.

## Approval and cancellation

Pending patch approval comes from the existing ApprovalService. Resolution verifies the run, project, job, and approval record before resuming the same Orchestrator job. The underlying approval remains bound to the exact patch fingerprint. Rejection blocks the job. Cancelling a run waiting for approval denies that action and releases its workspace lock. Cancellation of a currently executing model or tool call is recorded as requested and takes effect only at a safe boundary.

## Degraded dependencies

Mission Control never starts Docker, Qdrant, Ollama, or another service. Local code discovery remains available when Qdrant is unavailable. Knowledge-dependent work returns its existing structured unavailable or blocked result.

