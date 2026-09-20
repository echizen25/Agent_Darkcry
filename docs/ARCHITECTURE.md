# Architecture

Presentation planning and content should be independent of PPTX rendering. The planner should produce a structured presentation description; the renderer should turn that description into editable PowerPoint elements through reusable slide layouts and helpers.

The intended application boundaries are a small Express server, a vanilla HTML/CSS/JS interface, presentation planning/content, and PptxGenJS rendering. The Model Gateway supports optional local Ollama use for research; OpenAI remains a later option. These are boundaries, not prescribed filenames or APIs.

The server also hosts separate document/notes and Git repository ingestion modules. Agent Core uses an in-memory Orchestrator for demo and read-only research jobs without changing those modules; see [AGENT_SYSTEM_ARCHITECTURE.md](AGENT_SYSTEM_ARCHITECTURE.md).
