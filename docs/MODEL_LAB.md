# Model Lab

Model Lab is diagnostic evaluation over tiny synthetic fixtures. It supports Planner schema, Developer patch shape, Reviewer known-issue detection, Critic repair guidance, and strict JSON. Both models receive the same fixture, constraints, response format, and output limit. Calls run sequentially.

Recorded observations include provider, model, task, status, contract and schema validity, patch validity or issue detection where relevant, retries, duration, provider tokens when available, estimated context, and structured errors. Full prompts and outputs are not copied into usage history.

Model Lab cannot request tools or write to a workspace. Source-like fixture text that asks for PowerShell, `.env`, Git push, provider changes, or approval bypass remains untrusted data. Permission-shaped model output is rejected as an invalid contract.
