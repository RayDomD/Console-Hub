import type { RecipeId } from '../../../../../shared/recipes'
import { RECIPES } from '../../../../../shared/recipes'
import type { FanLifecycle, SlotStatus } from '../../../../../shared/fan'

export interface QuestionFanPlateFixture {
  name: string
  attrs: Record<string, string>
  expected: 'pass' | 'fail'
}

/**
 * The workspace belongs to the fan, not to a slot: `none` when unset, `set` once
 * a valid path was accepted, `invalid` while the last typed path was rejected.
 * `absent` is reserved for the closed plate, where there is no workspace control
 * to report on at all.
 */
export type WorkspaceVerifyState = 'absent' | 'none' | 'set' | 'invalid'
export type DelegationVerifyState = 'absent' | 'held' | 'degraded' | 'fixed'

export interface SlotPhaseVerifyState {
  id: string
  phase: SlotStatus['phase']
}

const VERIFY_LIFECYCLES = [
  'idle', 'delegating', 'held', 'workers', 'synthesis', 'done', 'unscored', 'stopped', 'interrupted'
]
const VERIFY_DELEGATION_STATES = [
  'absent', 'held', 'degraded', 'fixed'
]
const VERIFY_SLOT_PHASES = [
  'idle', 'running', 'completed', 'process_crash', 'quota', 'stream_invalid', 'stopped'
]

export function questionFanVerifyAttrs(
  open: boolean,
  slotCount: number,
  workspaceState: WorkspaceVerifyState = 'none',
  recipeId: RecipeId | null = null,
  recipeAvailable = true,
  lifecycle: FanLifecycle = 'idle',
  delegation: DelegationVerifyState = 'absent',
  slotPhases: readonly SlotPhaseVerifyState[] = Array.from(
    { length: slotCount },
    (_, index) => ({ id: `slot-${index + 1}`, phase: 'idle' })
  )
): Record<string, string> {
  return {
    'data-verify-unit': 'QuestionFanPlate',
    'data-verify-open': String(open),
    'data-verify-controls': open ? 'live' : 'absent',
    // The causal spine per DESIGN.md's Console Hub section. ADR 0049 replaced
    // the Ask box and the Delegation panel with the terminal, and the result now
    // returns into that same transcript rather than to a panel of its own.
    'data-verify-main-order': open ? 'stage terminal streams' : '',
    'data-verify-slot-count': String(slotCount),
    'data-verify-workspace': open ? workspaceState : 'absent',
    'data-verify-recipe': open ? (recipeId ?? 'none') : 'absent',
    'data-verify-recipe-available': open ? String(recipeAvailable) : 'absent',
    'data-verify-lifecycle': open ? lifecycle : 'absent',
    'data-verify-delegation': open ? delegation : 'absent',
    'data-verify-slot-phases': open
      ? slotPhases.map((slot) => `${slot.id}:${slot.phase}`).join(' ')
      : 'absent'
  }
}

export const fixtures: QuestionFanPlateFixture[] = [
  {
    name: 'closed',
    attrs: questionFanVerifyAttrs(false, 0),
    expected: 'pass'
  },
  {
    name: 'open-with-a-full-fan',
    attrs: questionFanVerifyAttrs(true, 6),
    expected: 'pass'
  },
  {
    name: 'invalid-inert-fan-controls',
    attrs: {
      ...questionFanVerifyAttrs(true, 2),
      'data-verify-controls': 'inert'
    },
    expected: 'fail'
  },
  {
    name: 'open-with-a-set-workspace',
    attrs: questionFanVerifyAttrs(true, 2, 'set'),
    expected: 'pass'
  },
  {
    name: 'invalid-open-plate-with-no-workspace-state',
    attrs: {
      ...questionFanVerifyAttrs(true, 2),
      'data-verify-workspace': 'absent'
    },
    expected: 'fail'
  },
  {
    name: 'open-with-a-selected-recipe',
    attrs: questionFanVerifyAttrs(true, 2, 'none', 'synthesize', true),
    expected: 'pass'
  },
  {
    name: 'open-with-an-unavailable-recipe',
    attrs: questionFanVerifyAttrs(true, 1, 'none', 'explore', false),
    expected: 'pass'
  },
  {
    name: 'invalid-recipe-not-one-of-the-seven',
    attrs: {
      ...questionFanVerifyAttrs(true, 2),
      'data-verify-recipe': 'bogus'
    },
    expected: 'fail'
  },
  {
    name: 'invalid-lifecycle',
    attrs: {
      ...questionFanVerifyAttrs(true, 2),
      'data-verify-lifecycle': 'waiting'
    },
    expected: 'fail'
  },
  {
    name: 'invalid-delegation-state',
    attrs: {
      ...questionFanVerifyAttrs(true, 2),
      'data-verify-delegation': 'split'
    },
    expected: 'fail'
  },
  {
    name: 'invalid-missing-slot-phase',
    attrs: {
      ...questionFanVerifyAttrs(true, 2),
      'data-verify-slot-phases': 'w1:idle'
    },
    expected: 'fail'
  }
]

export const invariants = [
  {
    description: 'The plate identifies its verification unit.',
    check: (attrs: Record<string, string>) =>
      attrs['data-verify-unit'] === 'QuestionFanPlate'
  },
  {
    description: 'An open plate exposes live fan controls.',
    check: (attrs: Record<string, string>) =>
      attrs['data-verify-open'] !== 'true' || attrs['data-verify-controls'] === 'live'
  },
  {
    description: 'An open main column keeps the causal reading order.',
    check: (attrs: Record<string, string>) =>
      attrs['data-verify-open'] !== 'true'
      || attrs['data-verify-main-order'] === 'stage terminal streams'
  },
  {
    description: 'The reported slot count is a non-negative integer.',
    check: (attrs: Record<string, string>) => {
      const count = Number(attrs['data-verify-slot-count'])
      return Number.isInteger(count) && count >= 0
    }
  },
  {
    description: 'An open plate always reports a real workspace state, readable whether or not one is set.',
    check: (attrs: Record<string, string>) =>
      attrs['data-verify-open'] !== 'true'
      // Absent is not one of the three states: an open plate reporting nothing fails this.
      || ['none', 'set', 'invalid'].includes(attrs['data-verify-workspace'] ?? '')
  },
  {
    description: 'An open plate reports its selected Recipe as one of the seven, or none.',
    check: (attrs: Record<string, string>) =>
      attrs['data-verify-open'] !== 'true'
      || attrs['data-verify-recipe'] === 'none'
      || RECIPES.some((recipe) => recipe.id === attrs['data-verify-recipe'])
  },
  {
    description: 'An open plate reports Recipe availability as a plain boolean.',
    check: (attrs: Record<string, string>) =>
      attrs['data-verify-open'] !== 'true'
      || ['true', 'false'].includes(attrs['data-verify-recipe-available'] ?? '')
  },
  {
    description: 'An open plate reports the live fan lifecycle.',
    check: (attrs: Record<string, string>) =>
      attrs['data-verify-open'] !== 'true'
      || VERIFY_LIFECYCLES.includes(attrs['data-verify-lifecycle'] ?? '')
  },
  {
    description: 'An open plate reports whether delegation is absent, held, degraded, or fixed.',
    check: (attrs: Record<string, string>) =>
      attrs['data-verify-open'] !== 'true'
      || VERIFY_DELEGATION_STATES.includes(attrs['data-verify-delegation'] ?? '')
  },
  {
    description: 'An open plate exposes one phase for every arranged slot.',
    check: (attrs: Record<string, string>) => {
      const slotCount = Number(attrs['data-verify-slot-count'])
      const phases = attrs['data-verify-slot-phases']?.split(' ') ?? []
      return attrs['data-verify-open'] !== 'true'
        || (phases.length === slotCount && phases.every((phase) => {
        const [slotId, slotPhase] = phase.split(':')
        return slotId !== undefined && slotId.length > 0
          && VERIFY_SLOT_PHASES.includes(slotPhase ?? '')
        }))
    }
  }
]
