# console-conversation

Console Hub's Console coordination module. It retains the original Console delegation conversation
from ADR 0050 and owns the newer Mission lifecycle from ADR 0053.

## Public interface

- `consoleConversation(options)` — the legacy Console Orchestrator conversation. `options` mirror
  `OrchestratorConversation`'s own, plus `load`/`save` taking an explicit key (the caller always
  passes `'console'` through; this module hard-codes that so a caller cannot accidentally wire it
  to the Fan's key and collide transcripts).
- `releaseConsoleDelegation(conversation, writeTerminal, openTargetIds)` — releases the
  conversation's currently-proposed plan: types every assignment's launch command (if any) then its
  task into its terminal, in that order, then records the delegation. Refuses — dispatching nothing
  — when there is no drafted plan, no terminal is open, or the plan could not be split one heading
  per open terminal. Unlike the Fan's `parseDelegation`, a degraded Console plan has **zero**
  assignments rather than a whole-text fallback: typing one unsplit task into every terminal at once
  is never what "delegate to T1" meant.
- `isReleaseReply(text)` / `parseGoalCommand(text)` — the two ways a message releases a plan (D4): an
  exact `go`/`yes` reply, or a message starting with `./goal ` which plans and releases in the same
  turn without skipping the shown plan.
- `TerminalAssignment` — `{ targetId, launch?, task }`, what one terminal was actually assigned.
- `TerminalOrchestrator` — translates terminal commands and phase-gated natural replies into
  Mission lifecycle actions, drafts only against available workers, and reports state changes.
- `MissionController` — coordinates draft, release, lane completion, review, retry, stop, apply,
  reject, and durable state transitions through injected terminal and workspace ports.
- `MissionTerminals` — freezes assigned worker configuration and bounded context, moves the assigned
  Console plates to isolated lane worktrees, launches automated workers through the controlled Pi
  runner, gives research lanes the configured read-only Vault location, passes selected dependency
  evidence to newly unblocked lanes, records final responses atomically, and restores the original
  terminal sessions.
- `MissionStore` / `MissionWorkspace` — persist Run Records and perform snapshot, worktree,
  integration, validation, adoption, and cleanup operations.
- `parseMissionDraft` / `MISSION_DRAFT_INSTRUCTIONS` — validate and describe the structured Mission
  plan contract. Existing workers keep their exact configured Vendor, model, and effort; every
  available agent-backed worker must be assigned once or named once as unused with a reason.
  A released worker also needs an explicit model; the controlled runner resolves Claude, Codex, and
  AGY to Anthropic, OpenAI, and Google provider-qualified Pi models respectively.

## What it does NOT handle

- **Waiting for a `./goal` reply to land before releasing.** `releaseConsoleDelegation` only ever
  releases what has already landed as a complete Orchestrator turn — sequencing "ask, wait for the
  reply, then release" is main's job (mirroring how `bridgeFanTransition` bridges the Fan, not this
  module's own concern), via `OrchestratorConversation.onChange`.
- **Legacy delegation completion evidence.** `releaseConsoleDelegation` still relies on its caller
  to report completion. Mission has its own evidence and sequencing path.
- **Which terminals exist, or typing keystrokes into one.** `openTargetIds` and `writeTerminal` are
  supplied by the caller; this module never touches `consoles` itself.
- **The Console Orchestrator's own vendor/model/effort defaults.** Supplied via `settings`, same as
  the Fan's.
- **Automatic recovery after a worker or combined-review failure.** Mission preserves evidence and
  reports the failure; retry or corrective work requires user direction.
- **Interactive controlled-runner sessions.** One-shot Mission lanes are supported. A plan requesting
  an interactive lane is refused before snapshotting until session continuation is wired end to end.

## Dependencies

The legacy path reuses `../orchestrator-conversation` and shared conversation types. Mission uses
the Console registry for visible plates, `../controlled-runner` for automated model execution, and
the filesystem/Git-backed `MissionWorkspace`; tests substitute those boundaries where isolation is
required.
