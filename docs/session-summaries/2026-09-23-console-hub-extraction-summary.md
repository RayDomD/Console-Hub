---
title: Console Hub extraction, steps 9-11
date: 2026-09-23
plan: docs/plans/2026-09-12-console-hub-extraction.md
---

## What shipped

**Console Hub** (`codex/console-hub-extraction`):

- `aa73026` commits the standalone app from Cockpit baseline `b4fbd28` (steps 3-7).
- `c36bf0e` makes a free-form `/mission <direction>` line reach Console Hub's Mission drafting
  instead of the Vendor CLI.
- `143b7da` registers `consolehub://` at install time (`build/installer.nsh`) and repairs a
  missing registration at startup. electron-builder does not register `protocols` for NSIS on
  Windows, so before this the installed app never received a launch.
- `4a38d11` adds `scripts/verify-cutover.mjs`, the step 11 scenario check.

**Cockpit** (`feat/console-hub-cutover`, worktree `C:\FIles\Cockpit-hub-cutover`):

- `d477155` (step 9): the `console-hub-launch` module and `console-hub-entry` Rest plate. The status
  link uses the same launcher.
- `271a665` (step 10): removes the embedded Hub. This is 184 files and about 25,000 lines deleted,
  plus three dependencies. A boundary test guards the removal.

## Planned vs. shipped

Steps 9 and 10 shipped as planned. Step 9 has no project-click UI because Cockpit has no Projects
screen yet. PRODUCT.md records the pointer notes as not yet written, so project launch is
available through the module and preload only.

Step 11 ran on the working Windows profile, not a clean one, because Windows Sandbox is not
enabled. Cockpit ran from its packaged `win-unpacked` build rather than its installer. Migration
retry was not exercised by the packaged app because the real receipt already exists; unit tests
cover it.

## Checks run

| Check | Result |
|---|---|
| Console Hub typecheck, Vitest | clean, 645 passed |
| Console Hub delegation e2e: claude, codex, and agy Orchestrators, each with reviewed release and `/delegate` | 6/6 passed, using stub CLIs (no paid requests) |
| Console Hub cold project handoff, warm Workspace handoff | passed |
| Cockpit typecheck, Vitest (baseline 880 before removal) | clean, 305 passed, 1 skipped |
| Cockpit launch check, dev build, Console Hub absent | passed in 5 of 6 runs; the first run's error output was lost |
| Cross-repo URL contract (Cockpit builder against Hub parser) | 5/5 shapes accepted |
| Package inspection with positive controls | both packages clean |
| `verify-cutover.mjs`: installed Hub with packaged Cockpit | 9/9 passed |
| Silent uninstall, then reinstall | protocol key removed and restored; user data kept |

## Open items

- Merging and pushing either branch is still pending. Cockpit's `design/cockpit-shape` working
  tree still has its own uncommitted edits, including `second-brain/_internal/paint.ts`.
- Console Hub registers seven `skills:*` handlers, but its preload exposes only
  `skills:codexModels`, so the other six handlers and the `skills:event` channel have no caller.
- Console Hub re-logs the migration receipt's skipped entries on every launch.
