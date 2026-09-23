# workspace-tree

One directory level of the selected workspace, for the Hub Explorer sidebar.

## Public interface

| Export | In | Out |
|---|---|---|
| `listWorkspaceTree(path?)` | a workspace-relative path; omitted or empty means the root | `WorkspaceTreeListing` |

One level per call. The sidebar expands on demand, so reading a whole repo eagerly costs first
paint and returns far more than the Explorer draws at once.

## What it does NOT handle

- **Watching for changes.** A listing is a snapshot. The sidebar re-reads a level when it is
  expanded, and nothing pushes updates.
- **Reading file contents.** The tree names files; opening one is the note reader's job.
- **Deciding the workspace.** The root is the fan's configured workspace, read through
  `src/main/modules/config`. This module never takes a path from the renderer as its root.

## Dependencies

`node:fs/promises`, `node:path`, `fanWorkspace` from `src/main/modules/config`, and
`PRUNED_DIRECTORIES` from `src/main/modules/corpus/_internal/indexer` (shared prune list; one list,
not two).
