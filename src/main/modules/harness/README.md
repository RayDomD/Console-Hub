# harness

Spawns Claude Code or Codex headlessly in read-only mode, incrementally parses
the vendor's structured JSON stream, and reports one vendor-neutral lifecycle.
Completion comes from the vendor's turn-completion event. Process exit only
flushes a trailing partial line and is a fault when no valid boundary arrived.

Neither agent is embedded. Each run authenticates through the selected CLI's
local profile. No token, API key, or gateway credential lives in Console Hub.

## Public interface

| Export | In | Out |
|---|---|---|
| `startHarness(options)` | `{ vendor, prompt, cwd?, scope?, model?, effort? }` | initial `running` `HarnessEvent`; starts one read-only structured-stream process |
| `cancelHarness(runId)` | run id | `true` when an active run was cancelled and its process tree was killed |
| `cancelAll()` | — | kills every active process tree; call on quit |
| `onEvent(fn)` | listener | unsubscribe function; emits `running → completed \| faulted \| cancelled` |
| `HarnessEvent`, `HarnessScope`, and related types | — | shared vendor-neutral run, event, usage, and fault contracts |

When `cwd` is absent, the process launches from an empty disposable directory
that is removed after exit, so it cannot inherit Console Hub's project directory.

## Phase 1 scopes

`NONE` and `DOCS` both launch the vendor process read-only. A `DOCS` run returns
document text through the structured stream, then Console Hub writes that text to
the target file. The agent therefore needs no write tools, and Console Hub does not
have to verify which paths the agent might touch. Read-only enforcement is
vendor-specific: Claude's write-capable tools are removed by name and its
built-in tools are limited to read and web access; MCP servers, plugins, hooks,
and skills are disabled. Codex uses its read-only sandbox. Neither scope uses a
permission mode.

## What it does NOT handle

- **Interactive sessions.** A harnessed console has no place to answer a
  question. Use the pty console path for conversation.
- **Fan lifecycle or slot events.** This module reports individual runs. A later
  adapter maps those events into the fan lifecycle.
- **Session resume.** It captures the vendor session id but does not resume it.
- **`CODE` scope, worktrees, or presets.** Those belong to later plan steps.
- **Renderer transport.** It emits events; later IPC and preload work forwards
  them across the process boundary.
- **Quota interpretation from process exit.** A `quota` fault comes from the
  vendor's own error event and preserves its message. An exit code never implies
  quota exhaustion.

## Dependencies

`node:child_process`, `node:events`, and the `config` module. Requires the
selected CLI and its local login. Configure `claudeBin` or `codexBin` in
`console-hub.config.json` when the executable is not discoverable from the shipped
defaults.
