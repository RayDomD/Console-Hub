# fan-runtime

Drives the pure question-fan state machine against real harnessed vendor
processes, and performs the effects the machine asks for.

The machine in `../fan` decides *what* must happen and emits commands. The
harness in `../harness` knows how to spawn a vendor CLI and normalize its stream.
Neither imports the other. This module is the only place that knows both, which
is what keeps the machine testable with no process and the harness reusable
outside a fan.

## Public interface

| Export | In | Out |
|---|---|---|
| `new FanRuntime(options)` | `{ harness, writeDocument? }` | a runtime bound to that harness |
| `runtime.start(config)` | `FanConfig` | `Promise<FanState>` — enters a run, or absorbs the call if the machine latches it |
| `runtime.retrySlot(slotId)` | slot id | `Promise<FanState \| undefined>` |
| `runtime.release()` | — | `Promise<FanState \| undefined>` — releases a held run and launches its workers |
| `runtime.stop()` | — | `Promise<FanState \| undefined>` — kills every live slot |
| `runtime.shutdown()` | — | `Promise<void>` — teardown for the app quit path; detaches from the harness |
| `runtime.current()` | — | `FanState \| undefined` |
| `runtime.onTransition(listener)` | listener | unsubscribe function; fires on every state change |
| `toSlotEvent`, `toSlotFault`, `toSlotUsage`, `toHarnessVendor` | harness shapes | fan shapes |
| `delegationPrompt(question, delegation, workerSlotIds)` | the question, the user's steer, the slots to task | prompt text stating the exact heading format the split is parsed with |
| `synthesisPrompt(question, delegationText, findings, absent)` | the question, turn one's own output, what each agent found, absent workers | prompt text asking for a synthesis and never a ranking, with a partial advisory when a slot reported nothing |
| `writeDocumentAtomically(path, content)` | path, content | `Promise<void>` — temp file plus rename |

`HarnessPort` and `DocumentWriter` are injected, so every path above is testable
without spawning a process or touching disk.

## Identity, which is the whole job

A harness run has its own id. A fan slot has a slot id and an attempt number.
This module holds the map between them.

That mapping is what makes supersession safe. When a recovered worker causes a
new synthesis, the machine kills the in-flight synthesis turn and launches a
replacement with a higher attempt. A kill is not instantaneous, so the killed
process can still emit a completion. The runtime tags that event with the
attempt its binding was created under, and the machine drops it. Without the
binding, the stale comparison would complete the run.

A `cancelled` harness event translates to nothing at all: cancellation is always
something the fan asked for, and the machine has already recorded the slot as
stopped. Feeding it back would be the machine reacting to its own command.

## What it does NOT handle

- **Deciding anything about the run.** Sequence, thresholds, faults, retry rules
  and the partial advisory all live in `../fan`. This module only executes.
- **Spawning or parsing.** That is `../harness`.
- **Scopes.** `NONE` read-only launching and `DOCS` enforcement are plan step 4.
  The runtime performs the synthesis write the machine asks for, but does not
  yet restrict what a slot process is allowed to touch.
- **Slot configuration and validation.** Plan step 5.
- **IPC and UI.** `src/main/index.ts` owns the channels; the plate is step 6.
- **Persistence.** Nothing is written across restarts, so crash restoration has
  no saved snapshot to restore from yet.

## Dependencies

`../fan`, `../harness`, `node:fs/promises`, `node:path`, `node:events`.
