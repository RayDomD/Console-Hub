---
title: Fusion Hub feature parity
date: 2026-09-23
status: Draft
summary: Give the five declared-only Recipes real runtimes and close Fusion Hub's supporting-feature gaps.
spec:
---

## Goal

Every workflow and supporting feature in [Fusion Hub](https://github.com/disler/fusion-harness) has a
working equivalent in Console Hub, proven by runtime evidence rather than Recipe declarations. This
is the gap roadmap the extraction plan (`2026-09-12-console-hub-extraction.md`) asked for after the
parity gate.

Console Hub keeps its accepted design: Vendor CLIs (Claude, Codex, AGY) rather than Pi's provider
list, isolated worktrees, and an explicit Apply Result. Parity means matching the workflows and
guarantees, not the implementation.

## Approach

### Audit, 2026-09-23

`recipeHasRuntime()` in `question-fan-plate/_internal/model.ts` is true only for `synthesize` and
`console`. The other five Recipes render as "runtime is not built yet."

| Fusion Hub | Console Hub Recipe | State |
|---|---|---|
| `/fh-opinion`: every model answers independently, read-only | Explore | **Missing.** Declared only. |
| `/fh-fusion`: read-only research, one fresh writer, result synced to every slot with ACKs | Synthesize | **Partial.** An Orchestrator delegates to read-only workers, then writes `docs/comparisons/*-comparison.md`. There is no fresh writer applying changes, no isolated-worktree merge, and no context sync or ACK. |
| `/fh-debate`: N-way rounds, each agent sees others' labeled positions, no judge | Debate | **Missing.** Declared only. |
| `/fh-collaborate`: independent plans, architect merges them into a DAG, parallel execution | Coordinate | **Missing as a Recipe.** Nearest are `/delegate` (dependent tasks across live terminals) and Mission (worktrees, currently held). |
| `/fh-auto-validate`: gate written first, proven red, bounded fix rounds until green | Validate | **Missing.** Declared only. |
| `/fh-only`: route one message to one slot | Direct | **Missing.** Console is a hand-driven terminal, not a routed session. |

| Supporting feature | Console Hub |
|---|---|
| Per-slot model and thinking level | **Present.** Vendor, model, and effort per Stack slot. |
| Enforced read-only slots | **Present for Claude** (tool removal) **and Codex** (`--sandbox read-only` plus `approval_policy="never"`). **Weaker for AGY** (`--sandbox` only; AGY documents no read-only mode). |
| Persistent per-slot sessions | **Missing.** `harness/_internal/runner.ts` captures session IDs but never resumes them, so every harnessed turn starts fresh. |
| `/fh-reset` | **Partial.** Orchestrator conversations can be reset; there are no slot sessions to reset. |
| `/fh-system-prompt` | **Missing.** ADR 0032 promises inspectable instructions; no renderer code shows them. |
| Model bar: speed, cost, context | **Partial.** Tokens and tokens per second (`SlotUsage` in `shared/fan.ts`). No cost, no context-window usage. |
| One writer per checkout, across processes | **Missing.** ADR 0040 requires it; no enforcement code found. |
| Inspectable per-run directory | **Partial.** Comparison documents and Console and Mission run records exist. No per-run folder with each slot's prompt, output, and ACKs. |

Console Hub already goes beyond Fusion Hub in three places: the interactive Console, `/delegate`
across live terminals, and Mission with worktrees and Apply Result (held until a subscription
runner path exists).

### Order

Each step reuses the runtime the one before it builds. Explore proves the harness path at the
lowest cost. Sessions come early because Debate, Direct, and Coordinate depend on them, and the
writer lease must exist before any Recipe writes code.

## Steps

1. **Explore.** Run the existing fan with the same prompt to every slot, with no delegation or
   synthesis. Independent answers shown side by side. Flip `recipeHasRuntime('explore')`.
2. **Persistent slot sessions and reset.** Resume each slot's captured session on later turns
   (`--resume` or the Vendor equivalent), keyed by slot plus Vendor and model (ADR 0031). Add a
   reset for all slot sessions. Record which Vendors support resumption; a Vendor that cannot
   resume makes session-dependent Recipes unavailable for that slot (ADR 0038).
3. **Writer lease.** Enforce one automated writer per checkout, across Console Hub processes
   (ADR 0040). Show the held lease and any queued writer (ADR 0047).
4. **Full Synthesize.** A fresh writer merges the proposals in an isolated worktree (ADR 0023),
   the fused result is saved, and every slot receives it and must acknowledge it with the run ID.
   Retry a malformed ACK once, then mark the run context-sync incomplete (ADR 0033). The result
   applies as uncommitted changes (ADR 0045).
5. **Debate.** Attributed rounds using persistent sessions. Each surviving slot sees every other
   slot's labeled prior position, may change sides, and the debate closes with positions and no
   judge (ADR 0024).
6. **Direct.** Route one message to one slot's persistent session, resumable until reset
   (ADR 0027).
7. **Validate.** The Validator writes an executable gate before any building, a baseline run
   proves it starts red, and the Builder works in bounded rounds until it passes. From the third
   failure, add a read-only triage brief and allow one gate repair (ADR 0026).
8. **Coordinate.** Independent plans merged into a validated dependency graph, held for review,
   then dispatched into isolated worktrees as tasks become ready, with integration at the end
   (ADR 0025). Reuse `/delegate`'s dependency sequencing where it fits.
9. **Supporting features, alongside the steps above:**
   - Cost and context-window usage in slot telemetry, shown only where the stream supplies them
     (ADR 0034).
   - An effective-prompt inspector per slot (ADR 0032).
   - A per-run folder holding the Stack, each slot's prompt and output, ACKs, and a summary
     (ADR 0036).
   - A read-only strategy for AGY, or AGY marked unavailable for read-only Recipes until one is
     proven.

## Risks

- **R1, Vendor session support differs.** Claude, Codex, and AGY may not all resume
  non-interactive sessions. Prove each before Step 2 claims it, and gate Recipes on the proven
  capability rather than degrading silently.
- **R2, AGY read-only.** AGY has no documented read-only mode. Running it in read-only Recipes on
  `--sandbox` alone would weaken the guarantee.
- **R3, usage spend.** Every Recipe run spends real subscription usage. Build and verify against
  stub CLIs (as `shoot-console-delegation.mjs` does) and reserve live runs for final checks.
- **R4, writer races.** Steps 4, 7, and 8 write code. None may ship before Step 3.
- **R5, Mission overlap.** Coordinate and Mission both dispatch into worktrees. Decide whether
  Coordinate reuses Mission's runner, which is currently held, or the harness.

## Checks to run

- Typecheck, full Vitest suite, and production build after each step.
- A stub-CLI Electron script per Recipe, in the style of `scripts/shoot-console-delegation.mjs`,
  covering all three Vendors and asserting no paid requests.
- For writing Recipes, proof that a second writer is refused or queued while a lease is held.
- For Synthesize, proof that every slot acknowledged the fused result, and that a missing ACK
  marks the run incomplete.
- `scripts/verify-cutover.mjs` still passes.

## Changelog

### 2026-09-23
- Plan created from the Fusion Hub audit. Pending; not started.
