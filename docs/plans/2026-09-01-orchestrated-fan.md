---
title: The orchestrated fan
date: 2026-09-01
status: Done
summary: A third fan kind - the user directs an orchestrator, it delegates to the slots, then it collects their findings. Unscored.
spec:
---

## Goal

A run shaped `prompt -> orchestrator -> fan of agents -> orchestrator -> synthesis`, where the user
tells the orchestrator what to delegate, every delegated agent's output stays watchable while it
runs, and the orchestrator's own turns are watchable in a terminal view of their own.

This is a third fan kind alongside the question fan and the build fan, chosen before a run starts.
It is deliberately **unscored**: no acceptance criteria, no comparison, no ranking. The output is the
orchestrator's synthesis of what its agents found.

## Approach

**The orchestrator is two stateless runs, not one resumed session.** `runner.ts:191` captures a
`sessionId` and never feeds it back, and [ADR 0016](../adr/0016-collaboration-is-a-skill-until-sessions-resume.md)
defers session resumption to phase 2. So:

- **Turn 1, delegating.** Input: the question, plus the user's delegation instruction. Output: one
  task per slot.
- **The fan.** Each slot runs its assigned task. Unchanged from today except that the slots no longer
  all receive the same text.
- **Turn 2, collecting.** Input: the question, the delegation it produced, and every slot's answer.
  Output: the synthesis.

The cost of statelessness is that turn 2 re-reads turn 1's delegation as text rather than remembering
it. Accepted. When session resumption lands, the two turns collapse into one session and nothing
above this layer changes.

**The user directs the delegation.** The orchestrator does not invent the split unprompted; it is
told what to delegate and turns that into per-slot tasks. The plate needs a field for that
instruction, sitting where the criteria box sits in a question fan.

**Unscored, so ADR 0013 does not bind.** [ADR 0013](../adr/0013-acceptance-is-fixed-before-the-answers.md)
governs runs that score entries against each other. An orchestrated run produces no ranking, so there
is nothing for a grader to bias. The mode must say so on the plate in its own words, the way a
skipped-criteria question fan already does, so an unscored synthesis is never mistaken for a scored
comparison.

## Steps

1. **Token display.** Independent of the rest, and wrong today. `model.ts:312` sums
   `inputTokens + outputTokens`; codex reports its whole prompt in `input_tokens` while claude reports
   the equivalent bulk in `cache_read_input_tokens`, which is not summed. Make output tokens the
   headline and show the input split, so the two vendors are comparable.
2. **ADR: the orchestrated fan.** Supersedes [ADR 0017](../adr/0017-a-fan-slot-is-an-answerer.md)'s
   verbatim guarantee *for this mode only*. A question fan stays verbatim with no pre-digest; an
   orchestrated fan is digested by definition, and the plate states which one ran.
3. **Machine.** Two lifecycle phases around the existing worker phase: `delegating` before it,
   `collecting` after it. Per [ADR 0012](../adr/0012-two-kinds-of-fan.md) the kind is fixed before
   the run and a live fan never converts.
4. **Orchestrator terminal view.** The architect panel gets a stream surface. The worker cards
   already stream; this is the same surface in the panel that has never had one.
5. **Plate.** Mode chosen before the run, the delegation instruction field, and the produced
   delegation shown read-only once turn 1 completes.

## Risks

- **R1 - The delegation is a silent rewrite.** The whole point of the verbatim rule was that a
  reworded question produces answers to a question nobody asked. Mitigation: the delegation is shown
  in full, per slot, before the workers spend, reusing the existing hold gate from
  [ADR 0015](../adr/0015-the-question-fan-holds-for-a-human.md).
- **R2 - Two stateless turns drift.** Turn 2 may synthesise against a reading of the delegation that
  turn 1 did not intend. Mitigation: turn 2 receives turn 1's output verbatim rather than a summary.
- **R3 - Mode confusion.** An unscored synthesis read as a scored comparison is worse than no output.
  Mitigation: step 2's plate wording, and no ranking vocabulary anywhere in the orchestrated path.
- **R4 - Scope.** This touches the machine, the harness invocation and the plate at once. Steps 1
  and 2 are separable and land first.

## Checks to run

- `npm run typecheck`
- `npm test`
- `npm run build`
- A live orchestrated run in the built app, watched: delegation visible before the workers spend,
  every slot's output watchable, the orchestrator's own two turns visible in its terminal view.

## Changelog

### 2026-09-01
- Plan created.
- Steps 1 to 5 built. Deviation: the plan named two new lifecycle phases,
  `delegating` and `collecting`. Only `delegating` was added. The collecting turn
  is the existing `architect` phase with a different prompt, chosen by the fan's
  kind, because the two turns are the same process on the same slot and a second
  phase name would have been a synonym rather than a state.
- Awaiting the live run in the built app, which is the only check left.

### 2026-09-01 (verification)
- Live orchestrated run driven against the built app (Synthesize recipe, claude+codex
  workers, claude orchestrator): the delegation held and was shown in full, per slot,
  before either worker spent; both workers streamed to completion; the orchestrator's
  second turn (synthesis) ran and completed visibly in its panel. Reached `Done` in ~156s.
- `npm run typecheck`, `npm test` (514 passed, 1 skipped), `npm run build` all clean.
- The verification run wrote to `docs/comparisons/fan-run-1-comparison.md`, the app's
  fixed output path for a real tracked file; reverted after the check. All other
  verification artifacts (script, screenshots) were scratch and discarded.
- Plan complete.
