# Stops and faults are explicit terminal outcomes

Every active slot exposes Stop Slot and every active Recipe exposes Stop Run. Either action kills the complete process tree, including spawned tools, while preserving worktrees, branches, completed output, and evidence. Escape remains Hub navigation and Console input; it never secretly stops an automated run.

Completed, stopped, process crash, quota exhaustion, malformed stream, timeout, and launch failure are distinct terminal outcomes. Partial output from a non-completed turn is diagnostic only and never counts as an answer, proposal, synthesis, or completed task. Cockpit performs no hidden retries beyond the bounded retries defined by Validate and Context Sync; a slot may be retried deliberately from its plate. A Recipe continues only while its own guarantee remains true, otherwise it stops and names what is missing.

**Status:** accepted
