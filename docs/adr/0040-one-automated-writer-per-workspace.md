# One automated writer runs per Workspace

Cockpit may execute automated Recipes concurrently across different Workspaces, and read-only Explore or Debate runs may overlap within one Workspace. Synthesize, Coordinate, Validate, and a writing Direct Session require that Workspace's sole automated writer lease; another write-capable run queues visibly behind the current holder.

Interactive Consoles remain outside the lease because the user controls them, but Cockpit warns when a Console and automated writer target the same checkout family. Adoption fails closed when the destination checkout has changed since the run began, requiring review or rebase rather than applying stale work.

**Status:** accepted
