# Media Production Team V1

Phase 10 extends the existing Orchestrator, AgentRegistry, MissionService, Evaluation Core, ApprovalService and Mission Control. It does not introduce a second scheduler or application.

## Integration decisions

The existing Presentation source reader and Knowledge Hub adapters load associated sources and stored repository documentation. The Document Evidence Pack retains source provenance. Context Budget Manager estimates the 7,000-token specialist input bound. ModelGateway and ModelSelectionService retain per-project and per-run routing. MediaProviderGateway handles binary generation separately. ProjectStore persists run summaries, asset metadata and final artifact references with serialized atomic saves. This serialization also prevents concurrent cancellation/run saves from colliding.

## Real output

IMAGE, AUDIO, VIDEO and MEDIA_PACKAGE are specification types. A successful run produces a JSON manifest containing creative direction, script, storyboard, shots, asset plan, assembly timeline, asset IDs/hashes, revision, QA and exact approval. VIDEO produces an asset package and assembly plan, not a composed MP4. Native browser previews currently accept validated PNG and PCM WAV only. No MP4 composition, NLE, FFmpeg, CapCut, music licensing, speech synthesis quality claim or audiovisual inspection is supplied.

The app registers no production media provider by default. Media execution fails honestly with MEDIA_NOT_CONFIGURED (or an LLM/provider availability error); it never silently substitutes fake production output. Tests inject FakeMediaProvider. Its PNG and silent WAV are deterministic fixtures, not realistic generated images or narrated speech. No paid adapter or invented Higgsfield API is included.

## Workflow and specialists

MEDIA_PLAN -> MEDIA_RESEARCH -> CREATIVE_DIRECTION -> SCRIPT -> STORYBOARD -> SHOT_PLAN -> ASSET_PLAN -> ASSET_GENERATION -> MEDIA_REVIEW -> MEDIA_QA -> MEDIA_APPROVAL -> FINALIZE_ASSETS -> FINAL_REVIEW.

Planner validates requirements; researcher reads associated project evidence; creative director develops intent; script writer drafts grounded voice/caption text; storyboard agent maps segments to scenes; shot planner defines shots/motion intent; asset planner declares bounded assets; reviewer checks textual plan consistency; critic proposes targeted repairs; final reviewer checks deterministic release conditions. Each identity is registered. Generation, QA, approval and finalization are deterministic graph actions with registered presence identities.

Real task transitions/events pass through existing Orchestrator.change and Evaluation Core. At most two repairs, 12 LLM calls, 90 seconds before approval and 60 seconds after resume. Unchanged package content stops with MEDIA_NO_PROGRESS. Targeted script repairs preserve unaffected segments; asset repair replaces selected plan IDs and refreshes assembly references. Other plan inconsistencies stop safely if the bounded script/asset repair cannot resolve them. External regeneration pauses for a fresh exact generation approval before affected assets execute; final package approval remains a separate gate.

## Approval, cancellation and persistence

External generation pauses before provider execution. Approval binds project, mission, run, revision and canonical specification/asset-plan/provider/reference-hash fingerprint. Final approval separately binds the complete content and registered asset hashes. Rejection blocks release. Files are checked again before final approval and download. Cancellation aborts pending work, denies pending approvals, records real cancelled states and prevents late output registration/release.

Run snapshots and approved packages persist; active jobs, approvals, evidence drafts and detailed event histories remain process-local. Restart/resume is not implemented. Old unreleased asset revisions remain ignored application data for audit history; there is no automated retention/deletion system.

## Offline validation

Run node --test --test-isolation=none --test-timeout=60000 tests/phase10.test.js. Full regression includes tests/agent-core.test.js and phase3 through phase9 test files. Child-process development tests require an environment permitting spawn.
