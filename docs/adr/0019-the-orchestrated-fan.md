# The orchestrated fan

A third fan kind. The user tells an orchestrator what to delegate, the orchestrator turns that into one task per slot, the slots run and stay watchable, and the orchestrator reads their findings back into a synthesis. It is unscored by construction.

**Status:** superseded by ADR 0020

## Context

The question fan sends one question verbatim to every slot and compares the answers against criteria fixed in advance. That shape answers "which of these models says the most useful thing about this one question". It does not answer "split this piece of work across several agents and tell me what they collectively found", which is a different job and the one being asked for.

The requested shape is `prompt -> orchestrator -> fan of agents -> orchestrator -> synthesis`, with every delegated agent's output visible while it runs and the orchestrator's own turns visible in a terminal view of their own.

## Decision

**This is a third kind, fixed before the run.** [ADR 0012](0012-two-kinds-of-fan.md) forbids converting a live fan between kinds, and that still holds: orchestrated is chosen before the first turn and a running fan never becomes one.

**The verbatim guarantee is scoped to the question fan.** [ADR 0017](0017-a-fan-slot-is-an-answerer.md) established that a slot is an answerer handed a question, and the plate states "verbatim to every worker · no rewrite · no architect pre-digest". An orchestrator that delegates is a pre-digest by definition, so that line cannot hold in both modes. It is not withdrawn - it is scoped. A question fan is still verbatim with no pre-digest. An orchestrated fan is digested, and the plate says which mode ran rather than leaving the reader to assume.

What ADR 0017 established about what a slot *is* survives unchanged in both modes: an answerer, launched with write tools removed rather than permissions withheld, with no working directory unless the fan names one.

**The delegation is shown before the workers spend.** The failure this invites is a reworded question producing careful answers to something nobody asked. [ADR 0015](0015-the-question-fan-holds-for-a-human.md)'s hold gate already exists for a cheap turn preceding expensive ones, and the delegation turn has exactly that shape. The run holds after the orchestrator's first turn, with the per-slot tasks readable in full, and the user releases the workers.

**Unscored.** No acceptance criteria, no comparison, no ranking. [ADR 0013](0013-acceptance-is-fixed-before-the-answers.md) governs runs that score entries against each other, so it does not bind here - there is no score for the orchestrator's authorship to bias. This is a deliberate narrowing rather than an oversight: an orchestrated run's value is coverage of a task that was split, and ranking agents against each other for work that was deliberately made different is meaningless.

**The orchestrator is two stateless runs, not one resumed session.** `runner.ts` captures a `sessionId` and never feeds it back, and [ADR 0016](0016-collaboration-is-a-skill-until-sessions-resume.md) defers session resumption to phase 2. Turn 1 receives the question and the user's delegation instruction. Turn 2 receives the question, turn 1's output verbatim, and every slot's answer. The orchestrator therefore re-reads its own delegation as text rather than remembering it.

## Consequences

- **An unscored synthesis must never read as a scored comparison.** The plate says so in its own words, the way a skipped-criteria question fan already does, and no ranking vocabulary appears anywhere in the orchestrated path. A synthesis mistaken for a ranking is worse than no output, because it carries the authority of a comparison that never ran.
- **Two stateless turns can drift.** Turn 2 may synthesise against a reading of the delegation that turn 1 did not intend. Turn 2 receives turn 1's output verbatim rather than a summary, which is the most that can be done without session resumption. When resumption lands the two turns collapse into one session and nothing above this layer changes.
- **The orchestrator both authors and reads.** Acceptable only because the run is unscored. If an orchestrated run ever acquires a score, the grader must be a slot that did not write the delegation, and this ADR needs revisiting before that happens.
- **The architect panel gains a stream surface.** The worker cards already stream; the panel that has never had one now needs it, because an orchestrator whose two turns are invisible cannot be trusted with a delegation the user did not read.
