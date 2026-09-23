# recipe-selection

The Hub's selected Recipe, held in one place.

The rail writes it and the run plate reads it. They are separate modules on opposite edges of the
Hub, so passing it as a prop would thread it through the shell's whole layout; a context is the
narrower seam.

## Public interface

- `RecipeSelectionProvider` — wraps the Hub. Nothing is selected until something selects it: ADR
  0021 says no Recipe is preselected, so `recipe` starts `null`.
- `useRecipeSelection()` — `{ recipe, select }`. `recipe` is a `RecipeId` or `null`.

## What it does not handle

- **What a Recipe means.** That is `src/shared/recipes.ts`, which is data and the authority.
- **Whether a Recipe can run.** The Stack gate is `recipeUnavailableReason`, called by whichever
  surface draws the choice.
- **Persistence.** Selection is per session by design; the Stack persists, the Recipe does not.

## Dependencies

`react`, and `RecipeId` from `src/shared/recipes.ts`.
