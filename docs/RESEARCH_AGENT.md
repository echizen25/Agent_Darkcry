# Phase 5 research workflow

`POST /api/agent/research/jobs` creates a project-scoped research job with `projectId`, `question`, and optional `topK` (1–10), `maxContextTokens` (1–5000), and `maxAttempts` (1–3). `POST /api/agent/research/jobs/:id/run` executes it; `GET /api/agent/research/jobs/:id` returns task, tool, evaluation, and model evidence plus a `groundedResult` only after completion.

The existing Orchestrator selects the research Planner, read-only ResearchKnowledgeAgent, research Critic, and Final Reviewer. The agent requests `knowledge.retrieve` through the existing Tool Registry and Permission Policy. The tool uses the job's project ID, then the Knowledge Hub retrieves ranked chunks and builds bounded context. The agent calls the existing Model Gateway and asks for JSON claims with chunk IDs and exact quotes. Retrieved text stays in the untrusted knowledge portion of the model input.

The deterministic GroundingEvaluator requires each claim to cite a retrieved chunk, include an exact quote from that chunk, and use significant terms present in its quotes. It rejects missing, forged, or lexically unsupported citations. This is a conservative structural check, not a semantic proof of truth. Unsupported claims trigger targeted query planning and a bounded retry; repeated issue fingerprints stop the job. Final review requires a passing evaluation and cited claims. No answer is promoted as final on failure.

Automated tests use fake chat and embedding providers with the in-memory vector store. Real Ollama and Qdrant remain optional services configured as described in [KNOWLEDGE_HUB.md](KNOWLEDGE_HUB.md). The research job and model-call histories are process-local. This phase adds no file-editing agent or privileged tool.
