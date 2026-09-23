---
title: Cockpit Mission
date: 2026-09-05
status: In Progress
summary: Run isolated, validated implementation lanes through the agent terminals already selected on Console.
spec: docs/adr/0053-mission-runs-agent-loop-lanes-through-console-workers.md
---

## Goal

Add the Vendor-neutral `/mission` workflow defined in ADR 0053, retain the global `/agent-loop` unchanged, and make Console open cleanly with contiguous worker numbering beginning at T1.

## Approach

Build Mission as a Cockpit-owned state machine and durable run record. Scoped Orchestrator integrations translate `/mission` and natural review intent into the same local protocol. Existing worker plates provide configuration and visibility, while Mission owns snapshots, worktrees, validation, integration, reconciliation, adoption, and cleanup.

## Steps

1. Start Console with no worker terminal and allocate compact ordered labels beginning at T1.
2. Define Mission plan, lane, evidence, lifecycle, and persistence types with a pure state transition core.
3. Replace the Claude-only delegation helper with a Vendor-neutral scoped Mission command protocol while preserving `/delegate`.
4. Freeze Git workspaces, including selected dirty and untracked state, and create one isolated worktree per released lane.
5. Rebind assigned Console plates to their lane processes, create approved reinforcements, preserve unused sessions, and restore assigned plates at terminal cleanup.
6. Validate Vendor outcome, structured result evidence, diff scope, and brief commands before a lane returns; sequence dependencies and explicit retries.
7. Persist plans, selected untrusted context, current lifecycle state, diffs, validation, stop/interruption state, and outcomes in a Mission Run Record.
8. Start review automatically after all required lanes return, integrate and validate in a separate worktree, and hold a failed combined review for user direction.
9. Review and apply validated changes as uncommitted work; reconcile and reconfirm destination drift; implement Apply and Reject cleanup.
10. Add end-to-end Electron coverage for planning, dispatch, completion, review, failure, restart recovery, adoption, cleanup, and all three Orchestrator Vendors.

## Risks

- Existing Console processes cannot change their original workspace boundary safely; assigned workers must be relaunched rather than sent a directory-change command.
- Dirty Run Snapshot construction must never write a temporary commit or mutate the user's index.
- Process exit alone and worker-authored evidence alone are insufficient completion proof.
- Applying against destination drift without reconciliation could silently invalidate combined validation.
- Existing uncommitted Console work in this branch must not be overwritten while Mission is added.

## Checks to run

- `npm run typecheck`
- `npm test`
- `npm run build`
- Mission Electron workflow screenshots for Claude, Codex, and AGY Orchestrators

## Changelog

### 2026-09-20
- Final review fixed Windows controlled-worker cancellation to stop child processes, made cleanup skip
  a worktree that never finished creation, and delivered failed-lane evidence to the Orchestrator
  before an explicit retry. Assigned plates now show the lane brief, controlled tool activity, and
  return status as terminal output. The process remains controlled by Mission rather than directly
  interactive in the shell plate; interactive continuation remains a separate pending capability.

### 2026-09-18
- Completed the remaining step-10 recovery matrix with deterministic, no-cost Electron scenarios.
  A malformed worker result is reported before the user-authorized retry starts; successful Apply
  adopts a real new file and then deletes every temporary worktree; closing Cockpit during a running
  worker restores the Mission as interrupted and retains its worktrees until explicit Reject.
- Restored the newest durable Mission during app startup and rebuilt the terminal worktree map from
  its Run Record. Active phases become interrupted rather than resuming hidden work after restart.
- Fixed two defects found by the new gates: captured Git patches now preserve their raw terminator,
  and overlapping Run Record saves are serialized through unique atomic-write siblings on Windows.
- Aligned explicit Reject with every phase where the terminal offers it, including held, blocked,
  reconciling, and interrupted Missions. Retry remains explicit and never starts before failure is
  reported.
- Closed the final review gaps: dependency cycles are refused before release, destination drift is
  rebuilt and revalidated against a fresh snapshot before a second explicit Apply, and the Run Record
  preserves the selected untrusted context supplied to each worker.
- Controlled Mission lanes are explicitly non-interactive until Pi session continuation is available.
  Interactive exploration remains an ordinary Console capability. Following Fusion Hub, a writing
  worker's worktree is a cwd/instruction boundary rather than an OS filesystem sandbox; enforced
  Vault protection applies to research workers through their read-only tool set.

### 2026-09-07
- Superseded by `2026-09-07-console-hub-friction.md` on three points settled there, without undoing
  the work recorded below. D7 removes the Mission review and release controls, the `?` command
  table, and the progress log this plan added on 2026-09-06; Mission is now operated entirely
  through the terminal, and each worker terminal carries the lane in one compact header instead.
  D2 makes review start automatically once the last required lane returns, so the `yes review` and
  `/mission review` entries below become a manual fallback rather than the way review begins. D5
  replaces the flat exclusion of a worker's prior conversation with a bounded untrusted transcript
  excerpt carried into the lane's fresh process. The 2026-09-06 entries stay as written; they record
  what was true then.
- D10 also supersedes the proposed automatic correction rounds. Combined review still runs in an
  isolated integration worktree, but a validation failure is persisted and reported for explicit
  user direction rather than entering a correction loop that Cockpit cannot safely authorize.
- Bound Mission runtime state to the existing T1/T2 worker plates. Assigned plates now show their Mission lane, phase, attempt, skills, and context; workers left out of a plan show the plan's availability reason instead of `NO ASSIGNMENT`.
- Replaced the misleading `NO DELEGATION YET` lineup label with Mission progress and a ready state when no run exists. The Live Stack uses the same Mission state so the worker identity and status stay consistent across both monitoring surfaces.
- The Mission status IPC now returns the full serializable Mission state, allowing the existing worker cards to monitor the same lane records that the Orchestrator review panel uses.
- Isolated requested lane skills from a worker's globally installed skills. The Mission prompt now declares its supplied capability packets to be the lane's complete skill set, preventing AGY from adding an unrelated design skill and running its `--kind` telemetry command during a `ui-preview` assignment.

### 2026-09-06
- Fixed the Mission/delegation protocol collision found in the live Orchestrator: a native `/delegate` request now refuses while a Mission is active, and a delegation after a refused Mission explicitly restores Markdown parsing. Scoped instructions now distinguish the two workflows and prohibit preparing both for one request.
- Added Cockpit-owned Mission review and release controls. A held Mission is shown as a readable title, acceptance list, and lane cards with a `Run Mission` button; the UI no longer tells the user to type a release phrase into the native agent terminal. The achromatic treatment follows the existing Console plate tokens.
- Retired delegation from the Console Orchestrator surface. `Prepare Mission` is now the single planning action, the scoped Claude context no longer installs `/delegate`, and explicit `/delegate` requests direct the user to Mission. The older console-run machinery remains isolated for compatibility with existing stored conversations.
- Added capability-routed Mission lanes. A lane may name Claude/Codex skills, compact context references, requested deliverables, and an interactive design session. Cockpit invokes the skill in the worker prompt, keeps interactive workers open until they write their final result, persists structured artifacts/decisions/unresolved questions, and returns that compact result to the Orchestrator once without copying the worker's exploration transcript.
- Replaced automated Mission Vendor-process launch and the rejected Windows Vault sandbox with a bundled Fusion Hub-style Pi runner. Research and writing tool sets are explicit, worker completion is persisted atomically by Cockpit, Stop aborts the controlled process, and an explicit model is required before snapshotting. Interactive lanes now refuse before release until controlled session continuation replaces the former live-terminal behavior.
- Completed the controlled-runner handoff contract: research lanes receive the configured Vault as a read/search-only root, dependent writers receive selected upstream Run Record evidence, structured result fields survive the runner boundary, and the configured run timeout terminates stalled workers as reported failures.
- Replaced the obsolete Vendor-terminal Electron fixture with a no-cost controlled-runner event stream. The gate now proves natural approval, an isolated lane worktree, the research tool allowlist, atomic evidence collection, automatic combined review, and the ready-to-apply UI in the built Electron app with Claude, Codex, and AGY each acting as Orchestrator.
- Made Mission terminal-first without removing the controls. The Orchestrator plate consumes exact `/mission`, `run`, `status`, `stop`, `review`, `apply`, and `reject` commands before Enter reaches the agent CLI, then invokes the same Cockpit actions as the buttons. Other terminal input still passes through unchanged.
- Added a collapsed-by-default `?` control to the Orchestrator header. It opens an achromatic command table explaining when to use each Mission control, its result, whether the Orchestrator is invoked, and the interactive design sequence.
- Made Mission skills vendor-neutral. Config now owns an ordered `skillRoots` list; dispatch resolves each named `SKILL.md`, writes an auditable copy beside lane evidence, and embeds the full capability packet plus its source directory in the worker prompt. Claude, Codex, and AGY use the same path, while a missing skill stops the lane before launch.
- Verified with 30 focused tests and `npm run build`. The Electron screenshot command was attempted, but the open Cockpit instance held the single-instance lock and closed the capture process before a window was available.

### 2026-09-05
- Plan created from the confirmed grill-with-docs decisions.
- Console now starts with zero workers and assigns the first launched worker T1.
- Added the tested Mission lifecycle contract, atomic persistence with interrupted-run recovery, and dirty Git Run Snapshot worktrees.
- Step 3 (partial): added `parseMissionDraft` and vendor-neutral draft instructions, a plain-text counterpart to the Claude-only `/delegate` skill that works identically for claude, codex, and agy. Not yet wired into `TerminalOrchestrator`, IPC, or the UI — that follows once worker relaunch (step 5) and the Mission review UI exist, so a held Mission plan has somewhere to go.
- Step 5 (partial): added `MissionTerminals`, ports-based worker relaunch into isolated lane worktrees on Run plan release, and cleanup that removes the worktree and restores an assigned worker's original session. Not yet wired to the real console registry, IPC, or UI — still needs a caller that supplies the live `assigned` session map and the Mission's snapshot workspace path.
- Added `MissionController`, gluing draft/hold, run plan (freeze + relaunch + dispatch), lane evidence recording, retry, stop, and cleanup into one object.
- Step 3 complete, step 5 wired end-to-end: `/mission` is now live in the real Orchestrator terminal. Typing `/mission` pastes the vendor-neutral draft instructions (claude, codex, agy alike); the drafted plan is held via `MissionController`; typing "go" runs it — freezing the vault root, closing each assigned worker, and relaunching it into an isolated Git worktree, using the real console registry. Deliberately no renderer/UI: `/mission` is driven entirely through the terminal. Verified with typecheck, the full test suite (799 passing), and a production build.
- Still remaining: lane evidence reporting from inside a worktree back to Cockpit (a lane currently only advances via `recordLane`, called by nothing real yet), the integration/review engine and correction rounds (step 6/8), and Apply/Reject cleanup (step 9).
- Steps 5 and 6 complete: a released lane now restarts the selected visible plate in place, launches its configured Vendor with an exact brief and result path, observes Vendor completion, captures the real Git patch through a temporary index, runs the reviewed validation commands independently, enforces the approved file set, persists evidence, and automatically releases dependency lanes. AGY reports completion through its structured result file because it has no turn hook.
- Step 9 core path complete: `yes review` and `/mission review` build all returned patches in a separate integration worktree and rerun the combined validation set. `/mission apply` checks destination drift before applying the integrated patch as uncommitted work and cleaning up; `/mission reject` cleans up without applying. Drift is held in `reconciling` for a new confirmed result.
- Added the missing native Claude `/mission` entry. Every newly launched Claude Orchestrator now receives a generated, session-scoped `.claude/skills/mission` beside its scoped `CLAUDE.md`; its helper asks Cockpit for the current workers and fresh plan paths, while global skill directories and the workspace remain untouched.
