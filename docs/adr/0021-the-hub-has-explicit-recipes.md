# The Hub has explicit recipes

The Console Hub begins each run with an explicit Recipe: Explore, Synthesize, Debate, Coordinate, Validate, Direct, or Console. No Recipe is preselected. This supersedes [ADR 0020](0020-the-fan-is-orchestrated.md)'s single orchestrated flow because the carried-over Fusion Harness behaviors have materially different permissions, sequencing, and guarantees; asking one orchestrator to choose invisibly would conceal those differences until after time or quota had been spent.

Every Recipe draws from one persistent Stack of one to five slots. The Stack survives Recipe changes so the same agents can be compared and reused without rebuilding the lineup; unlike Fusion Harness, Cockpit permits a one-slot Stack for work that needs only one agent.

A one-slot Stack may run Direct or Console only. Explore, Synthesize, Debate, Coordinate, and Validate require at least two slots and remain visibly unavailable until another is added. Cockpit does not degrade a multi-agent Recipe into single-agent behavior: one response is not a synthesis, and an agent cannot independently validate its own work.

A one-slot Stack contains one Primary. A larger Stack contains one Primary, one distinct Orchestrator, and up to three Contributors. Primary is the default hands-on slot; Orchestrator plans, synthesizes, coordinates, or validates; Contributors add independent work. Explore and Debate temporarily treat all participating slots as peers, and Direct may target any slot even though Primary is its default.

**Status:** accepted

The provisional Hub layout is preserved in [the Console Hub Explorer preview](../mockups/2026-09-01-console-hub-explorer.html). It minimizes Recipes into an activity rail and gives the selected Workspace a VS Code-style file explorer; visual polish remains deliberately open for a later Impeccable pass.
