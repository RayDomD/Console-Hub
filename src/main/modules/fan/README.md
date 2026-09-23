# fan

A pure, testable fan lifecycle state machine in the main process.

Owns the run id, the slot registry, and the run sequence — the orchestrator's delegation turn, a
held human checkpoint, N workers in parallel on their delegated tasks, then the orchestrator's
synthesis turn — plus terminal slot faults, partial synthesis, retry, Stop, close, shutdown, and
crash restoration. There is one kind of run (ADR 0020): no mode, no criteria, no scoring.

## Public interface

| Export | In | Out |
|---|---|---|
| `enter(config, state?, options?)` | `FanConfig`, optional prior state, optional [`EnterOptions`](#enteroptions) | `FanTransition` — launches the orchestrator's delegation turn; latches if a run is already live or held |
| `step(event, state)` | `SlotEvent`, current state | `FanTransition` — routes to the delegation, worker or synthesis handler, the orchestrator's two turns told apart by lifecycle; silently drops events from a stale run id, a stale slot attempt, or a closed run |
| `release(state)` | current held state | `FanTransition` — launches every worker on the task written for it; no-ops outside `held` |
| `retry(state, slotId)` | current state, slot to retry | `FanTransition` — re-launches a faulted slot; while delegating or held, only the orchestrator may retry, which redoes the split; no-ops on a completed worker, on a slot already running, and in a closed run (`stopped`, `done`, `interrupted`) |
| `stop(state)` | current state | `FanTransition` — kills every in-flight slot; no synthesis ever follows |
| `shutdown(state)` | current state | `FanTransition` — same teardown as stop, for the application quit path |
| `restoreInterrupted(config, runId, savedSlots)` | config, stale run id, saved slot statuses | `FanTransition` — opens as `INTERRUPTED`; never resumes; Enter afterward starts a new run |
| `onEvent(listener)` | listener | unsubscribe function — emits `FanTransition` on every state change; same shape as `skill-runner`'s `onRunEvent` |
| `emitTransition(transition)` | `FanTransition` | broadcasts to all `onEvent` subscribers |

Types re-exported from `src/shared/fan.ts`: `FanConfig`, `FanState`, `FanTransition`, `FanCommand`, `SlotEvent`, `SlotScope`, and all constituent subtypes.

### Lifecycle

| Member | Meaning |
|---|---|
| `idle` | No run yet |
| `delegating` | The orchestrator's delegation turn is in flight or faulted and retryable |
| `held` | The split is written, nothing is running, and `release` may start the workers |
| `workers` | Worker slots are running their delegated tasks |
| `synthesis` | The orchestrator is synthesising what its agents found |
| `done` | The synthesis completed |
| `unscored` | Fewer than two workers produced a valid answer |
| `stopped` | Stop closed the run with no resume |
| `interrupted` | Crash restoration exposed a stale run with no resume |

### FanConfig fields

| Field | Type | Required | Description |
|---|---|---|---|
| `slots` | `SlotConfig[]` | yes | Two to five workers, and exactly one orchestrator |
| `question` | `string` | yes | The raw question. It reaches the orchestrator verbatim; each worker receives the task written for it |
| `delegation` | `string` | no | An optional steer on how to split the work. The orchestrator decides the split either way |
| `workspace` | `string` | no | The folder every slot answers from, fixed at Enter. A fan carries a workspace because it belongs to the whole run, not to any one slot. Absent is a real, represented state, not an unset field. |

### SlotConfig fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | yes | Stable, unique within the fan |
| `role` | `SlotRole` | yes | `worker` or `orchestrator` |
| `vendor` | `FanVendor` | yes | Which CLI vendor runs this slot |
| `model` | `string` | no | Model name the vendor CLI should use; wins over the defaults argument |
| `effort` | `string` | no | Effort level passed to the vendor CLI; wins over the defaults argument |
| `scope` | `SlotScope` | no | Declared but computed by the machine from role — callers may omit it |

### EnterOptions

Passed as the optional third argument to `enter()`. Neither field is required. Supplying no options preserves today's behaviour exactly.

| Field | Type | Description |
|---|---|---|
| `defaults` | `Record<string, { model?, effort? }>` | Map from vendor to the default model and effort. Applied to any slot that did not name its own. A slot's own values always win. |
| `acceptableModels` | `Record<string, string[]>` | Map from vendor to acceptable model names. When absent for a vendor, no model on that vendor's slots is rejected — absence of a list is not evidence a model is wrong. |

Defaults are merged into `state.config.slots` at `enter` time, so every subsequent launch command (workers, synthesis) reads resolved values from state directly with no extra argument.

## What it does NOT handle

- **Spawning anything.** The machine emits `launch_delegation`, `launch_workers`, and
  `launch_synthesis` commands; the caller is responsible for creating the process. This
  module never imports `node:child_process`. Every one of the three carries the fan's
  workspace (absent when the fan has none), so the delegation, every worker and the synthesis
  all answer with the same access.
- **Killing processes.** The machine emits `kill_slot` commands; the caller holds the
  process handles and performs the kill (including the process tree on Windows).
- **Writing the synthesis document.** The machine emits `write_synthesis_document` only
  once, at the exact moment a valid completed synthesis stream arrives. The caller
  performs an atomic write so a failure cannot leave a partial file at the promised path.
  (Plan step 4.)
- **IPC, preload and renderer.** This module does not wire itself into the app.
  `src/main/index.ts` is the downstream consumer that bridges events across the preload
  seam.
- **The adapter from harness events to slot events.** The harness event shape and the
  `SlotEvent` shape are parallel by design so the adapter is a straight mapping. It is
  deliberately deferred to the next slice and must not be written here.
- **Build fans, worktrees, the acceptance gate, synthesis, rounds.** Phase 2.
- **Slot configuration validation UI, presets, `Promote to build`.** Plan steps 7, 8.
- **Timers or any time-based behaviour.** The machine is a pure function of state plus
  event. Time-based behaviour, if truly needed, lives in the caller and arrives as an event.
- **Reading config or disk.** This module never imports the `config` module and never
  reads `console-hub.config.json`. Defaults are supplied by the caller as an argument so the
  machine remains a pure function of state plus event, with no I/O inside a state transition.
- **Knowing what flags a vendor CLI accepts.** The acceptable-model list for each vendor
  is passed in by the caller. This module has no knowledge of individual vendor CLIs, their
  flag names, or their supported model rosters.

## Dependencies

`node:events` (for the `onEvent` subscription emitter) and `src/shared/fan.ts`.
No child process, no filesystem, no config module.

## Attempts, and why events carry one

Every launch of a slot increments that slot's attempt number, which the command
carries and the caller must echo back on every event from the process it starts.
`step` discards an event whose attempt is not the slot's current one.

This exists because a comparison can be superseded. When a retried worker
recovers, the machine kills the in-flight synthesis and launches a replacement.
A kill is not instantaneous, so an event from the killed process can still
arrive with a matching run id and slot id. Without the attempt it would complete
the replacement's launch, writing the stale partial comparison and marking the
run done. The run id separates runs; the attempt separates launches within a run.
