# Acceptance is fixed before the answers exist

Nothing in a fan is scored against the other entries. A build fan is scored by an executable gate written before any work starts; a question fan is scored against a written checklist of what a good answer must cover, also written first.

**Status:** accepted

## Context

A fan's failure mode is rewarding persuasiveness. Four answers compared against each other rank by how convincingly they read, and the articulate wrong answer is the expensive one.

`cmd-build.ts` solves this for code:

1. A `VALIDATOR` writes an executable acceptance gate — `gate.py` at an absolute path the harness dictates — **before any work happens**.
2. The gate runs as a baseline first and is *expected to fail*. A gate that passes before the builder has done anything is testing nothing, and the harness warns.
3. The gate is immutable during the loop. The builder sees a fixed target.
4. Pass/fail is `ok = lastGate.code === 0`. **No model judges anything.**
5. On failure the gate's output feeds back verbatim into the builder's persistent session as the correction.
6. On the third failure the validator may repair a defective gate **once**, and that round is free.
7. The run halts after five failed validations.

This is test-driven development across agents, with the test written by a different model than the one implementing it.

## Consequences

- **This is what round 2 asks for, and it replaces an agent reviewing the synthesis.** The correction is stdout from a failing script, not a judgement. It removes the problem of the architect grading its own work, costs no extra console, and cannot be argued with.
- **The round cap moves from 3 to 5**, with the free gate repair on the third failure. A repaired gate is not a wasted attempt, so the reasoning that set the cap at 3 fix rounds no longer binds. This supersedes the 3-round cap in the console-hub plan.
- **A question fan cannot have a gate.** There is no exit code for "should this be SQLite or Postgres". It gets the weaker form: the architect writes acceptance criteria for a good answer before the answers exist, then scores each against criteria fixed in advance. Not an exit code, but reproducible rather than impressionistic.
- The RED baseline transfers to the question fan as well: criteria the current state already satisfies are bad criteria and should be rewritten.
- **The two fans do not have equal signal, and the plan must say so.** A build fan ranks by what compiles and passes; a question fan ranks by coverage of a checklist one model wrote. The question fan remains exposed to four models trained on overlapping data agreeing with each other, which reads like confirmation and is not evidence. Its output is advisory and must be presented that way.
