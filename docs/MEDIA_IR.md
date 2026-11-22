# Media IR version 1

All records use schemaVersion: 1. Model output is parsed JSON data and projected onto explicit field allowlists; commands, paths, permission requests and private reasoning keys are discarded.

- MediaSpecification: IMAGE/VIDEO/AUDIO/MEDIA_PACKAGE; title, purpose, audience; registered platform/language/style/aspect/resolution; duration 1–180 seconds; fixed project-only constraints.
- CreativeDirection: supported message, visual style, pacing, opening, ending, evidenceRefs.
- ScriptIR: up to 12 stable-ID segments; bounded voiceOver/onScreenText, duration and evidenceRefs.
- MediaStoryboard: up to 12 stable-ID scenes referencing script segments; duration, description, CUT/FADE/NONE and required asset-plan IDs.
- ShotPlan: up to 12 stable-ID shots; existing scene, STILL/WIDE/DETAIL, motion intent and duration.
- AssetPlan: up to 12 stable plan IDs; IMAGE/VIDEO/AUDIO type, origin, declared capability, bounded prompt, evidenceRefs and referenceAssetIds.
- AssemblyPlan: up to 48 stable track IDs; IMAGE/VIDEO/VOICE/MUSIC/TEXT, scene, asset ID, start and duration within total bounds. Current deterministic assembler creates image/voice tracks only; other schema track types reserve data compatibility, not a composition feature.
- MediaPackageManifest: full approved content, asset references/hashes, QA, revision, canonical fingerprint, artifact refs and output/composition limitations.

QA verifies IDs, membership, durations, aspect ratios, released generation permission, asset existence/type and assembly references. Document IR grounding is reused for unknown/cross-project references, dates/placeholders; additional whole-token numeric and conservative lexical matching rejects unsupported claims. Direct associated evidence is bounded to 14,000 characters and no semantic retrieval is required. Lexical checks may reject valid paraphrases; no semantic factual verification or actual visual/audio inspection is claimed.

Package fingerprints cover all specification/creative/script/scene/shot/asset-plan/assembly content plus asset IDs, SHA-256 and generation fingerprints. Revision also participates separately in exact human approval binding.
