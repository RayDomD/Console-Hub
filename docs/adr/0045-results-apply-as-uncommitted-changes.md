# Results apply as uncommitted changes

A result opens in review with its diff, evidence, source branches, and any destination changes since the Run Snapshot. Apply Result transfers the approved diff into a chosen checkout as uncommitted working changes; Cockpit never commits or pushes. The destination must be clean enough to apply safely, and conflicts require an explicit rebase or integration run rather than an automatic resolution.

Until Apply Result or Reject Result, the result branch, worktree, and any Coordinate source branches remain available. Either action may offer confirmed cleanup of those temporary branches and worktrees. Nothing is deleted merely because Cockpit closes or time passes, and the Run Record retains the final diff and evidence permanently regardless of adoption.

**Status:** accepted
