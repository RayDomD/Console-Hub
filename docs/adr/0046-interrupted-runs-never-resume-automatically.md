# Interrupted runs never resume automatically

Cockpit-owned agent processes and Consoles terminate when Cockpit exits or crashes, so nothing continues writing unsupervised. Run transitions are persisted incrementally; on restart, any unfinished run becomes Interrupted while its branches, worktrees, completed outputs, and partial diagnostics remain intact. Dead process owners release their Workspace leases during startup reconciliation.

Because Sessions end with the app, recovery offers inspection, retrying an incomplete slot from the original Run Snapshot in a fresh Session, rerunning the Recipe, or rejecting and cleaning up. An interrupted branch cannot be applied as a completed result until the Recipe's remaining guarantees and checks finish.

**Status:** accepted
