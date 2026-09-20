# Job and task state machine

Agent Core V1 enforces these transitions for its demo workflow. Approval and cancellation flows remain future work. Invalid transitions must be rejected and logged; no state is inferred from a UI label alone.

| State | Meaning | Legal next states |
| --- | --- | --- |
| `QUEUED` | Goal or task accepted | `PLANNING`, `CANCELLED` |
| `PLANNING` | Deliverables, graph, criteria, budgets defined | `READY`, `WAITING_FOR_APPROVAL`, `BLOCKED`, `FAILED`, `CANCELLED` |
| `READY` | Inputs/dependencies satisfied | `RUNNING`, `WAITING_FOR_APPROVAL`, `CANCELLED` |
| `RUNNING` | Specialist/tool execution | `VALIDATING`, `WAITING_FOR_APPROVAL`, `BLOCKED`, `FAILED`, `CANCELLED` |
| `VALIDATING` | Required checks and evidence reviewed | `COMPLETED`, `REVISING`, `WAITING_FOR_APPROVAL`, `BLOCKED`, `FAILED`, `CANCELLED` |
| `REVISING` | Critic diagnosis and bounded repair plan | `RUNNING`, `WAITING_FOR_APPROVAL`, `BLOCKED`, `FAILED`, `CANCELLED` |
| `WAITING_FOR_APPROVAL` | Specific operation awaits a decision | Prior state after approval, `BLOCKED` or `CANCELLED` after denial |
| `BLOCKED` | Inputs, permissions, or progress unavailable | `READY` after the blocker changes, `CANCELLED` |
| `COMPLETED` | Required checks passed and final review accepted | Terminal |
| `FAILED` | Limits reached or unrecoverable failure | Terminal |
| `CANCELLED` | User/system cancellation | Terminal |

For a job, `COMPLETED` requires all required tasks completed, artifacts validated, and Final Reviewer acceptance. A task may complete before the job. Approval resumes the saved prior state only after the exact requested operation is authorized; denial never authorizes a substitute operation. A changed task graph returns the job to `PLANNING` through an explicit revision record, not an unlogged transition.

## Bounded execution loop

Plan → execute → validate. On pass, send the task to final review or release its dependents. On failure, the Critic records evidence and diagnosis, creates a repair plan, then the task enters `REVISING` and runs again. Preserve every run and validation result. Stop or escalate on `maxAttempts`, task/job timeout, token/context budget exhaustion, repeated identical error, no progress, duplicate action, unmet dependency, or approval requirement. A blocker enters `BLOCKED`; an exhausted or unrecoverable task enters `FAILED`. Neither condition loops automatically forever. Human intervention may supply missing input or approve a specific operation.

## Approval classes

| Class | Examples | Default handling |
| --- | --- | --- |
| `AUTO` | Read project files, analyze sources, generate local artifacts, run approved tests, read logs | Run within project/tool limits and log |
| `CONTROLLED` | Modify project files, launch approved apps, scoped browser automation | Require explicit scope, checkpoint/logging, and policy checks; ask for approval when scope is absent |
| `REQUIRES_HUMAN_APPROVAL` | Delete user files, destructive Git action, external publish/upload/message, system setting change, live financial order | Enter `WAITING_FOR_APPROVAL` with exact action, target, risk, and rollback plan |

An approval record binds project, job, task, tool, action arguments, requester, decision, decision time, and expiry. A denial records the reason and moves to `BLOCKED` or `CANCELLED` as appropriate. Approval for one action does not grant blanket permission to later actions. All classes still enforce path, application, network, and credential boundaries.
