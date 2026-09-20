# PowerPoint Agent

Goal: Generate professional, visually strong, fully editable PPTX presentations.

Stack: Node.js, Express, PptxGenJS, and vanilla HTML/CSS/JS. AI may later use Ollama and optionally OpenAI; do not implement AI yet.

- Separate presentation planning and content from PPTX rendering.
- Prefer reusable layouts and helpers over duplicated slide code.
- Prioritize visual storytelling, whitespace, hierarchy, and concise content in generated slides. Avoid walls of text and repetitive layouts.
- Inspect existing code before changing behavior. Never invent filenames, APIs, functions, schemas, or project facts when they can be inspected.
- Make minimal, targeted changes. Do not rewrite unrelated working code.
- Test important changes before declaring them complete.
- Read only files relevant to the task, use targeted searches, and keep responses concise. Source code is the source of truth for implementation details.
