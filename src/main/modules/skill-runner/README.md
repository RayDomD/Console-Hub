# skill-runner

Spawns Claude Code or Codex headlessly, one child process per button press, and
reports the run's lifecycle back as events.

Neither agent is embedded. Each run is `claude -p "<prompt>"` or
`codex exec "<prompt>"` in its own process, authenticating from that CLI's local
profile, running to completion and exiting. No token or API key lives in Console Hub;
Codex runs use `--ephemeral` so they do not create resumable threads.

## Public interface

| Export | In | Out |
|---|---|---|
| `listSkills()` | — | `SkillEntry[]` from config — the button registry |
| `startRun(skillId, opts?)` | id, `{ provider?, model?, effort?, text? }` | the initial `running` `RunEvent`; the provider override applies only to this run |
| `cancelRun(runId)` | run id | `true` if a run was killed (process tree, not just the parent) |
| `cancelAll()` | — | kills every active run; call on quit |
| `onRunEvent(fn)` | listener | unsubscribe function. Emits `running → done \| failed \| blocked \| cancelled` |
| `buildArgs` / `buildInvocation` / `commandLine` / `permissionMode` | a `SkillEntry` | provider-specific executable, exact argv, printable form, and permission boundary |
| `logPath()` | — | absolute path of `runs.log` |

Side effects per run: one `runs.log` line at start and at settle, and one
`<stamp>-<skill>.md` output file in the runs directory.

## What it does NOT handle

- **Interactive sessions.** Headless has no window to answer in; a skill that asks
  questions burns its turns and comes back `blocked`. Use the pty path (Console Hub plan
  step 7) for conversation.
- **Streaming partial output.** Runs report start and settle, not tokens as they arrive.
  `--output-format stream-json` would be the upgrade.
- **Deciding what a button is.** That is `config`'s `skills[]` — see
  `docs/recipes/adding-a-skill-button.md`.
- **Talking to the renderer.** It emits events; `src/main/index.ts` forwards them
  across the preload seam.

## Dependencies

`node:child_process`, `node:events`, `node:fs`, `node:path`, and the `config` module.
Requires the selected CLI. Configure `claudeBin` or the native `codexBin` in
`console-hub.config.json` when it is not discoverable from the shipped defaults.
