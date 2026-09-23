# Synthesize has one fresh writer

Synthesize first runs every Stack slot independently with read-only Workspace access. Cockpit shows every complete proposal and enters Held; only after human release does a fresh Orchestrator turn receive the raw proposals and the user's synthesis instruction. That turn alone may modify the Workspace, and its result names consensus, divergence, attribution, and discarded proposals.

The Orchestrator's synthesis is a fresh turn rather than a continuation of its proposal, so its first answer carries no hidden conversational advantage. This Recipe is a one-shot merge, not Coordinate's dependency graph or Validate's gate-driven correction loop.

The fresh Orchestrator receives an isolated worktree created from the run's starting revision and never edits the selected checkout directly. Project changes become a result branch that requires explicit adoption. A prose-only synthesis remains in the Run Record and does not present an empty branch. Context Sync carries both the exact synthesis and its branch identity when one exists.

**Status:** accepted
