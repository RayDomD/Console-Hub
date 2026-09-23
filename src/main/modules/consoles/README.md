# consoles

Opens shells in a pty and owns their lifetime. One registry, one source of truth
for what is running.

A console is a **shell, not an agent**. A real `powershell.exe` or Git Bash, and
you run whatever you want in it — including `claude` or `codex`, which this module
neither knows about nor treats specially. Console Hub opens the shell, so Console Hub knows
its folder; that is the entire reason consoles live here rather than in Windows
Terminal.

Backed by `node-pty` 1.1.0, whose N-API prebuilds load into Electron without an
`electron-rebuild` step. Verified by spawning a real ConPTY inside Electron before
this module was written.

## Public interface

| Export | In | Out |
|---|---|---|
| `openConsole(spec?)` | `{ shell?, cwd?, cols?, rows?, initCommand? }` — omitted fields fall back to config | `ConsoleInfo` (`id`, `shell`, `cwd`, `pid`, `startedAt`, `observedState?`) |
| `restartConsole(id, spec, prepare?)` | an existing id and a new spec | `ConsoleInfo` — kills that process tree and starts a fresh one **under the same id**, so a visible plate survives a folder change |
| `listConsoles()` | — | `ConsoleInfo[]` for every live console |
| `setConsoleAgent(id, agent)` | id and the agent a caller just launched in it | — records the agent and starts observing that console |
| `consoleContext(id)` | id | a bounded, ANSI-stripped excerpt of that console's recent output, or `undefined` |
| `writeConsole(id, data)` | keystrokes, passed to the pty verbatim | `false` if that console is gone |
| `resizeConsole(id, cols, rows)` | new dimensions | `false` if gone, or if either dimension is `< 1` |
| `closeConsole(id)` | id | `false` if gone; kills the **process tree**, not just the shell |
| `closeAll()` | — | closes every console; call on quit |
| `onConsoleEvent(fn)` | listener | unsubscribe function |
| `reportTurnComplete(id)` | id | emits a `turn-complete` event for that console; no-op if it's gone |

Events: `opened` once per console, `data` for every pty chunk, `exited` when the
shell ends or is closed, `turn-complete` when something calls `reportTurnComplete` for it,
`agent-launched` / `agent-exited` around a caller-declared agent, `task-failed` when a
console reports a failed Console Hub run, and `activity` when observed state changes.

**Observed state** is deliberately narrow. A console that a caller declared an agent for
starts `available`, becomes `running` when a submitted line is written to it, and returns to
`available` only on `reportTurnComplete`. Rendered output is never evidence — nothing here
reads the screen to guess whether a prompt is idle — and a plain shell has no `observedState`
at all rather than a fabricated one. A vendor with no turn-complete signal therefore stays
`running` until its caller reports otherwise, which is the conservative direction.

**`initCommand`** runs once, before the shell goes interactive, and nothing about it
is known here — this module stays exactly as vendor-blind as before. It exists so a
caller who *does* know what will run inside a console (the Console Recipe's
Orchestrator ticket, for one) can scope a temporary shell function to one console
without writing to the user's `$PROFILE` or `.bashrc`. On PowerShell it rides
`-NoExit -Command`; on a posix shell it writes one temp rcfile that replays the
normal login-profile chain first, since `--rcfile` replaces profile loading rather
than adding to it. See `_internal/shellInit.ts`.

**`reportTurnComplete`** exists for the same reason: this module can relay "something
finished a turn" without ever knowing what a turn is or which vendor said so. What
actually calls it — a Claude `Stop` hook or a Codex `notify` config, scoped in via
`initCommand` and phoning home over a local HTTP listener — lives outside this
module entirely. Verified live 2026-09-04 against claude 2.1.260 and codex-cli
0.151.0: both fire inside a genuine interactive pty (`-p`/print mode does **not**
fire Claude's `Stop` hook — only a real interactive session does), and codex's
`notify` fires once per *sub-turn*, including an internal task-title generation
turn nothing here should count as the user's turn ending.

Which shells exist is config (`shells`, `defaultShell` in `console-hub.config.json`),
not a literal here — the set of shells is a property of the machine.

## What it does NOT handle

- **What is running inside a console.** No process-tree labelling and no `claude` /
  `codex` detection. Observed state is not an exception: it is bookkeeping over what
  callers declare and write, never inspection of the process or its output.
- **Shell integration.** No prompt markers, so no live cwd and no per-command exit
  codes. `cwd` is where the console was *opened*, and goes stale the moment you
  `cd`. Plan step 2.
- **Rendering.** No terminal emulation; `data` is raw pty output and the renderer
  owns turning it into a screen.
- **Persistence.** Consoles do not survive a restart, and no layout is stored.
- **Wires, Loops, or the Hub surface.** Plan steps 4 and 7–10.
- **Scrollback.** Output is streamed and forgotten; a console opened late has no
  history. A late subscriber sees only what arrives after it subscribes.

## Dependencies

- `node-pty` — the pty itself.
- `../config` — shell definitions, the default shell, and the fallback cwd.
- `../../../shared/consoles` — the type contract shared with preload and renderer.
