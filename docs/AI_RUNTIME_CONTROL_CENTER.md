# AI Runtime Control Center

Phase 6.2 adds a compact Control Center to `/app.html` and a safe `/api/ai` namespace. It displays runtime provider settings, role assignments, installed eligible models, read-only infrastructure health, recent model-call metadata, bounded development-context categories, and a controlled Model Lab.

ChatGPT/Codex is the preferred cloud development surface. Its authentication is not an OpenAI API credential and is never read by the application. Darkcry runtime uses the Model Gateway; local Ollama is the default. OpenAI API remains an optional, separately configured future provider and reports `NOT_CONFIGURED` when absent.

Settings are process-local in Phase 6.2. All provider, role, model, embedding, and limit values are validated against the registry. Role fallback is deterministic: role model, configured general model, then provider default. Every fallback records the requested and actual non-secret selection and its reason. Provider or model selection changes intelligence only; Tool Registry, workspace scope, approvals, patch fingerprints, tests, Git restrictions, and credential restrictions are unchanged.

Health checks are cached briefly and may be refreshed manually. Ollama health uses its model list. Qdrant health reads the configured collection without mutation. The UI never returns keys, environment secrets, prompts, chain-of-thought, or source contents. Context inspection reports counts, relative paths, estimates, and pressure only.

Model Lab compares already installed chat-capable models sequentially on equivalent synthetic fixtures. Fixture types are Planner, Developer, Reviewer, Critic, and Structured JSON. It grants no tools, workspace, shell, Git, browser, or computer control, retains at most 30 recent observations, does not alter active assignments, and reports factual contract, latency, and token observations without a universal score.

Headroom remains an external Codex context optimizer. The application labels its status `UNKNOWN` unless safely supplied by its environment. Caveman is deferred. MemPalace is deferred for possible selective cross-session memory only.
