# console-orchestrator

The Console Recipe's Orchestrator conversation (ADR 0050) - the terminal grid's planning surface,
matching `orchestrator-terminal`'s card language.

## Public interface

- `ConsoleOrchestrator` — takes one prop, `targets: Record<string, string>`, mapping each open
  terminal's label (`T1`) to its real console id. The caller (the Console Recipe's stage) owns the
  lineup and is the only place that mapping exists.
- Console delegation has a composer for a research or review request. Its saved Markdown plan is
  shown for review and released to the open worker terminals only through an explicit button.
- `/delegate <task>` in the Orchestrator terminal is a Console Hub command shared by Claude, Codex,
  and AGY. Invoking it authorizes the saved plan to release automatically to open workers.
- Mission is operated entirely in the terminal (D7). Its plan, progress, review, and adoption are
  read there; the Console delegation controls do not release a Mission.
- `missionCommand` consumes an exact `/mission` shortcut, or an unambiguous natural reply, before
  Enter reaches the agent CLI, and hands it to the real Console Hub lifecycle action. It is gated on the
  current Mission phase, so a reply the Mission cannot act on stays ordinary conversation and can
  never release or apply work.
- `orchestratorActivity` produces the one status line in the header. While a Mission is active it
  carries the newest Mission report — including a lane failure and the next action it proposes.

## What it does not handle

- **Which terminals exist, or opening/closing one.** `ConsoleLineup` (the `console-view` module)
  owns the grid; this component only reads the label→id map it is handed.
- **Typing into a terminal, or dependency sequencing.** Both happen in main, behind
  `window.consoleHub.consoleConversation.send`; this component only shows what came back.
- **Mission execution, review, and validation.** Main owns the whole lifecycle, including starting
  review itself once the last lane returns; this component only reports phase and relays a control.
- **Deciding what a natural reply means.** `missionCommand` maps only exact, unambiguous lines. Any
  interpretation beyond that belongs to the agent in the terminal, not to Console Hub.

## Dependencies

`window.consoleHub.consoleConversation` (the preload seam) and
`src/shared/orchestrator-conversation.ts` for types — the same shared contract the Fan's
Orchestrator terminal uses, since `DelegationAssignment` now carries an optional `launch` field for
exactly this surface.
