# config

Reads `console-hub.config.json` from Electron's `userData` directory, seeding it from
shipped defaults on first run, normalizing legacy single-executor entries into
one canonical skill with Claude and Codex defaults, and hands out the values
every other module needs.

## Public interface

| Export | In | Out |
|---|---|---|
| `loadConfig()` | — | `ConsoleHubConfig` (cached after first read) |
| `reloadConfig()` | — | `ConsoleHubConfig`, re-read from disk |
| `configPath()` | — | absolute path of the config file |
| `skillEntries()` | — | `SkillEntry[]` — the button registry |
| `skillById(id)` | skill id | `SkillEntry \| undefined` |
| `resolveSkill(name)` | safe skill name | instructions and source directory from the first matching configured `skillRoots` entry |
| `runsDir()` | — | absolute path of the runs directory, created on demand |
| `groundParams()` | — | `GroundParams` — layer 0's eighteen ground values |
| `saveGround(patch)` | a partial `GroundParams` | the merged `GroundParams`; the disk write is coalesced |
| `flushGround()` | — | writes any pending ground edit immediately |
| `corpusRoots()` | — | configured read-only index roots |
| `corpusEfforts()` | — | real efforts shown on cage vertices |
| `corpusParams()` | — | the corpus volume's seven tuned values |
| `saveCorpus(patch)` | partial corpus values | merged persisted corpus values |
| `flushCorpus()` | — | writes any pending corpus edit immediately |
| `DEFAULT_CONFIG`, `EXAMPLE_ENTRY` | — | the shipped defaults and a documented example entry |
| `conversationPath(key?)` | a key, default `'fan'` | absolute path of that key's transcript file — `'fan'` keeps the original unkeyed filename |
| `loadConversation(key?)` | a key, default `'fan'` | that key's persisted transcript, or `undefined` |
| `saveConversation(file, key?)` | a transcript, a key (default `'fan'`) | writes it through immediately, keyed so a second `OrchestratorConversation` (ADR 0050's Console Orchestrator) never clobbers the Fan's |

## What it does NOT handle

- **Validation or schema.** A malformed file throws; the caller surfaces it. Console Hub
  plan step 2 adds real validation.
- **Watching for changes.** Edits to the file are picked up on the next `reloadConfig()`
  or app start, not live.
- **Writing user edits back, except the ground.** `saveGround` is the one writer, and
  it exists because the Tune panel is a settings surface rather than scaffolding: its
  values have to survive a restart, and putting them anywhere but `console-hub.config.json`
  would mean a stored setting could silently outrank the file the user is reading.
  Nothing else writes; the rest of the file belongs to the user.
- **Renderer access.** The renderer never reads config directly — it goes through the
  preload seam.

Provider executables live here as `claudeBin` and `codexBin`. Mission capability lookup uses the
ordered `skillRoots` configuration, seeded with the user's shared, Codex, and Claude skill folders.
On Windows the
Codex default resolves the native executable inside the standard global npm
package because the public `codex.cmd` shim would require a shell.

## Dependencies

`electron` (`app.getPath`), `node:fs`, `node:path`, `node:os`, and `shared/ground`
for the ground's shape and shipped values. Nothing else.
