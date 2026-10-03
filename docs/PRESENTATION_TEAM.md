# PowerPoint Production Team V2

`PRESENTATION` missions run in the existing Orchestrator, MissionService and Mission Control. Legacy `/api/presentations/generate` and its download API remain independent. The existing renderer now also accepts validated Presentation IR with the existing PptxGenJS dependency; it uses native editable objects.

## Team and graph

PresentationPlannerAgent (planner), PresentationResearchAgent (deterministic associated-source reader), NarrativeArchitectAgent (planner), StoryboardAgent (planner), SlideContentAgent (general), VisualPlannerAgent (general), PresentationReviewerAgent (review), PresentationCriticAgent (critic), and PresentationFinalReviewerAgent (review) have separate registered contracts. Evidence, grounding and QA are deterministic services. Model outputs are validated; unavailable providers, malformed output and unsupported evidence fail explicitly. There is no canned production deck fallback.

`PRESENTATION_PLAN → PRESENTATION_RESEARCH → EVIDENCE_BUILD → NARRATIVE_ARCHITECTURE → STORYBOARD → SLIDE_CONTENT → VISUAL_PLAN → GROUNDING_CHECK → PRESENTATION_REVIEW → SLIDE_QA → PRESENTATION_APPROVAL → PPTX_RENDER → PPTX_QA → FINAL_REVIEW`

Repair adds explicit `PRESENTATION_CRITIC`, optional project-only `TARGETED_RESEARCH` / evidence refresh, `TARGETED_REVISION`, visual planning, grounding, review and `RE_EVALUATION` tasks. It replaces affected slides, preserving unaffected slides. Global issues can require a full-deck revision. At most two revisions are allowed. Identical content stops as no progress. Evidence IDs survive refresh for identical source excerpts.

## Scope, routing and budgets

The Phase 8 Evidence Pack is reused without changing its schema: project/source IDs, provenance, text, relevance, supports and coverage. Registered source associations determine access. Existing ingestion handles PDF/DOCX/PPTX/XLSX/TXT/Markdown/notes. Direct excerpts are capped at 30 items, 1,200 characters each, then selected by Context Budget Manager within 4,000 estimated tokens. Each slide has at most five citations. Model inputs are limited to 7,000 estimated tokens. Writer handoffs include relevant storyboard evidence and artifact IDs, rather than source files or previous prompts.

Project preferences and run overrides use the existing ModelSelectionService. The call limit and output limit honor existing runtime settings (16 calls / 6,000 output tokens without a selection service); each call has a 10-second bound, with a 60-second preapproval workflow budget. Postapproval final review has a separate 15-second window. Tokens, pressure, provider/model, latency, calls and retries remain observable. Research is deterministic and has no fabricated provider usage.

Qdrant is not required or used by this workflow. Associated source records and stored repository documentation use the existing Knowledge Hub source adapters, retaining page/slide/sheet/file provenance and secret-file exclusions. Semantic project knowledge not already associated as source records is deferred. No service is started, no web or media tools are added, and no model can change permissions or approval.

## Approval and artifacts

Existing ApprovalService binds project, mission, run, revision and canonical IR fingerprint. It recomputes the fingerprint and deterministic QA before resolution and render. Mutation invalidates the approval; rejection blocks render and retains history. Native editable rendering, structural QA and a distinct final review must all pass before a file artifact is registered.

Artifacts use `data/artifacts/<project>/<mission>/<run>/`, opaque artifact IDs, sanitized PPTX names, MIME, size, revision, IR fingerprint and SHA-256 file hash. Preview/evidence/download APIs require matching project scope. Persistence retains run snapshots and downloadable artifacts; pending jobs and their previews remain process local, as in Phase 8. Restart/resume of pending production jobs is deferred.

## UI and limitations

Mission Control offers presentation requirements, real task history, narrative/storyboard, safe slide cards, evidence, review/QA, revision/fingerprint, approval and download. Text is created with DOM `textContent`, never model HTML. Previews are structured cards, not rendered PowerPoint thumbnails.

User-directed postapproval revision requests are deferred; create a new mission. No image asset ingestion is added: intentional image placeholders are supported, arbitrary paths/assets are rejected. Grounding is conservative lexical/exact numeric/date matching; chart category/value segments must support each value. Calculated metrics, robust terminology inference, complex chart data provenance and semantic contradictions are deferred. Density checks estimate likely overflow and do not reproduce PowerPoint's font/layout engine. See [PRESENTATION_QA.md](PRESENTATION_QA.md).

## Validation

`node --test tests/agent-core.test.js tests/phase3.test.js tests/phase4.test.js tests/phase5.test.js tests/phase6.test.js tests/phase6-1.test.js tests/phase6-2.test.js tests/phase7.test.js tests/phase8.test.js tests/phase9.test.js`

`node tests/phase9-live.mjs` runs one bounded installed-local-model attempt plus independent synthetic IR rendering and fake-provider approval integration, all in disposable OS-temp storage. It never auto-approves real user content or downloads models.
