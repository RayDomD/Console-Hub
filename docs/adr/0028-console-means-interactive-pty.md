# Console means an interactive PTY

A Console is always an interactive PTY controlled by the user. It has no structured turn detection, token accounting, automatic orchestration, or machine-readable completion. Direct, Explore, Synthesize, Debate, Coordinate, and Validate instead render structured slot streams, which Cockpit can observe and automate but the user cannot type into while a turn runs.

This supersedes [ADR 0008](0008-consoles-have-a-mode.md)'s interactive and harnessed Console modes. Console plates and Recipe-run plates may share the Hub surface, but sharing a surface does not give them the same runtime guarantees or vocabulary.

**Status:** superseded by [ADR 0050](0050-console-becomes-an-orchestrated-terminal-fan.md), which gives Console an Orchestrator, automatic delegation, and a machine-readable completion signal.
