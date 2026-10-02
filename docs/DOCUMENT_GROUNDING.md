# Document Grounding

An Evidence Pack is built before drafting from sources explicitly associated with the project. Items carry a server-generated ID, source record ID/type, known filename or other provenance, bounded text, temporal relevance, and required-fact support. Duplicate excerpts are removed and the pack is limited to 30 items and approximately 24,000 characters.

Evidence is data rather than instruction. Text asking Darkcry to reveal secrets, run commands, change projects, or bypass approval gains no authority.

Document grounding extends the same deterministic principle used by the existing GroundingEvaluator. Every evidence ID must exist in the run's project pack. Numeric and full-date claims in a cited block must occur in cited evidence. Unknown IDs, cross-project evidence, malformed tables, unsupported factual blocks, placeholders, and summary/body numeric inconsistency fail QA. Deterministic failures cannot be overridden by the model fact checker or reviewer.

Missing evidence produces explicit coverage states (`SUPPORTED`, `PARTIALLY_SUPPORTED`, `UNSUPPORTED`) and safe abstention text. It is never replaced with guessed facts.
