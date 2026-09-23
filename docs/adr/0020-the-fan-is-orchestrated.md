# The fan is orchestrated, and there is only one of it

There is no mode. Every run is `ask -> orchestrator -> hold -> workers -> orchestrator`. The criteria slot, the acceptance-criteria gate and the scored comparison are removed, and the architect role is retired into the orchestrator, which was already the same slot taking two turns.

**Status:** superseded by ADR 0021

**Supersedes:** [ADR 0013](0013-acceptance-is-fixed-before-the-answers.md) for the question fan, and the mode introduced by [ADR 0019](0019-the-orchestrated-fan.md).

## Context

[ADR 0019](0019-the-orchestrated-fan.md) added the orchestrated fan alongside the question fan and made the choice a picker on the plate. The first real use showed two things.

The picker is a trap. A run fired on the default left the user in the verbatim path while they were describing the orchestrated one, and nothing in the plate made the mismatch obvious until the answers came back shaped wrong. A control whose wrong setting is invisible until the spend is finished is not a choice, it is a hazard.

And the second mode had stopped earning its place. An orchestrator strong enough to split work across agents is strong enough to decide that a question needs no splitting. The verbatim path was a special case of the orchestrated one, kept as its own mode.

## Decision

**One flow.** `ask -> orchestrator -> hold -> workers -> orchestrator`. No picker, no kind, no conversion. [ADR 0012](0012-two-kinds-of-fan.md)'s prohibition on converting a live fan survives trivially: there is nothing to convert to.

**The hold stays, and is the point.** [ADR 0015](0015-the-question-fan-holds-for-a-human.md) is unchanged and now load-carrying in a way it was not before. The orchestrator rewrites the question into per-slot tasks, and a slot handed the wrong half answers something nobody asked. The run stops after the delegation, shows the split per slot, and spends nothing until a person releases it.

**No criteria, and no scored comparison.** The criteria slot, `criteriaText`, `skipCriteria` and the acceptance-criteria panel are removed. [ADR 0013](0013-acceptance-is-fixed-before-the-answers.md) exists to stop a fan rewarding persuasiveness when it ranks entries against each other. This fan does not rank: its agents are given deliberately different tasks, and ranking answers to different questions is meaningless. The problem 0013 solves cannot arise here, so its apparatus is removed rather than left switched off.

ADR 0013 is **not** withdrawn. Its reasoning still governs the build fan in phase 2, where an executable gate written before any work starts remains the right shape.

**The architect is retired into the orchestrator.** They were already one slot taking two turns; the two names described a sequence, not two agents. What survives is the orchestrator's second turn, which synthesises rather than scores, and Cockpit still performs every document write itself.

## Consequences

- **The plate loses its criteria surface and its mode picker.** What remains is the ask, the delegation and its hold, the worker cards, and the orchestrator's own stream across both its turns.
- **A run can no longer be scored.** Nothing produces a ranking or a marking scheme. If a scored comparison is wanted again it comes back as the build fan's executable gate, not as a model grading prose.
- **The orchestrator is a single point of failure.** It splits the work and it synthesises the result; a bad delegation cannot be caught by a second agent, only by the person at the hold. That is the trade the hold exists to make survivable, and it is why the delegation is shown per slot rather than summarised.
- **A question needing no split still works.** The orchestrator may write substantially the same task for every slot, which is the old verbatim behaviour arrived at by judgement rather than by a picker.
