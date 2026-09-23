# Collaboration is a skill until sessions resume

A `/fh-collaborate`-style mode — every slot plans independently, the architect merges the proposals into one dependency DAG, tasks execute on readiness — is a legitimate third fan kind and not a violation of [ADR 0012](0012-two-kinds-of-fan.md), which forbids *converting* a live fan between kinds rather than having a third. It is nonetheless not buildable in Cockpit today, because a DAG requires a slot to take several turns on one session and the harness never resumes a session. Until phase 2 delivers session persistence, collaboration is a skill button: one harnessed agent running the whole graph through its own child agents.

**Status:** superseded by ADR 0025

## Context

fusion-harness sits a layer below Cockpit. It is a coding-agent extension, so `/fh-collaborate` plans, validates the DAG and dispatches tasks **inside one host agent's context**. Cockpit orchestrates operating-system processes; Fusion orchestrates turns inside one of them. The DAG was never obliged to be a Cockpit concept.

Cockpit already has most of the skeleton — slots carrying vendor, model, effort and scope; a two-vendor harness that detects turn boundaries; a machine that launches slots in parallel and waits for every one to reach terminal; an architect role; and, planned for phase 2, worktrees over Fusion's `wx` lease, which is its `maxConcurrentWriteEnabledChildren = 1` by another name.

## What blocks it

**A slot cannot take a second turn.** Fusion's collaborate mode requires that *"a slot may own several tasks, and they run one at a time on its session."* `harness/_internal/runner.ts` captures `sessionId` off the stream and reports it, and never passes it back — there is no `--resume` and no `--continue` for either vendor. Every launch is a cold process. A slot that cannot continue a conversation cannot own two dependent tasks, so no amount of UI work makes a DAG possible.

Three smaller gaps sit behind it: `FanState` models one attempt per slot with one terminal outcome where a DAG slot has N tasks with N outcomes; merging N proposals into one acyclic validated graph does not exist; and Fusion's ACK context-sync needs resumable sessions too.

**This is not a new dependency.** ADR 0012's own table already commits phase 2 to persistent sessions — build-fan workers persist and the architect re-seeds, against a question fan's discarded sessions. Session resume is owed regardless.

## Considered Options

- **Build the collaborate fan now.** Rejected: it is blocked outright by session resume, which is phase-2 work.
- **Never build it; the skill is the answer permanently.** Rejected. A skill run is one provider — `SkillEntry` names a single `skill`, one `cwd`, one `writes` boolean and one executor. A graph where Codex performs a typed refactor and Claude writes the test pass cannot happen inside one session. Cross-vendor execution is the one thing only Cockpit can offer, and abandoning it here would be abandoning the reason the fan machinery exists.

## Consequences

- **Now: a skill button, and no Cockpit code.** A `/collaborate` skill in `~/.claude/skills` plus one `skills[]` entry, per `docs/recipes/adding-a-skill-button.md`. Fusion's own is a Pi extension, so this is a reimplementation rather than a copy; its prompt contracts and DAG-validation rules are the part worth reading. What the skill cannot give: per-task cards, a live task board, per-task scope, split token accounting, and any use of a second vendor. Cockpit sees one process and one stream.
- **Later: a third fan kind, gated on session resume.** Phase 2 step 12 is the prerequisite. Once workers resume with sessions intact, the remaining work is the multi-task slot model, proposal merge with cycle detection, and the board.
- **The gate from [ADR 0015](0015-the-question-fan-holds-for-a-human.md) does not extend to it.** A collaborate fan's plan is reviewable the way criteria are, but that is a separate decision and must not be assumed inherited.
