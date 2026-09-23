import type { RecipeId } from '../../../../../shared/recipes'
import type { WorkspaceTreeListing } from '../../../../../shared/workspace-tree'

export type TreeLevels = Readonly<Record<string, WorkspaceTreeListing>>

export type StageContent = 'prompt' | 'console' | 'fan'

export type EscapeAction = 'pass-to-terminal' | 'return-to-rest'

// Terminal programs own repeated Escape too, including double-Escape to clear input.
export function escapeActionFor(terminalFocused: boolean): EscapeAction {
  return terminalFocused ? 'pass-to-terminal' : 'return-to-rest'
}

/**
 * What the stage renders for the selected Recipe.
 *
 * The console is pulled out by name because its runtime is a pty, not a fan: it
 * is a plate on this stage rather than an overlay over the app (ADR 0018). Every
 * other Recipe still goes to the fan plate, which owns the "not built yet"
 * message for the five without a runtime - moving that message here would split
 * one piece of copy across two modules.
 */
export function stageContentFor(recipe: RecipeId | null): StageContent {
  if (recipe === null) return 'prompt'
  return recipe === 'console' ? 'console' : 'fan'
}

export function toggleOpenLevel(openLevels: readonly string[], path: string): string[] {
  return openLevels.includes(path)
    ? openLevels.filter((level) => level !== path)
    : [...openLevels, path]
}

export function mergeTreeLevel(levels: TreeLevels, listing: WorkspaceTreeListing): TreeLevels {
  return { ...levels, [listing.path]: listing }
}

export function indentForPath(path: string): number {
  const treeInset = 8
  const levelIndent = 16
  return treeInset + Math.max(0, path.split('/').length - 1) * levelIndent
}
