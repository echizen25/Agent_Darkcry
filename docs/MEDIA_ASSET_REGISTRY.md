# Media asset registry

MediaAssetRegistry stores metadata in ignored data/projects.json and binaries in ignored data/media/<project UUID>/<mission UUID>/<run UUID>/. UUID asset IDs determine filenames. Client paths, arbitrary provider paths and remote URLs are not accepted.

Provider bytes enter a unique quarantine file. Validation precedes rename/registration: 2 MB size cap, MIME/signature, PNG chunk CRCs/decompression and bounded dimensions (4,096 per side), or bounded canonical PCM WAV headers/duration. PNG currently supports 8-bit RGB fixtures; arbitrary PNG variants, JPEG, MP3 and MP4 are not claimed supported. Invalid quarantine files are removed. Paths are canonicalized and symlink roots/subdirectories/files rejected. SHA-256 is rechecked before preview/download and final approval.

Metadata includes schema version, asset/project/mission/run/plan IDs, origin, provider/model, MIME, filename, bytes, dimensions/duration, SHA-256, generation fingerprint, source asset IDs, evidence references, generation/release state and timestamps. Origins are USER_PROVIDED, PROJECT_SOURCE, GENERATED and DERIVED; registry registration supports these contracts, but V1 mission execution generates assets only. No upload/import UI is supplied.

Reference assets must belong to the selected project and already be released before use in generation. Current-run generated assets remain GENERATION_ALLOWED until exact package approval and final review; then APPROVED. Cancellation marks assets CANCELLED. HTTP previews reject failed/blocked/cancelled runs. Downloads require APPROVED. Opaque-ID endpoints enforce project scope and nosniff headers.

There is no new authentication/identity system: project scope follows the existing local application's authorization model. IDs are scope checks, not internet deployment credentials. No external provider secrets are accepted in public artifacts.

Presentation V2 remains unchanged and rejects arbitrary asset paths. Registered media metadata offers a future stable assetId/hash boundary, but rendering media assets into PPTX is not enabled by Phase 10.
