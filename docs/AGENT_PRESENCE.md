# Agent presence projection

Phase 10 provides a read-only current-session compatibility layer for a future Phase 10.5 office. It does not build avatars, rooms, animation, a game, Phaser or another scheduler.

GET /api/projects/:projectId/agent-presence optionally accepts missionId from the same project. The project must exist; mission ownership is checked. Only runs associated with that project and actual in-memory Orchestrator jobs participate. No write/action/approval endpoint exists.

AgentPresence v1 fields: schemaVersion, agentId, displayName, departmentId, roleId, optional missionId/runId/taskId, status, lastEventAt and activityLabel. An explicit registry snapshots actual registered agent IDs and roles, mapping demo/research/development/document/presentation/media families to OPERATIONS/RESEARCH/DEVELOPMENT/DOCUMENTS/PRESENTATIONS/MEDIA. Unknown agent IDs are counted but never create fictional workers. EMAIL, SOCIAL, TRADING and BUSINESS are reserved NOT_IMPLEMENTED departments.

QUEUED/READY -> ASSIGNED; PLANNING -> PLANNING; RUNNING/REVISING -> WORKING; validation/review/QA -> REVIEWING; actual approval wait -> WAITING_APPROVAL; BLOCKED/COMPLETED/FAILED/CANCELLED retain actual terminal or blocked state. A cancelled job overrides its task projection. Registered agents with no task history in scope are IDLE, which never means a model is continuously running. Completed/failed/cancelled history is displayed as a terminal result until a newer task exists.

Aggregation selects active assignments first, ordered approval wait, blocked, review, work, planning, assigned; then latest actual event timestamp and stable task ID. With no active assignment it selects the latest terminal task. An agent may have concurrent tasks; one deterministic record represents its most salient task, not a synthetic activity percentage. Records are capped at 100; task/event history remains current-session and is not reconstructed after restart.

Labels are fixed strings, display names are sanitized registered roles, and records never include prompts, source content, tool arguments, workspace paths or private reasoning. The UI polls at five-second intervals with one request in flight and skips hidden pages. Later office configuration may map agentId -> avatarId -> roomId -> animationState without granting agent authority.
