# Coordinate uses parallel worktrees

Coordinate carries over Fusion Harness's plan-and-delegate shape: every slot proposes read-only, the Orchestrator merges the proposals into a validated dependency graph, Cockpit shows that graph and enters Held, and ready tasks launch as soon as their dependencies clear. A slot may own several sequential tasks on one persistent session.

Cockpit deliberately does not carry over Fusion's shared-checkout, single-writer execution. Read tasks may share the source Workspace, but every writing slot receives its own branch and worktree, so independent writes can run concurrently. A fresh Orchestrator integrates the resulting branches in a separate synthesis worktree, and nothing lands in the user's working branch without explicit adoption. The same-path writer lease remains a backstop. This preserves [ADR 0009](0009-a-harnessed-console-gets-its-own-worktree.md), [ADR 0010](0010-a-merge-synthesises-into-its-own-branch.md), and [ADR 0011](0011-fan-consoles-persist-across-rounds.md).

**Status:** accepted
