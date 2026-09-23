# Console becomes an orchestrated terminal fan

**Design reference:** [Console fan mockup](../mockups/2026-09-04-console-fan.html)

The Console Recipe gains the Orchestrator-plus-worker-grid shape Synthesize already has, but the workers are real terminals rather than harnessed slot streams: a fixed, manually-added-and-dropped lineup of up to six interactive PTYs, independent of the Stack (no vendor, model, or effort binding — a terminal is still a shell, not an agent). The Orchestrator conversation drafts a delegation plan naming each terminal's launch command and task, holds for a reply of "go"/"yes" before typing anything in, and `./goal <text>` plans and releases in one turn without dropping the shown plan. On release, Cockpit types each terminal's task into its shell and submits it; what launches in each terminal (bare shell, `claude`, `codex`, `agy`) is decided by the Orchestrator as part of the plan, not preconfigured per card. A single terminal with no plan is this same surface with one card — the old bare Console view is replaced, not kept alongside it. Terminals persist across Recipe switches and only close when explicitly closed or Cockpit quits. A terminal-worker's task may itself be "invoke another Recipe"; that runs as a background sub-run with a compact status on the card rather than switching the Hub surface away from the grid.

This supersedes [ADR 0028](0028-console-means-interactive-pty.md)'s rule that Console has no automatic orchestration and no machine-readable completion. That rule protected a real distinction — Recipes get automation, Console stays a plain PTY — and this reverses it deliberately for Console specifically, after a `/grill-with-docs` session on 2026-09-04, rather than eroding it by accident. It does not extend to the other six Recipes; Console is not becoming a general terminal-command launcher for them.

Dependency sequencing between terminals and the completion signal that drives it are recorded separately in [ADR 0051](0051-terminal-dependencies-are-cockpit-sequenced.md).

**Status:** accepted
