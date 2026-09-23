# turn-signal

Tier-2 turn reporting (ADR 0051, `docs/tickets.md`): a console running `claude` or `codex`
interactively can report its own turn finishing back to Console Hub, in real time, without Console Hub
inferring it from output.

## Public interface

- `turnSignalInitCommandFor(vendor, shellBin, consoleId)` — the shell command that scopes `claude`
  or `codex` for one console: typing the bare vendor name inside a console that ran (or was typed)
  this command carries the extra flag and reports completion, without touching the user's own shell
  config. Starts the local listener on first call; safe to call repeatedly, every call after the
  first reuses the same port.
- `checkClaudeSettingsFlag()` / `checkCodexConfigFlag()` — `Promise<{ ok, detail }>`, read against
  the installed CLI's own `--help`, not assumed from documentation. Call before depending on the
  mechanism; a `false` `ok` means the flag this whole module is built on has moved.
- `stopTurnSignalServer()` — closes the local listener. Call on quit, alongside `closeAll()`.
- `shellKindOf`, `ShellKind`, `TurnSignalVendor` — re-exported for callers building their own scoped
  command (a bare `initCommand` on `ConsoleSpec`, or typing the same string into an already-open
  console — both run the identical generated text).

## How the signal actually gets back here

A shell function invoked by the console (something running as `node <notifier-script> ...`, itself
a separate OS process) cannot reach Electron's `ipcMain` directly, so it makes a loopback HTTP POST
to a listener this module starts on first use. The listener calls `consoles.reportTurnComplete`,
which emits the existing `turn-complete` `ConsoleEvent` - the same stream `data` and `exited`
already flow through.

## What it does NOT handle

- **What a caller does with the signal.** Sequencing a dependent terminal's task on it (ADR 0051) is
  a later ticket; nothing here consumes `turn-complete` itself.
- **Codex's title-generation sub-turn is filtered, not exposed.** Codex's `notify` fires once per
  sub-turn, including an internal "generate a task title" turn - verified live 2026-09-04 against
  codex-cli 0.151.0. The codex notifier script recognizes and drops it; only a real
  `agent-turn-complete` reaches this module. See `_internal/notifier.ts`.
- **agy, or any vendor without an equivalent flag.** ADR 0051's cooperative sentinel path for
  agy/bare-shell consoles is a different mechanism, built in a later ticket.
- **Packaging.** The notifier scripts are written to a temp directory at runtime rather than shipped
  as a resource; this is correct in dev and untested under `electron-builder`.

## Dependencies

`../consoles` (`shellKindOf`, `reportTurnComplete`) and Node's `http`/`child_process` core modules
only - no external package.
