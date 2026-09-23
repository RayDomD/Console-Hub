---
title: The console is a plate, not an overlay
date: 2026-09-01
status: Done
summary: ConsoleView drops its fixed full-screen frame and becomes the Hub's Console recipe plate; opening a console from anywhere flies to the Hub instead of painting an overlay on the current surface.
spec: ../tickets.md
mockup: ../mockups/2026-09-01-console-plate.html
---

## Goal

Build the ticket at `docs/tickets.md:462` ("The console is a plate, not an overlay"), the second
of the three tickets under [ADR 0018](../adr/0018-the-hub-is-a-surface-and-the-console-is-on-it.md).
Its blocker - a fifth surface, entered through a door - is done, shipped as the Recipe-driven Hub
in `2026-09-01-hub-recipes-and-explorer`.

Four outcomes, from the ticket:

1. The console renders as a plate on `hub`, with no fixed-position frame and no back button of its
   own.
2. Opening a console from elsewhere - Vault Health's control, for one - flies to `hub` rather than
   painting a layer over the current surface.
3. There is exactly one way to be full-screen in the application, and one way back.
4. The console's own behaviour - scrollback, clear, its shell - is unchanged.

## Approach

**`console` already exists as a Recipe** (`src/shared/recipes.ts`, `minSlots: 1`, `maxSlots: 1`,
badge `INTERACTIVE`) but has no runtime: `recipeHasRuntime` in
`question-fan-plate/_internal/model.ts` only returns true for `'synthesize'`, so selecting it today
shows "Console's runtime is not built yet" inside `QuestionFanPlate`. This plan gives it a real
runtime without touching the other five recipes, which keep reading as unavailable exactly as they
do now.

**`ConsoleView` loses its own chrome, not its behaviour.** The `.hub { position: fixed; inset: 0 }`
frame, the "Back to Cockpit" button and the "CONSOLE HUB" header are deleted. The xterm mount, the
resize wiring, the `window.cockpit.consoles` seam, the cwd/shell readout and the Clear button are
unchanged and move into a plate-shaped header consistent with `QuestionFanPlate`'s. The Hub's
existing "Return to rest" control is the one way back - the console never grows a second one.

**The pty's lifecycle follows the Recipe selection, not a standalone boolean.** Today
`App.tsx` holds `consoleOpen` and mounts `<ConsoleView open={consoleOpen} .../>` unconditionally;
the effect that opens/closes the pty is keyed on `open`. After this change the console plate only
exists in the tree while `surface === 'hub' && recipe === 'console'`, the same way
`QuestionFanPlate`'s cards only exist while the Hub shows a Recipe - unmounting closes the session
through the existing cleanup effect, no new lifecycle code needed.

**Vault Health opens the console by selecting it, not by flipping a prop.** `VaultHealthPlate`
already renders inside `PlateLayoutProvider` and `RecipeSelectionProvider` (it's a child of both in
`App.tsx`), so its "Console Hub" link can call `setSurface('hub')` and `select('console')` directly
via `usePlateLayout` / `useRecipeSelection` instead of taking an `onOpenConsole` callback from
`App`. This is the one call site named in the ticket; nothing else opens a console today.

**Esc is out of scope.** The ticket after this one - "Esc belongs to the terminal first" - is
blocked by this one and handles two-stage Esc. Nothing here changes keyboard handling.

## Steps

1. **Runtime gate.** `recipeHasRuntime` gains `'console'` alongside `'synthesize'`.
2. **The console plate.** Strip `ConsoleView`'s frame, back button and full-screen header; keep the
   terminal, resize, Clear and cwd/shell readout; restyle to fill a stage plate instead of the
   viewport.
3. **Hub stage branch.** `HubShell`'s stage renders the console plate when `recipe === 'console'`,
   `QuestionFanPlate` when `recipe === 'synthesize'`, and falls through to `QuestionFanPlate`'s
   existing "not built yet" messaging for the other four - unchanged.
4. **Drop the standalone overlay.** `App.tsx` loses `consoleOpen` state and the unconditional
   `<ConsoleView>` render.
5. **Vault Health opens the Hub.** `VaultHealthPlate`'s "Console Hub" link calls `setSurface('hub')`
   and `select('console')` directly; the `onOpenConsole` prop is removed from its interface and
   from where `App` renders it.
6. **Verify.** `npm run build`, then a live pass in the built app: open the console from Vault
   Health, type a command, see real output, Clear, switch to another Recipe and back (confirm the
   pty actually closes and reopens rather than leaking), and confirm no fixed-position overlay
   exists anywhere in the app.

## Risks

- **R1 - the pty lifecycle moves.** It is currently owned by a boolean `App` controls; after this
  change it is owned by Recipe selection. Switching away from `console` must close the shell exactly
  as closing the old overlay did - verified live, not just by the effect's cleanup existing in code.
- **R2 - the stage's per-recipe branch.** `QuestionFanPlate` currently renders unconditionally for
  every non-null Recipe and handles "no runtime" internally. Pulling `console` out means the branch
  has to live in `HubShell`, and the remaining five recipes must still hit `QuestionFanPlate`'s
  existing unavailable message rather than rendering nothing.
- **R3 - CSS.** `ConsoleView.module.css`'s `.hub` class assumes viewport sizing. The stage plate
  needs the Hub stage's own flex/height rules, not the old fixed frame with `position: fixed`
  removed and nothing put in its place.

## Checks to run

- `npm run typecheck`
- `npm test`
- `npm run build`, then a live pass in the built app per step 6.

## Changelog

### 2026-09-01
- Plan created.
- Navigation mockup confirmed and saved to `docs/mockups/2026-09-01-console-plate.html`: the console
  recipe rendered as a plate inside the Hub stage, entered from Vault Health or the door plate via
  the same fly-to-hub transition the fan uses, with "Return to rest" as the only way back.
- Built. All six steps shipped as written. `recipeHasRuntime` now returns true for `console`;
  `ConsoleView` lost its fixed frame, back button and full-screen header and fills the stage;
  `HubShell` branches on a new tested `stageContentFor` helper; `App` no longer holds `consoleOpen`
  or renders a standalone `ConsoleView`; `VaultHealthPlate` navigates with `setSurface('hub')` +
  `select('console')` and dropped its `onOpenConsole` prop.
- One deviation, deliberate: the terminal region gained a 1px `--rule` hairline and 8px padding.
  The saved mockup shows the terminal as a bordered box and the old overlay had no border, so the
  mockup was followed rather than the previous code.
- Verified: `npm run typecheck` clean, `npm test` 517 passed / 1 skipped, `npm run build` clean, and
  a driven Playwright pass over the built app - 14/14 checks, no renderer errors. The pass covers
  R1 (switching Recipe leaves 0 consoles registered in main, returning opens a fresh id) and the
  ticket's outcome 3 (the console's only full-screen ancestor is the Hub surface itself).
