---
title: Console Hub Calibrated Instrument Overhaul
date: 2026-09-03
status: Done
summary: Transform the Console Hub into a unified aerospace instrument deck: integrated pipeline header, chamfered config tool strip, top-level Return to Rest affordance, causal bus wiring Orchestrator to Workers, 3-cell telemetry, and Live Stack chamfers.
spec: ../mockups/2026-09-03-console-hub-calibrated-instrument.html
---

## Goal

Elevate the Console Hub (`HubShell`, `QuestionFanPlate`, `OrchestratorTerminal`, and `WorkerCard`) to the out-of-distribution craft floor pinned in `DESIGN.md` and approved in `/ui-preview` under `docs/mockups/2026-09-03-console-hub-calibrated-instrument.html`.

Six cohesive improvements across the Hub surface:
1. **Integrated Stage Pipeline Header & Chamfered Config Strip:** Unify Recipe title, capability badge, runtime notice, and stages into a single continuous pipeline bar. Replace the unstyled browser `<details>` with a chamfered collapsible tool strip.
2. **Navigator Restructure & Return to Rest Re-anchoring:** Move `Return to Rest` to the Navigator header, giving it primary top-level navigation status. Give the unconfigured workspace state an intentional structured slot.
3. **Causal Bus Trace:** Wire the Orchestrator terminal to the worker fleet with an achromatic 1px distribution circuit bus, visualizing the conductor-to-fleet relationship.
4. **Calibrated Telemetry Readouts:** Upgrade worker card telemetry footers to a precision 3-cell mono instrument readout (`RATE`, `TOKENS`, `ELAPSED`).
5. **Live Stack Chamfered Plate Harmony:** Refine the right aside cards with 11px chamfers, corner ticks, and legible mono typography.
6. **Ambient Stage Zoom & Utility Bar:** Integrate floating stage zoom controls into an ambient utility header.

## Approach

- **Strict Adherence to `DESIGN.md`:** 
  - Achromatic shell (black ground `#000000`, page `#0A0A0B`, matte plates `rgba(6, 6, 7, 0.88)`, 1px hairlines `rgba(237, 237, 234, 0.22)`, rules `#2A2A2C`).
  - No color for state: state reads as glyph form (`▯▯▯▯ IDLE`, `▮▮▮▮ RUN`) plus mono label.
  - Chamfers at 11px top-right and bottom-left, zero radius everywhere.
  - Safe internal insets (minimum 14px horizontal padding on bottom-docked items) to prevent any text clipping.
- **Contract & Verification Preservation:**
  - Preserve all `data-verify-*` DOM attributes on `HubShell`, `QuestionFanPlate`, and `OrchestratorTerminal`.
  - Maintain all test suites in `npm test` and zero TypeScript errors in `npm run typecheck`.

## Steps

1. **Plan & Spec Documentation:** Write and register `docs/plans/2026-09-03-console-hub-calibrated-instrument.md` linked to the approved mockup.
2. **Step 1 — Navigator & Navigation Flow (`HubShell.tsx`, `HubShell.module.css`):**
   - Relocate `Return to rest` button to `navigatorHead`.
   - Style empty workspace placeholder with structured dashed chamfer box.
   - Refine ambient stage zoom controls in stage header.
3. **Step 2 — Integrated Pipeline Header & Config Tool Strip (`QuestionFanPlate.tsx`, `QuestionFanPlate.module.css`):**
   - Combine Recipe title, capability badge, runtime notice, and numbered stage sequence into a continuous chamfered bar.
   - Replace native `<details>` with an instrument config button and collapsible plate using Cockpit's chamfered inputs and selects.
4. **Step 3 — Causal Bus & Worker Fleet Grid (`QuestionFanPlate.tsx`, `QuestionFanPlate.module.css`):**
   - Render a 1px mechanical circuit bus (`.causalBus`) bridging the Orchestrator composer to the worker card grid.
   - Connect the bus trace visually to worker card top caps.
5. **Step 4 — Worker Card Telemetry Precision (`WorkerCard.tsx`, `WorkerCard.module.css`):**
   - Upgrade metrics footer to a structured 3-cell layout with uppercase labels.
   - Format throughput, tokens, and duration cleanly with fallback dashes.
6. **Step 5 — Live Stack Card Chamfering (`HubShell.tsx`, `HubShell.module.css`):**
   - Apply 11px chamfers and 2px vendor rims to `StackSlot` components.
   - Improve typography hierarchy.
7. **Step 6 — Full Verification:**
   - Run `npm run typecheck`.
   - Run `npm test`.
   - Run `npm run build`.

## Risks

- **R1 — Verify Contract Breakage:** Modifying DOM structure in `QuestionFanPlate` or `HubShell` could alter elements expected by `fixtures` or `verifyAttrs`. Mitigate by keeping all verify attribute wrappers exactly where test runners query them.
- **R2 — Sub-pixel Chamfer Insets:** Adding chamfers to small stack cards can clip text if padding is insufficient. Mitigate with 12px minimum side margins.

## Checks to run

- `npm run typecheck`
- `npm test`
- `npm run build`

## Changelog

### 2026-09-03
- Plan created following `/ui-preview` design approval.
- Shipped Navigator Return to Rest relocation and empty workspace placeholder.
- Shipped unified pipeline bar with numbered stages and unbuilt status badge.
- Shipped chamfered fleet & workspace config tool strip.
- Shipped physical causal circuit bus connecting Orchestrator to worker bays.
- Shipped 11px chamfered Live Stack cards with top 2px vendor identity rims.
- Shipped calibrated telemetry readout on Worker cards.
- Verified with typecheck, all 645 tests passing, and successful electron-vite build.
