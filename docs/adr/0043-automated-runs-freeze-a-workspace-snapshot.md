# Automated runs freeze a Workspace snapshot

At launch, every automated Recipe freezes a Run Snapshot of the Workspace state, including selected uncommitted and untracked work. Every participating slot reads that identical state, and every writing worktree branches from it, so edits made later in the user's checkout cannot leak into only some agents or silently change the base of a result.

The Run Record stores the starting revision and content hashes needed to identify the snapshot. Adoption detects destination changes made after launch and requires review or rebase. Interactive Consoles remain attached to the live selected checkout and do not use Run Snapshots.

**Status:** accepted
