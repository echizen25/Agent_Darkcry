# Media provider gateway

MediaProviderRegistry declares IMAGE_GENERATION, VIDEO_GENERATION, VOICE_GENERATION and AUDIO_GENERATION. Registration requires a stable provider ID, capability declaration, health and generate methods. No production provider is registered automatically.

MediaProviderGateway returns binary bytes, MIME, provider/model and SHA-256 generation fingerprint. It bounds request JSON to 12,000 characters, prompt to 2,000, reference hashes to 12, output to 2 MB, concurrency to two by default (maximum four), attempts to initial plus one retry by default (maximum two retries), and each attempt to a maximum 10 seconds. MEDIA_BUSY rejects excess concurrent requests rather than building an unbounded queue.

Canonical fingerprints include provider, capability, model, parameters, prompt and reference asset hashes. Changed inputs change fingerprints. Failures normalize to NOT_CONFIGURED, UNSUPPORTED_CAPABILITY, TIMEOUT, RATE_LIMIT, PROVIDER_FAILED, INVALID_OUTPUT or CANCELLED media codes. Call metadata excludes prompts, credentials and binary data.

External providers require an explicit trusted generationApproval policy argument supplied only after ApprovalService validates the generation binding. Clients cannot set this flag through Mission Control. Final package approval is independent. Adapter implementations must honor AbortSignal; late fulfilled results are discarded, never registered. An uncooperative external adapter cannot be forcibly terminated by JavaScript and must not be deployed as production-safe.

FakeMediaProvider supports success, failure, timeout, rate-limit and invalid-output fixtures. Supported fake capabilities are image, voice and audio; video generation is explicitly unsupported. Valid fixtures are simple RGB PNG and silent PCM WAV. External=true exists only to exercise generation approval offline. No paid calls, network adapter, secrets or SDK dependency.
