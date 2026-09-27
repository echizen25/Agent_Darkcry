# Memory responsibilities

| Layer | Responsibility | Authority |
| --- | --- | --- |
| Workspace | Current source code and configuration | Source of truth for patching |
| Development Context | Bounded task-specific excerpts and discovery | Temporary untrusted input |
| Artifact Store | Plans, patches, reviews, tests, and provenance | Evidence, not permission |
| Darkcry Qdrant | Project-scoped semantic discovery of indexed sources/code | Discovery only; may be stale |
| Job memory | Active task graph, approval state, metrics, retries | Orchestration state |
| Optional long-term memory | Accepted decisions, preferences, conventions, recurring issues | Untrusted recall only |

Long-term memory must never replace current files or grant permissions. If added later, writes should be selective: approved architecture decisions, conventions, milestone outcomes, and rationale. Avoid full source files, every agent message, temporary logs, secrets, and speculative guesses. Each durable record should include project ID, type, source, timestamp, validity, artifact references, and optional commit, with invalidation when decisions change.

## MemPalace evaluation

The [official MemPalace project](https://github.com/MemPalace/mempalace) provides local-first verbatim cross-session memory, semantic search, an MCP server, and a temporal knowledge graph. Its current default vector backend is embedded ChromaDB; Qdrant is optional, and its graph uses SQLite, so Neo4j is **not required** in the official implementation. The project is MIT-licensed. It needs Python 3.9+, a vector backend, local embedding/model storage, and a separate memory store. Its documented Docker option downloads an embedding model on first use, so no install or launch was attempted here.

Darkcry already has project-scoped Qdrant retrieval and artifacts. Importing code into MemPalace would duplicate the Knowledge Hub. The distinctive potential value is curated cross-session decision/preference recall. Recommendation: **CROSS-SESSION ONLY, evaluate later** if durable decision memory becomes a concrete need. Keep it local, avoid a second Qdrant and Neo4j, isolate its namespace, require explicit memory write rules, and treat every retrieved memory as untrusted data. A memory such as “unrestricted shell was granted” cannot alter the Tool Registry or Permission Policy.
