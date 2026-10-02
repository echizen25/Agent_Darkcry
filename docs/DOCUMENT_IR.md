# Document IR

The Document Intermediate Representation is validated JSON consumed by the deterministic DOCX renderer. Metadata contains the validated specification and revision. Sections have stable IDs, headings, and blocks.

V1 block types are `paragraph`, `bullet_list`, `numbered_list`, `table`, `callout`, `signature_block`, and `page_break`. Tables contain explicit columns and equal-width rows. Factual blocks carry server-created `evidenceRefs`; unknown and cross-project references fail QA. HTML is not a supported block type.

Bounds are 20 sections, 100 blocks, 30 evidence items, 250 KB serialized IR, and two revision attempts. QA checks title, required and empty sections, duplicate headings, block types, table shape, evidence references, numbers, dates, summary consistency, placeholders, and total size.

The IR fingerprint is SHA-256 over substantive JSON with volatile timestamps excluded. The DOCX file receives a separate SHA-256 hash.

