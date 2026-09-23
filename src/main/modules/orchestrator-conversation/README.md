# Orchestrator conversation

## What it does

Owns the Orchestrator's transcript: the planning conversation that frames a Fan task, may be asked
about a run while its workers are live, and receives the run's synthesis back into the same place
(ADR 0049).

One user message starts one read-only harnessed turn. Only one reply may be live, so a second
message is refused rather than queued. Vendor, model and effort lock after the first message,
because changing them would be a different agent session wearing this transcript. A faulted turn
keeps whatever text arrived and stays retryable; retry starts a new session from the stored
transcript rather than resuming a process that is gone.

The transcript is persisted after every change and restored on the next launch as a visibly new
session — vendor session resumption is not proven, so each turn is a fresh session handed its own
history as context.

Proposing a delegation copies the transcript as it stands into an immutable run record. Later
messages append to the live conversation and cannot alter what a released run was proposed from.

## Public interface

- `OrchestratorConversation` — `current`, `onChange`, `configure`, `send`, `retry`,
  `newConversation`, `noteDelegation`, `noteSynthesis`, `proposedTask`, `shutdown`.
- `elapsedLabel` — the `2m 18s` reading a status snapshot shows.
- Types: `ConversationHarnessPort`, `ConversationOptions`, `CapturedSnapshot`, `DelegationNote`,
  `SynthesisNote`, `ProposedTask`. The transcript shapes themselves are in
  `src/shared/orchestrator-conversation.ts`, because the renderer reads them too.

## What it does NOT handle

It does not know the Fan exists. It never launches, releases, retries or stops a worker, and it
cannot edit a delegation that was accepted — a status snapshot is a photograph passed in by the
caller, never a control channel. Main bridges the two lifecycles.

**Confirmed reusable as-is for a second conversation** (ADR 0050's Console Orchestrator): nothing in
this class's turn/hold/streaming machinery names a Fan slot — `DelegationAssignment.slotId` is a
plain string a caller fills in, not validated here. The one thing that was *not* already safe to
reuse was persistence: `load`/`save` wrote through one fixed file, so a second instance would have
clobbered the first's transcript. `../config`'s `loadConversation`/`saveConversation` are now keyed
(default key `'fan'`, unchanged filename) for exactly this - a caller standing up a second
`OrchestratorConversation` passes a different key through its own `load`/`save` closures.

It performs no document writes, holds no filesystem path, and never exposes an executable, a command
line or a working directory across the IPC seam.

## Dependencies

`src/shared/orchestrator-conversation.ts` and `src/shared/harness.ts` for types. The harness itself
arrives through `ConversationHarnessPort`, and persistence through `load`/`save`, so nothing here
spawns a process or touches disk in a test.
