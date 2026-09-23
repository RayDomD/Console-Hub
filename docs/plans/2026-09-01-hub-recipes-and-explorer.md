---
title: The Hub's Explorer sidebar, its seven Recipes, and vendor rims
date: 2026-09-01
status: Done
summary: The Console Hub becomes a surface with an Explorer-first sidebar, seven Recipe choices that configure the run plate and its stages, and 2px vendor identity rims on live slots and streams.
spec: ../mockups/2026-09-01-console-hub-explorer.html
---

## Goal

Build the Hub shell that [ADR 0021](../adr/0021-the-hub-has-explicit-recipes.md) settled and the
[explorer mockup](../mockups/2026-09-01-console-hub-explorer.html) records. Four outcomes:

1. An Explorer-first leading sidebar, with the seven Recipe choices beneath it.
2. Selecting a Recipe configures the active run plate and its stages.
3. Codex, Claude and AGY identity rims on live slots and streams.
4. The result verified in the Electron app with a screenshot.

## Approach

**The Recipe is presentation and gating, not execution.** ADRs 0022 through 0028 each describe a
different runtime - read-only fan-out, held merge, attributed rounds, a dependency graph, a gate
loop, a resumable session, a pty. Building seven runtimes is a separate epic. This plan builds the
chooser, the plate configuration, the stage strip, and the capability gate that makes an
unsatisfiable Recipe visibly unavailable rather than silently degraded
([ADR 0038](../adr/0038-recipes-are-gated-by-proven-capabilities.md)). The existing orchestrated fan
remains the only Recipe that actually runs.

**`hub` joins the four surfaces** on the existing `PlateLayoutProvider` machinery, per
[ADR 0018](../adr/0018-the-hub-is-a-surface-and-the-console-is-on-it.md). Not the free canvas; that
stays in phase 2 where the plan put it.

**The rims are the one shell colour exception**, recorded in
[ADR 0048](../adr/0048-vendor-rims-are-bounded-identity.md) and already written into `DESIGN.md`.
They replace ADR 0014's four-hue palette, which the code still carries as `--slot-anthropic` and
its siblings.

**The contract is fixed before dispatch.** `src/shared/recipes.ts` and `'hub'` on `PlateSurface`
are authored in the main session and committed, so the shell lane and the plate lane compile
against one fixed shape and stay file-disjoint.

## Steps

1. **Contract.** `src/shared/recipes.ts` names the seven Recipes with title, badge, description,
   ordered stages and slot bounds; `PlateSurface` gains `'hub'`. Main session, before dispatch.
2. **Hub shell.** A `hub-shell` renderer module: activity rail, Explorer sidebar, stage region.
   `hub` becomes a real surface with its own persisted arrangement, entered from `rest`.
3. **Workspace tree.** One main-side module and IPC channel listing a directory level under the
   selected workspace, so the Explorer sidebar has content.
4. **Recipe configuration.** Selecting a Recipe sets the run plate's title, badge, description and
   stage strip, and gates a Recipe its Stack cannot satisfy with the missing reason named.
5. **Rims.** `--agent-codex`, `--agent-claude`, `--agent-agy` replace the four ADR 0014 hues on the
   slot cap and the sidebar bar.
6. **Verify.** `npm run shoot` against the built app, and read the screenshot back.

## Risks

- **R1 - the shell is large.** The mockup carries top bar, rail, Explorer, stage, aside and dock.
  Steps 2 and 3 build the rail, Explorer and stage only; the dock and Live Stack aside are not in
  scope here.
- **R2 - seven Recipes, one runtime.** The plate will name guarantees it cannot yet enforce. Every
  Recipe except the orchestrated fan must read as unavailable rather than as a working choice.
- **R3 - screenshot is the only evidence.** Layer 0 is a canvas, and Chrome-driving tools cannot
  reach an Electron window, so `npm run shoot` is the verification, not a DOM assertion.

## Checks to run

- `npm run typecheck`
- `npm test`
- `npm run shoot -- out/hub.png 3000`, and read the image

## Changelog

### 2026-09-01
- Plan created and approved. Dispatched through `/agent-loop` over claude, codex and agy.
- All three lanes merged. Verified with `npm run shoot`; see the session summary.

### 2026-09-03
- Design refinements approved via `/ui-preview` in [docs/mockups/2026-09-03-console-hub-calibrated-instrument.html](../mockups/2026-09-03-console-hub-calibrated-instrument.html).
- Quieted Navigator active state (3px leading rule), calibrated pre-flight transcript/card heights, and fixed terminal chamfer padding.
