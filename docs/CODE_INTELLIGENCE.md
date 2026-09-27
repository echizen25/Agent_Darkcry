# Code intelligence

Phase 6.1 uses bounded workspace heuristics, not a language server or compiler. The index includes permitted text files only and records symbols, import/include hints, paths, and related-test candidates. Supported practical patterns cover JavaScript, TypeScript, C#, Java, Classic ASP/VBScript, SQL, HTML, CSS, JSON, XML, and Markdown. `code.symbolSearch`, `code.findReferences`, and `code.relatedTests` are read-only tools governed by the existing Tool Registry.

Search ranking favors explicit paths, exact symbol definitions, path matches, related tests, and import hints. Code references are case-insensitive text hits with short line context. Index construction respects registered workspace allowed/denied paths, file sizes, binary exclusions, and symlink confinement. A write invalidates the index. Semantic Qdrant results may suggest a file, but current workspace content and hash determine any patch.

Limitations: parser-free symbol patterns can miss or misclassify overloads, anonymous functions, generated code, and dynamic imports. Test associations are candidates. Large or truncated files are not indexed as definitions.
