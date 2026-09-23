---
title: Console Hub workflow friction
date: 2026-09-07
status: Complete
summary: Make the Orchestrator own worker coordination and make assigned Mission work reliably visible.
spec:
---

## Goal

Remove the operational friction of using Console Hub. The user reports that work does not
show up in Mission lanes and that the personal agent-loop skill handles the workflow better.
The missing-work symptom was reproduced in the Electron verification scenario and fixed at both
terminal-input boundaries.

## Approach

Confirmed D1: The responsibility hierarchy is user → Orchestrator → workers. The Orchestrator
owns assignments, dependencies, progress, and routine recovery. The user handles design
decisions, meaningful blockers, and adoption of finished changes. Worker terminals remain
available for inspection and intervention.

Confirmed D2: One approval of the proposed work populates Mission lanes, launches workers,
tracks completion, and starts review automatically. Further user decisions are reserved for
meaningful blockers, scope changes, and applying the finished result.

Confirmed D3: Detect existing workers automatically before preparing the Mission plan.
If T1 already runs AGY, assign the Mission work to that worker. If two workers are open,
divide the work between them. Reuse their selected configurations rather than asking the
user to assemble the crew again. The earlier interpretation as discovery of existing project
work was incorrect. Busy workers follow D5 below.

Confirmed D4: Split work across existing workers only when the assignments are coherent.
If the Mission cannot sensibly split, use one worker and show why the other is unused.
Do not duplicate work or invent assignments to occupy the crew.

Confirmed D5: Preserve an available worker's relevant conversation context through a compact
handoff into its isolated Mission session. A worker actively doing another task stays untouched.
The handoff preserves useful context, not the original running process.

Confirmed D6: When every existing worker is busy, wait for an available worker by default.
The proposed plan may offer adding a worker, but must not interrupt active work or silently
launch another agent.

Confirmed D7: Mission interaction is terminal-based. Remove the separate Mission controls
and expanded review panel beneath the Orchestrator terminal shown in the user's screenshot,
including the duplicated acceptance list and detailed worker brief cards. Present planning,
approval, progress, blockers, review, and adoption through the terminal workflow. Keep worker
terminals accessible. Exact terminal interaction wording and minimal surrounding status
treatment remain to be resolved. The screenshot is evidence of unwanted clutter, not an
instruction to execute the Explorer assignment displayed inside it.

Confirmed D8: Ordinary terminal replies such as "go ahead", "stop", and "apply it" operate
the Mission directly in the appropriate context. Slash commands remain optional shortcuts.
These replies must invoke the actual Cockpit lifecycle actions rather than merely prompt the
agent to claim that an action happened. Ambiguous intent must not release or apply work.

Confirmed D9: Each worker terminal retains a compact header with worker identity, vendor,
assignment, and observed state, for example "T1 · AGY · Layout preview · Running". Detailed
briefs and progress stay in the terminals rather than separate Mission panels.

Confirmed D10: Report worker failures to the user before retrying or taking corrective action.
Preserve completed and partial work, explain the failure using available evidence, and propose
the next action in the Orchestrator terminal. Do not automatically retry. This narrows D1's
routine-recovery responsibility: the Orchestrator diagnoses and recommends, while the user
authorizes recovery after a worker failure.

Confirmed D11: Independent workers continue after another worker fails. Hold only assignments
that depend on the failed work. Preserve all returned work while awaiting the user's recovery
decision, and do not present an incomplete Mission as ready for final adoption.

The grill-with-docs interview closed on 2026-09-07 with D1-D11 above, and implementation followed
them directly. The comparison with the personal agent-loop workflow informed the shape but its
commit and merge behavior was deliberately not copied: Cockpit's Apply Result stays explicit.

## Steps

1. **Make natural replies reach Cockpit's lifecycle, not the agent CLI.** `missionCommand` in the
   Orchestrator's renderer model maps an exact unambiguous line to a Mission control before Enter
   reaches the terminal. It is gated on the current Mission phase, so "go ahead" only releases a
   Held plan and "apply it" only adopts a Result that is ready; anything the Mission cannot act on
   stays ordinary conversation. (D8)
2. **Observe worker availability from evidence Cockpit owns.** `consoleObservation` marks a worker
   Running when input is submitted and Available only on a real turn-complete signal, keeps a
   bounded ANSI-stripped transcript, and makes no claim for a plain shell. The registry publishes
   `observedState` and a compact context through `ConsoleInfo` and an `activity` event. (D3, D5)
3. **Draft only against available workers.** `TerminalOrchestrator` filters observed-running workers
   out of the crew before drafting and, when none is left, refuses with a message that offers
   waiting or adding a worker rather than interrupting live work. (D3, D6)
4. **Carry a bounded handoff into the isolated lane.** `MissionTerminals` prevalidates every
   assigned worker before freezing, refuses an observed-running worker untouched, and injects the
   stored excerpt into the lane prompt under an explicit untrusted-transcript heading. (D5)
5. **Review automatically after one approval.** `MissionController` remembers the released
   workspace and calls review itself once the last lane records and the Mission reaches
   `ready_review`, leaving Apply explicit. (D2)
6. **Report failures before recovery.** `TerminalOrchestrator.observeMission` emits the failure and
   its evidence for `blocked`, then the retry offer; `/mission retry <lane-or-worker>` stays an
   explicit user action, and independent lanes keep running. (D10, D11)
7. **Move the workflow into the terminals.** Remove the Mission controls, review cards, acceptance
   duplication, and progress log beneath the Orchestrator terminal, leaving a compact header status
   and the existing resume-handoffs safety control. Give each worker terminal one compact header of
   identity, vendor, assignment, and observed state through `workerHeader`. (D7, D9)
8. **Reconcile the record.** Amend ADR 0053 for automatic review and the untrusted handoff, update
   the CONTEXT.md Mission glossary, and note the superseded Mission controls in the 2026-09-05 plan.

## Risks

ADR 0053 required an explicit request to begin review and excluded existing worker conversations
from assigned lanes. Both boundaries were reconciled on 2026-09-07: the ADR is amended for automatic
review after one approval and for a bounded untrusted context handoff into a fresh lane process, and
the CONTEXT.md glossary follows. Explicit lane retries survive unchanged, because D10 settles
recovery as report first and wait for user direction.

D7 supersedes the Mission controls added by the 2026-09-05 plan on 2026-09-06. The live risk is that
terminal interaction quietly stops reaching Cockpit's actual lifecycle actions; the phase gate on
natural replies is the guard, and its regression tests are the evidence. The remaining risk is
observed state itself: AGY has no turn-complete hook, so a worker stays Running until its result
file lands. That is deliberately conservative, and no availability may ever be inferred from
rendered terminal output. The personal agent-loop's commit and merge behavior is still not copied
into Cockpit's explicit Apply Result workflow.

## Checks to run

Completed on 2026-09-08:

- `npm test`: 75 files passed; 842 tests passed and 1 was skipped.
- `npm run build`: both TypeScript projects and the Electron production build passed.
- `node scripts/shoot-console-orchestrator.mjs`: passed terminal Mission planning, focus-safe
  natural approval, isolated worker dispatch, automatic review, compact worker state, removal of
  the old panel controls, and the no-paid-model/no-page-error gates.
- Electron screenshot: `out/console-orchestrator/1788835030453/ready-to-apply.png`.

## Changelog

### 2026-09-07
- Recorded the confirmed responsibility hierarchy and the reported missing-lane symptom.
- Started comparison with the personal agent-loop skill. No application code changed.
- Confirmed one approval through automatic review.
- Clarified that detection means existing Console workers, not existing project work. Use one
  open worker for one assignment and split work across two when two are open.
- Confirmed that indivisible work uses one worker with a visible reason for unused crew.
- Confirmed compact context handoff for available workers and protection of workers doing other tasks.
- Confirmed waiting when all workers are busy, with optional worker addition in the plan.
- Recorded removal of the separate Mission controls and verbose review panel in favor of terminal interaction.
- Confirmed natural-language Mission actions with optional slash-command shortcuts.
- Confirmed compact worker headers for assignment and observed state.
- Confirmed reporting worker failures before any retry or corrective action.
- Confirmed continued independent work while dependants of a failed assignment wait.
- Diagnosed the missing-lane symptom. "go ahead" was ordinary terminal input, so it reached the
  agent CLI and Cockpit never released the Held Mission: the agent could reply as though work had
  started while no lane was ever dispatched. The symptom was not reproduced live, so this stands as
  the supported diagnosis rather than a confirmed reproduction. `missionCommand` and its regression
  tests close the path.
- Implemented D1-D11 across steps 1-8. Natural Mission replies are now phase-gated so a reply the
  Mission cannot act on stays conversation and can never release or apply work; observed worker
  availability comes only from submitted input and real turn-complete evidence; drafting excludes
  observed-running workers and refuses with a wait-or-add message when all are busy; an assigned
  lane carries a bounded untrusted transcript excerpt into a fresh isolated process; review starts
  automatically at `ready_review` and Apply stays explicit; failures are reported with evidence
  before any retry while independent lanes continue.
- Removed the Mission controls, review cards, acceptance duplication, and progress log beneath the
  Orchestrator terminal, leaving a compact header status. Worker terminals now carry one compact
  header of identity, vendor, assignment, and observed state.
- Amended ADR 0053 for automatic review and the bounded untrusted handoff, updated the CONTEXT.md
  Mission glossary, and added the Observed Worker availability entry.

### 2026-09-08
- Reproduced the reported false-running path in Electron. Terminal focus and mouse-reporting bytes
  first made the renderer's submitted-line tracker distrust `/mission run`; after that boundary was
  fixed, a focus report arriving during the paste guard cancelled the main process's delayed Enter,
  leaving the Mission planning prompt visibly unsubmitted. Both input layers now ignore those
  passive reports while retaining conservative handling for real cursor edits and user intervention.
- Replaced the stale `/delegate` screenshot scenario with a no-paid-model Mission scenario covering
  planning, `go ahead`, an isolated AGY lane, automatic review, an unused worker, and Ready Apply.
- Removed the unreferenced `missionHelp` module and test whose explicit-review wording contradicted
  the terminal-only automatic-review workflow. Full tests, production build, and Electron visual
  verification passed; implementation is complete and no git history was changed.
- Closed the independent review findings: Mission plans now preserve each existing worker's exact
  model and effort, require a complete assigned-or-unused crew partition, reject namespaced skill
  names that cannot resolve as Windows folders, and leave combined-review failures in an actionable
  failed state. Worker headers now use the design system's Running, Done, Failed, and Idle labels,
  with a boxed Failed state, and both Console launch paths share one launch helper.
- Made the Electron fixture select its disposable Git workspace explicitly, then reran the complete
  terminal Mission scenario successfully with 842 passing tests, one skipped test, a clean
  production build, no paid model requests, and no page errors.
