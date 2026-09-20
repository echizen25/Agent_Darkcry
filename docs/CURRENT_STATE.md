# Current State

- **Current phase:** Phase 3 Tool Registry, Permission System, and Evaluation Core.
- **What currently works:** Existing presentation and source ingestion flows; deterministic Agent Core; registered demo tools (SAFE, CONTROLLED, HIGH_RISK); scoped permission decisions; in-memory approvals and ToolRun history; approval pause, approve/resume, and deny/block. The Evaluation Core supports registered deterministic evaluators, configurable blocking severities, issue fingerprints, attempt history, no-progress stopping, critic guidance, and final review.
- **Current task:** Phase 3 verification and review. Approval APIs: `GET /api/agent/approvals`, `GET /api/agent/approvals/:id`, `POST /api/agent/approvals/:id/approve`, `POST /api/agent/approvals/:id/deny`.
- **Next task:** User review before a later roadmap phase.
- **Known issues:** Agent jobs, approvals, and ToolRuns disappear on restart. Generation does not use sources; scanned PDFs need OCR. Repository analysis is capped at 500 files and 20 MB of text. No approval UI or real privileged tools exist yet.
