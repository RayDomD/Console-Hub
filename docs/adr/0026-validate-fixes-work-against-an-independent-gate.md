# Validate fixes work against an independent gate

Validate activates exactly two slots: the Orchestrator is the Validator, and one selected slot, defaulting to Primary, is the Builder. The Validator writes an executable acceptance gate before implementation and may modify only that gate in Cockpit's run storage. A baseline run must fail; if it passes, the Recipe stops because the requested work is already complete or the gate proves nothing. Other Contributors remain inactive because multiple builders belong to Coordinate.

The Builder works in its own worktree on a persistent session. Each gate failure returns verbatim as its correction. On the third failure the Validator diagnoses the implementation against the gate and may repair a genuine gate defect once without consuming a Builder attempt, but may not weaken a legitimate check. The run stops green or after five failed attempts, preserves its evidence, and leaves any successful branch for explicit adoption rather than landing it automatically. This preserves the build-gate decision in [ADR 0013](0013-acceptance-is-fixed-before-the-answers.md).

**Status:** accepted
