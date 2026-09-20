# Architecture

Presentation planning and content should be independent of PPTX rendering. The planner should produce a structured presentation description; the renderer should turn that description into editable PowerPoint elements through reusable slide layouts and helpers.

The intended application boundaries are a small Express server, a vanilla HTML/CSS/JS interface, presentation planning/content, and PptxGenJS rendering. AI integration is a later concern, with Ollama as the primary option and OpenAI optional. These are boundaries, not prescribed filenames or APIs.

The current server also hosts separate document/notes and Git repository ingestion modules. The proposed multi-agent platform will wrap these working capabilities incrementally; see [AGENT_SYSTEM_ARCHITECTURE.md](AGENT_SYSTEM_ARCHITECTURE.md). No Orchestrator or agent runtime is implemented.
