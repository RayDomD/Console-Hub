# Automated runs have durable Run Records

Every automated Recipe writes a durable Run Record to Cockpit's own storage, never the Vault or project Workspace. It captures the Recipe, ask, Stack snapshot, Workspace, effective instructions, timestamps, slot events, complete outputs, telemetry, terminal outcomes, and all Recipe-specific evidence such as proposals, debate rounds, dependency graphs, gate versions and results, branch identities, synthesis, and Context Sync acknowledgements.

The Hub can reopen a completed run as it appeared. Run Records are never committed automatically, never supplied to another run unless explicitly selected, and never deleted automatically; Cockpit shows their disk use and lets the user delete selected records. Interactive Console contents are excluded and remain attached only to the live Console.

**Status:** accepted
