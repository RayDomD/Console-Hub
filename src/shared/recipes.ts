/**
 * The seven Hub Recipes, shared by main, preload and renderer.
 *
 * Data only - nothing here executes and nothing here runs a Recipe. It is the
 * fixed shape the Hub shell's chooser and the run plate's header both read, so
 * the rail and the plate cannot disagree about what a Recipe promises.
 *
 * Settled by ADR 0021; each Recipe's guarantee comes from its own ADR, 0022
 * through 0028.
 */

export type RecipeId =
  | 'explore'
  | 'synthesize'
  | 'debate'
  | 'coordinate'
  | 'validate'
  | 'direct'
  | 'console'

/**
 * What a Recipe needs from every slot it runs. A slot whose vendor adapter has
 * not proven the capability makes the Recipe unavailable rather than silently
 * weakening it (ADR 0038).
 */
export type RecipeCapability =
  | 'read-only'
  | 'streaming'
  | 'writing'
  | 'session'
  | 'telemetry'
  | 'interactive'

export interface Recipe {
  id: RecipeId
  /** The chooser's label and the run plate's heading. */
  title: string
  /** The one-word guarantee shown beside the title. Never a status. */
  badge: string
  /** One sentence naming what the Recipe does, from its ADR. */
  description: string
  /**
   * The ordered stage strip. Names are the plate's, not the machine's: the
   * stage strip is a description of the choreography, and the only Recipe with
   * a running machine behind it is the orchestrated fan.
   */
  stages: readonly string[]
  /** Fewest slots the Recipe accepts. Below this it is unavailable, never degraded. */
  minSlots: number
  /** Most slots the Recipe uses. A larger Stack leaves the surplus inactive. */
  maxSlots: number
  capabilities: readonly RecipeCapability[]
}

/**
 * Fixed vertical order, matching the rail in the explorer mockup. Console sits
 * last because it is the one entry that is not an observed agent run at all
 * (ADR 0028).
 */
export const RECIPES: readonly Recipe[] = [
  {
    id: 'explore',
    title: 'Explore',
    badge: 'READ ONLY',
    description: 'The same ask to every slot. Independent answers, no synthesis.',
    stages: ['ASK', 'INDEPENDENT', 'COMPLETE', 'READ'],
    minSlots: 2,
    maxSlots: 5,
    capabilities: ['read-only', 'streaming', 'telemetry']
  },
  {
    id: 'synthesize',
    title: 'Synthesize',
    badge: 'ONE WRITER',
    description:
      'Independent proposals, then one fresh attributed merge in an isolated worktree.',
    stages: ['PROPOSE', 'HOLD', 'MERGE', 'SYNC'],
    minSlots: 2,
    maxSlots: 5,
    capabilities: ['read-only', 'streaming', 'writing', 'telemetry']
  },
  {
    id: 'debate',
    title: 'Debate',
    badge: 'READ ONLY',
    description: 'Attributed rounds that close with positions and no judge.',
    stages: ['OPEN', 'ROUND 02', 'ROUND 03', 'CLOSE'],
    minSlots: 2,
    maxSlots: 5,
    capabilities: ['read-only', 'streaming', 'session', 'telemetry']
  },
  {
    id: 'coordinate',
    title: 'Coordinate',
    badge: 'WORKTREES',
    description:
      'A held dependency graph dispatches ready tasks into isolated worktrees.',
    stages: ['PROPOSE', 'HOLD DAG', 'EXECUTE', 'INTEGRATE'],
    minSlots: 2,
    maxSlots: 5,
    capabilities: ['read-only', 'streaming', 'writing', 'session', 'telemetry']
  },
  {
    id: 'validate',
    title: 'Validate',
    badge: 'GATE FIRST',
    description:
      'A fixed executable gate is written first, and a RED baseline drives bounded fix rounds.',
    stages: ['GATE', 'BASELINE', 'BUILD', 'GREEN'],
    // Exactly two: the Validator writes the gate and one Builder works against
    // it. More builders is Coordinate, not a bigger Validate (ADR 0026).
    minSlots: 2,
    maxSlots: 2,
    capabilities: ['streaming', 'writing', 'session', 'telemetry']
  },
  {
    id: 'direct',
    title: 'Direct',
    badge: 'ONE SESSION',
    description: 'One persistent harnessed agent session, resumable until reset.',
    stages: ['ASK', 'TURN', 'RESULT'],
    minSlots: 1,
    maxSlots: 1,
    capabilities: ['streaming', 'session', 'telemetry']
  },
  {
    id: 'console',
    title: 'Console',
    badge: 'INTERACTIVE',
    description: 'An interactive pty you operate yourself. No turns, no telemetry.',
    stages: ['OPEN', 'ATTACHED'],
    minSlots: 1,
    maxSlots: 1,
    capabilities: ['interactive']
  }
]

export function recipeById(id: RecipeId): Recipe {
  const found = RECIPES.find((recipe) => recipe.id === id)
  // The union makes this unreachable through the type system, but RECIPES is
  // data and a future edit could drop an entry without the compiler noticing.
  if (found === undefined) throw new Error(`unknown recipe: ${id}`)
  return found
}

/**
 * Why a Recipe cannot run against the current Stack, or `undefined` when it
 * can. The reason is shown on the disabled choice: Console Hub never drops a slot
 * or weakens a guarantee to make a Recipe fit (ADR 0038).
 */
export function recipeUnavailableReason(
  recipe: Recipe,
  slotCount: number
): string | undefined {
  if (slotCount < recipe.minSlots) {
    return recipe.minSlots === 1
      ? 'needs a slot'
      : `needs ${recipe.minSlots} slots, the Stack has ${slotCount}`
  }
  return undefined
}
