# Report and Document Team V1

Phase 8 extends the existing Mission and Orchestrator with `DOCUMENT` jobs. The explicit graph is `DOCUMENT_PLAN → DOCUMENT_RESEARCH → EVIDENCE_BUILD → DOCUMENT_DRAFT → GROUNDING_CHECK → DOCUMENT_REVIEW → DOCUMENT_QA → DOCUMENT_APPROVAL → DOCUMENT_RENDER → ARTIFACT_QA → FINAL_REVIEW`. Model roles are mapped to the existing planner, research, general, review, and critic routes. Model choice never changes source scope, approval, tools, or artifact permissions.

The model-driven specialists are DocumentPlannerAgent, DocumentWriterAgent, DocumentFactCheckerAgent, DocumentReviewerAgent, DocumentCriticAgent, and DocumentFinalReviewerAgent. DocumentResearchAgent and EvidenceBuilder are deterministic specialists. Rendering and QA are programmatic. Every agent is registered in the existing Agent Registry; no second Orchestrator or mission system exists.

Associated project source records are read directly when Qdrant is unavailable. Evidence remains untrusted data. Each run records tasks, model calls, evidence and draft token estimates, revisions, grounding, review, QA, approval, render metadata, and final review.

Final rendering requires approval of the exact Document IR fingerprint. Approval is bound to project, mission job, task, revision, and fingerprint. A changed revision is rejected before the approval is resolved. Rejection blocks rendering and retains history.

DOCX files are stored under ignored `data/artifacts/<project>/<mission>/<run>/`. Download uses an opaque registered artifact ID and matching project ID. Arbitrary paths are never accepted.

