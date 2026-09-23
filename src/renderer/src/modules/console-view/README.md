# console-view

The Console Recipe's surface: a lineup of real shells in ptys, rendered by `xterm.js`. See
[ADR 0050](../../../../../docs/adr/0050-console-becomes-an-orchestrated-terminal-fan.md).

## Public interface

- `ConsoleLineup` — the whole surface. A grid of terminal cards, capped at
  [`CONSOLE_LINEUP_MAX`](_internal/lineup.ts) (6), with a ghost `+ add terminal` card below the cap
  and a per-card close control above one terminal. Meant to be mounted once, on first opening the
  Console Recipe, and hidden (not unmounted) on a Recipe switch thereafter — the caller owns that;
  this component neither knows nor cares whether it is currently visible.
- `ConsoleView` — one terminal card. A worker card carries the whole assignment in a single compact
  header (D9): `T1 · AGY`, the lane's task, and its state as a DESIGN.md glyph plus label. State is
  only what the caller supplies or `consoles` observed — a terminal with no observed state shows
  none rather than claiming it is available.

## What it does not handle

- **Delegation.** No Orchestrator, no plan, and no deciding what a lane says or when it runs. A
  worker card renders the assignment it is handed and stays a shell you type into yourself;
  `console-orchestrator` and main own the Mission itself.
- **Surviving a Hub-surface exit.** Leaving the Console Recipe for another Recipe preserves every
  terminal; leaving the Hub surface entirely (`hub-shell`'s `surface !== 'hub'` early return) still
  unmounts everything above this module, closing every open pty — unchanged from before this
  module existed.
- **Dependencies between terminals, and any completion signal.** See ADR 0051; not built here.
- **Deciding what is running inside a console.** Same as the `consoles` module it sits on: no
  process-tree labelling, and nothing here reads terminal pixels to guess whether a worker is busy.
  Observed state arrives as an `activity` event or not at all.

## Dependencies

`@xterm/xterm`, `@xterm/addon-fit`, and `window.consoleHub.consoles` (main's `consoles` module across
the preload seam).
