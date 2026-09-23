# Orchestrator terminal

## What it does

Renders the Orchestrator conversation as the Hub's single planning surface, following
`docs/mockups/2026-09-02-orchestrator-terminal.html`: a vendor-rimmed head with the frozen
identity and a status glyph run, a bounded scrolling transcript, and one prompt-line composer.

It replaced three overlapping places to describe the same task — the plate's Ask box, the
Delegation panel's textarea, and the read-only Orchestrator stream.

The transcript carries five kinds of entry: a user message, an Orchestrator reply (streaming,
landed, or failed with its partial text kept), a structured accepted delegation, a point-in-time
run-status snapshot, and the synthesis returned from the run. Colour never carries state — every
status is a glyph run plus a word.

The composer is disabled while a reply is live, because only one may be. Enter sends,
Shift+Enter breaks a line. **Propose delegation** is offered only once a reply has landed and no
run is in flight; it hands main the live Stack, and main supplies the task from the conversation.

## Public interface

- `OrchestratorTerminal` — takes the live Stack and the current fan lifecycle, and renders the
  conversation. It reads and writes only through `window.consoleHub.conversation`.

## What it does NOT handle

It is terminal-styled, not a terminal: no xterm, no shell, no command line, no process input. It
never launches, releases, retries or stops a worker — the worker cards below it own that, and the
Fan owns the run. A status snapshot is read-only.

It does not edit the Stack. Slot vendor, model and effort are edited on the worker cards; the
Orchestrator's own settings come from the dedicated slot and lock after the first message.

## Dependencies

`window.consoleHub.conversation` for every read and write, and the shapes in
`src/shared/orchestrator-conversation.ts` and `src/shared/fan.ts`. It renders inside
`question-fan-plate`, which supplies the Stack and the lifecycle.
