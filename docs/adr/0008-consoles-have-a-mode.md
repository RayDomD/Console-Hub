# A console has a mode: interactive or harnessed

A Cockpit console runs in one of two modes, chosen per console. **Interactive** is the default: a real pty the user types into and can answer. **Harnessed** launches the agent headless with a structured event stream (`claude -p --output-format stream-json`, `codex exec --json`) and renders that stream on the card instead of a terminal screen.

Fan targets are harnessed. The console the user sits at stays interactive.

**Status:** superseded by ADR 0028

## Context

Armed relations fire themselves ([ADR 0007](0007-armed-relations-fire-themselves.md)), so a merge must know when its sources have finished a turn. `disler/fusion-harness` detects this cleanly — `child-runner.ts` reads its children's JSON stream and treats `message_end` with an assistant role as the turn boundary, using process exit only to flush the buffer.

That signal is unavailable to a pty. A pty emits bytes intended for a screen; there is no turn boundary in them. Fusion-harness can read events precisely **because it gave up interactivity** — its children cannot be answered.

The console-hub plan had rejected headless children outright on the grounds that answerability is Cockpit's advantage over `codex exec`. That rejection was too broad: it protected the console the user is driving by also crippling the four they are not.

## Considered Options

- **Interactive always; a merge waits on result files appearing on disk.** Vendor-neutral and keeps every console answerable, but detects completion by artifact rather than by event: file-exists is not file-finished, and an agent that gives up without writing hangs the merge indefinitely. Retained as the fallback signal, not the primary one.
- **Harnessed always for anything in a relation.** Closest to fusion-harness. Rejected because it makes the canvas an agent grid that happens to contain terminals, and a stalled agent asking a clarifying question becomes a failure rather than a conversation.

## Consequences

- Turn completion is a real event, not a heuristic. The merge fires on `message_end`, not on a file appearing or a timer expiring.
- **The model bar becomes possible after all.** Tokens per second, cost, and context percentage are observable in a JSON stream and were only rejected because a pty hides them. They apply to harnessed cards only; an interactive card cannot show them and must not pretend to.
- **A harnessed console cannot ask a question.** It either has enough context in the brief or it fails. This raises the stakes on brief quality and makes `/codex-brief`'s self-contained contract a hard requirement rather than a convention.
- A harnessed console must be launched with its model and thinking level already chosen — there is no prompt to type them into. Something has to declare them.
- The card renderer now has two forms. The terminal canvas, pan/zoom, sizes, wires and roles are unchanged; only what is drawn inside the card differs.
- Read-only enforcement gets easier in harnessed mode: the launch line is fully controlled by Cockpit, so the vendor's read-only flag cannot be bypassed by the user launching the binary some other way.
