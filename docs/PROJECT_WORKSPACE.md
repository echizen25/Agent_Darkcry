# Project Workspace

A Phase 7 project is a security and context boundary identified by an opaque UUID. It associates one validated Workspace Registry entry with existing repository and source records, a stable knowledge scope, and non-secret model preferences. Display names never authorize access.

## Registration and persistence

The project service accepts only absolute workspace roots that pass the existing canonical path, link, allowed path, denied path, sensitive file, and test command validation. Repository and source IDs must already exist. Association does not create, copy, delete, or grant write access to those resources.

Metadata is stored in ignored `data/projects.json` with schema version 1. Saves write a sibling temporary file and atomically rename it. The store is limited to 2 MB. A malformed file is preserved, reported as `PERSISTENCE_CORRUPT`, and cannot be overwritten until recovered. On startup, every saved workspace is registered again; an unavailable path is shown as unavailable rather than silently replaced.

Deleting a project requires explicit confirmation and removes only Darkcry metadata, missions, runs, and activity. Workspace, repository, source, Qdrant, and Docker data remain untouched.

## Isolation and concurrency

Mission, run, artifact, approval, context, and activity queries verify the selected project. Knowledge queries use the project's UUID as `projectId`. Relative workspace paths may be displayed; repository content remains inert data.

One non-dry development run can hold a workspace write lock. A second write-capable run receives `WORKSPACE_BUSY`. Research and development dry runs do not take the write lock. Locks release on completion, failure, rejection, or safe cancellation.

Model resolution is run override, then project preference, then global role assignment, then registered default. Every model ID must be an enabled chat model. Model and provider choices affect intelligence only; workspace paths, tools, commands, approvals, and permissions remain fixed.
