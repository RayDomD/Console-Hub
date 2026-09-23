# The question fan holds for a human because its criteria cannot be tested

A question fan pauses after the criteria turn and before the workers. The criteria are on screen, nothing is running, and `Run workers` releases them. Fusion-harness solves the same problem mechanically with a RED baseline run, which is unavailable here because a question fan's criteria are prose. The hold is a phase-1 measure and a build fan must not inherit it.

**Status:** accepted

## Context

A question fan's run sequence is criteria turn → N workers in parallel → architect comparison. The criteria turn costs one cheap agent; the workers cost four expensive ones. Until now `handleCriteriaTerminal` emitted `launch_workers` the instant the criteria slot completed, so a single `Enter` committed the whole run.

[ADR 0013](0013-acceptance-is-fixed-before-the-answers.md) fixes acceptance before the answers, and the decided plate mockup argued from it that no gate was needed: *"Criteria are written by the architect before any worker starts, tool-less, so the ordering guarantee holds without a gate."* That argument is correct and answers a different question. It defends against **criteria bent to fit an answer**. It says nothing about **criteria that are simply bad**, which cost four worker turns to discover.

## Why fusion-harness's answer is unavailable

fusion-harness faces the identical problem in `/fh-auto-validate` and also has no human checkpoint. Its validator writes an executable `uv` acceptance gate before any building, and **a baseline run proves the gate starts RED**. A vacuous gate passes at baseline, and passing at baseline is the failure signal. The rubric checks itself, in seconds, with nobody reading it.

Cockpit already adopted that wholesale for phase 2 — plan step 10 is a near-transcription, down to the one free gate repair on the third failure and the halt at five.

It does not transfer to phase 1, because the two fan kinds have different criteria and only one is executable:

| | Build fan | Question fan |
|---|---|---|
| Criteria are | an executable gate | prose |
| Vacuous criteria caught by | the RED baseline run | reading them |
| Cost of discovering them late | one round | four worker turns |

*"Names the failure mode that makes the other option wrong"* cannot be run. *"Gives a thoughtful answer"* is invisible to every automated check available. The human read is the only check on offer, so it is the one we take.

## Considered Options

- **No gate**, as the mockup argued. Rejected: it answers the tampering worry, not the spend worry.
- **Hand-editable criteria** — the user rewrites the draft before releasing. Rejected. Editing a draft you can see makes the rubric half-authored by the reader, a thinner version of what 0013 exists to prevent. `Redo criteria` — which is `retry` on the criteria slot, already implemented — provides the same escape without it. Note that criteria the user writes **before** any turn runs are not this case and are permitted; see Consequences.
- **Timed auto-release** after the criteria panel has been visible a beat. Rejected: the one time attention wanders is the time four workers run against bad criteria, which is exactly the failure being prevented.

## Consequences

- **The machine gains one lifecycle state and one verb.** A held state between `criteria` and `workers`, and `release` beside `enter` / `retry` / `stop`. `Redo criteria` needs nothing new.
- **The hold is phase-1 only.** When build fans arrive, the RED baseline supersedes it and a build fan must not stop for a human — its rubric is testable, so a human read adds latency and no safety. A build fan that holds is a bug.
- **Criteria may be authored three ways**: typed by the user before the run, drafted by the criteria slot, or skipped entirely. All three satisfy 0013, because all three fix the criteria before any answer exists. A fan that skipped criteria says so in the document it produces, so a reader knows the comparison ran without a rubric.
- **The architect never writes the criteria it grades against.** The criteria slot is a distinct role for this reason. The mockup previously credited the architect; that was wrong and is corrected.
- **`validateConfig` now permits zero or one criteria slot** and rejects two. Zero is legitimate under the skip path. It previously checked neither, while `enter` asserted a guarantee that did not exist.
