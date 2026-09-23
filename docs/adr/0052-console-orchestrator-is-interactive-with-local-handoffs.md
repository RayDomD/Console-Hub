# Console Orchestrator uses an interactive terminal with local handoffs

The user needs native CLI slash commands and menus while composing prompts locally without an extra model turn. The Console Orchestrator therefore runs in a full-width interactive terminal with a separate local draft box. This replaces the Console chat-panel approach in ADR 0050, not the harnessed Orchestrator used by other Recipes.

Releasing a reviewed, saved delegation authorizes local worker monitoring, result collection, and automatic combination when every assignment has completed evidence. Cockpit supplies actual result contents to the Orchestrator rather than asking its restricted file tools to open worker paths or asking the user to paste files. Progress changes appear locally without model calls. This supersedes ADR 0051's prescribed handoff paths and output sentinels: Cockpit allocates result files, accepts atomic final files and vendor completion hooks, and never infers success from idle-looking terminal pixels.

Failed or missing results hold automatic combination and preserve completed evidence. The user can retry a failed assignment or explicitly request a partial answer. Handoffs wait while the Orchestrator is busy. Direct terminal input pauses them until the user confirms readiness, preventing input from being inserted into a native menu or unfinished prompt. Hooks and a per-response readiness file support automatic readiness after submitted draft prompts.

**Status:** accepted, confirmed in the grill-with-docs discussion on 2026-09-04.
