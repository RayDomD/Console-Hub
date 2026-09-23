# Question fan plate

## What it does

Provides the movable question-fan surface and its left-docked sidebar. The plate reads the Hub's
selected Recipe (`useRecipeSelection`) and configures its own heading, badge, description and stage
strip from it, gating a Recipe the current Stack cannot satisfy or that has no runtime yet. With no
Recipe selected it reads as unconfigured, not broken. A question starts the fan verbatim, live state
restores and streams through the causal main column, and closing the plate stops pending work. The
sidebar shows the read-only fan slots, each carrying its vendor's identity rim (ADR 0048), and the
shared skills registry.

## Public interface

- `QuestionFanPlate` mounts the closed launcher and the open plate on the Rest surface.

## Non-goals

Later tickets handle recovery states, editing slots, and persisting slot arrangements. This module
does not auto-release a held run or duplicate the skills registry. It does not run any Recipe but the
orchestrated fan - the other six read as unavailable until their runtimes land.

## Dependencies

Uses `plate-layout` for the movable frame, `skills-plate` for `SkillsRegistry`, and
`recipe-selection` for `useRecipeSelection`. Recipe and slot shapes come from `Recipe` and
`SlotConfig` in the shared `recipes` and `fan` contracts, both frozen and read-only from here.

The displayed arrangement is a module-local constant, because there is nowhere yet to read a real
one: `DEFAULT_EXECUTORS` lives in main and is not exposed over IPC, and the persisted arrangement is
a later ticket. It is typed as `SlotConfig[]` so that ticket swaps the source rather than reshaping
the sidebar.
