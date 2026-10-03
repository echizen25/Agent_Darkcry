# Presentation IR

Planning and content are separate from rendering. The model returns bounded JSON, never PPTX binary or executable layout code.

Specification includes title, purpose, audience, English/Filipino/Taglish, tone, type, slide count (3–40), optional duration (1–180 minutes), period, registered theme, PROJECT_ONLY policy, required topics and service-owned constraints. Types: EXECUTIVE, PROJECT_UPDATE, ACCOMPLISHMENT, TECHNICAL, RESEARCH, TRAINING, BRIEFING, GENERAL. Duration is advisory; it is not an exact slide-count formula.

Narrative Plan contains coreMessage, audienceTakeaway and bounded sections with purpose, message and valid evidenceRefs. Storyboard has exactly the target number of slides, TITLE first, unique `slide-*` IDs, type, purpose, headline, message and evidenceRefs.

```json
{
  "metadata": {"title": "Project accomplishments", "projectId": "opaque-project-id", "revision": 1},
  "theme": "PROFESSIONAL",
  "slides": [{
    "id": "slide-01", "type": "TITLE", "title": "Project accomplishments",
    "purpose": "Introduce the presentation", "message": "Review project evidence",
    "blocks": [], "speakerNotes": [], "evidenceRefs": [],
    "visualIntent": {"layout": "TITLE", "visualType": "TEXT", "emphasis": "", "notes": ""}
  }]
}
```

Slide types: TITLE, SECTION, CONTENT, BULLETS, METRIC, COMPARISON, TIMELINE, PROCESS, TABLE, CHART, IMAGE, QUOTE, SUMMARY, CLOSING.

Blocks: TEXT/CALLOUT/FOOTNOTE/QUOTE `{text,evidenceRefs}`; BULLETS `{items,evidenceRefs}` (strings or structured date/label/description entries for timelines/processes); METRIC `{value,label,evidenceRefs}`; TABLE `{columns,rows,evidenceRefs}`; CHART `{chartType,categories,series:[{name,values}],evidenceRefs}`; IMAGE_PLACEHOLDER `{label,evidenceRefs:[]}`; SHAPE `{shape:RECT|LINE|CIRCLE,evidenceRefs:[]}`. Factual blocks require citations. Charts support BAR, COLUMN, LINE, PIE and DOUGHNUT, finite explicit values, at least two categories, and limited series. There are no model-provided paths or executable chart expressions.

Layouts: TITLE, TITLE_CONTENT, TITLE_TWO_COLUMN, TITLE_METRIC, TITLE_CHART, TITLE_TABLE, TITLE_TIMELINE, TITLE_PROCESS, TITLE_IMAGE, SECTION, SUMMARY, CLOSING. Intent selects registered geometry; block type selects native rendering. Comparison uses two columns; timeline/process entries use editable cards. Themes PROFESSIONAL/MINIMAL define font/fallback, contrast, margins, hierarchy, accent and soft backgrounds. No arbitrary CSS or colors.

Service bounds: title 100 chars; subtitle 200; normal bullet 180; six bullets; text 600; six blocks; 140 words; tables eight rows/six columns; notes 3,000 chars; five evidence references per slide/block; total IR 250KB. Per-block line/height estimates may reject smaller content that cannot fit its slot. Speaker notes contain user-facing information and source notes only.

Canonical SHA-256 fingerprints sort object keys, preserve array order and exclude createdAt/generatedAt. Approval recomputes the exact current IR digest. Content, notes, layout, theme and revision changes invalidate approval.
