import { describe, expect, it } from 'vitest'
import type { SlotConfig } from '../../../../../shared/fan'
import type { FanState } from '../../../../../shared/fan'
import {
  DEFAULT_SLOTS,
  FAN_VENDORS,
  MAX_WORKERS,
  MIN_WORKERS,
  addWorkerSlot,
  agentRim,
  canAddWorker,
  canRemoveWorker,
  currentStageIndex,
  removeWorkerSlot,
  effortOptionLabel,
  effortOptions,
  modelOptions,
  recipeHasRuntime,
  withSlotVendor,
  withSlotSettings,
  buildFanConfig,
  effortGlyphs,
  lifecycleLabel,
  runNotice,
  slotConventions,
  slotMetrics,
  workerSlots
} from './model'

describe('question fan sidebar slots', () => {
  it('shows the shape of a fan: workers and one orchestrator', () => {
    const roles = DEFAULT_SLOTS.map((slot) => slot.role)
    expect(roles.filter((role) => role === 'orchestrator')).toHaveLength(1)

    const workers = roles.filter((role) => role === 'worker').length
    expect(workers).toBeGreaterThanOrEqual(2)
    expect(workers).toBeLessThanOrEqual(5)
  })

  it('gives every slot a stable unique id', () => {
    const ids = DEFAULT_SLOTS.map((slot) => slot.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('slot conventions', () => {
  it.each([
    ['claude', 'C:\\work', 'USER · CLAUDE.md · PROJECT · CLAUDE.md'],
    ['codex', 'C:\\work', 'USER · AGENTS.md · PROJECT · AGENTS.md'],
    ['agy', 'C:\\work', 'USER · GEMINI.md · PROJECT · GEMINI.md'],
    ['codex', undefined, 'USER · AGENTS.md · PROJECT · NONE']
  ] as const)('makes %s conventions readable for workspace %s', (vendor, workspace, expected) => {
    expect(slotConventions(vendor, workspace)).toBe(expected)
  })
})

describe('agent rim', () => {
  it('keys the rim to vendor, so two slots on one vendor share a rim', () => {
    const claude = DEFAULT_SLOTS.filter((slot) => slot.vendor === 'claude')
    expect(claude.length).toBeGreaterThan(1)
    expect(new Set(claude.map((slot) => agentRim(slot.vendor))).size).toBe(1)
  })

  it('gives each spawnable executor its rim', () => {
    expect(agentRim('claude')).toBe('claude')
    expect(agentRim('codex')).toBe('codex')
  })

  it('offers AGY with its existing third rim', () => {
    expect(agentRim('agy')).toBe('agy')
    expect(FAN_VENDORS).toContain('agy')
  })

  it('gives an unrecognised vendor no rim at all, per ADR 0048 - not a placeholder colour', () => {
    expect(agentRim('xai')).toBeUndefined()
    expect(agentRim('')).toBeUndefined()
  })

  it('does not care about case, since vendor is an open string', () => {
    expect(agentRim('Claude')).toBe('claude')
  })

  it('is identity, not status: agentRim takes no phase, so a vendor cannot get a different rim on run, completion, fault, hold or queue', () => {
    expect(agentRim('claude')).toBe(agentRim('claude'))
    expect(agentRim('codex')).toBe(agentRim('codex'))
  })
})

describe('recipe stage', () => {
  it("maps the orchestrated fan's lifecycle onto synthesize's stage list", () => {
    expect(currentStageIndex('synthesize', 'delegating')).toBe(0) // PROPOSE
    expect(currentStageIndex('synthesize', 'held')).toBe(1) // HOLD
    expect(currentStageIndex('synthesize', 'workers')).toBe(2) // MERGE
    expect(currentStageIndex('synthesize', 'synthesis')).toBe(3) // SYNC
  })

  it('has no current stage while idle or before a run exists', () => {
    expect(currentStageIndex('synthesize', 'idle')).toBeUndefined()
    expect(currentStageIndex('synthesize', undefined)).toBeUndefined()
  })

  it('has no current stage for any Recipe but synthesize, because nothing is running', () => {
    expect(currentStageIndex('explore', 'delegating')).toBeUndefined()
    expect(currentStageIndex('direct', 'held')).toBeUndefined()
  })
})

describe('recipe runtime', () => {
  it('has a runtime for the orchestrated fan and the console', () => {
    expect(recipeHasRuntime('synthesize')).toBe(true)
    expect(recipeHasRuntime('console')).toBe(true)
  })

  it('has no runtime for the other five Recipes yet', () => {
    expect(recipeHasRuntime('explore')).toBe(false)
    expect(recipeHasRuntime('debate')).toBe(false)
    expect(recipeHasRuntime('coordinate')).toBe(false)
    expect(recipeHasRuntime('validate')).toBe(false)
    expect(recipeHasRuntime('direct')).toBe(false)
  })
})

describe('effort glyphs', () => {
  it('renders effort as an achromatic four-cell run', () => {
    expect(effortGlyphs('low')).toBe('▮▯▯▯')
    expect(effortGlyphs('medium')).toBe('▮▮▯▯')
    expect(effortGlyphs('high')).toBe('▮▮▮▯')
    expect(effortGlyphs('xhigh')).toBe('▮▮▮▮')
    expect(effortGlyphs('max')).toBe('▮▮▮▮')
  })

  it('reads a slot naming no effort as its vendor default, not as empty', () => {
    expect(effortGlyphs(undefined)).toBe('▮▮▯▯')
    expect(effortGlyphs('nonsense')).toBe('▮▮▯▯')
  })
})

describe('question fan run model', () => {
  it('builds a fan config from the displayed slots and preserves the question verbatim', () => {
    const question = '  Should this stay exactly as typed?  '

    expect(buildFanConfig(question)).toEqual({
      slots: [...DEFAULT_SLOTS],
      question
    })
  })

  it('selects only worker slots for answer cards', () => {
    expect(workerSlots(DEFAULT_SLOTS).map((slot) => slot.id)).toEqual(['w1', 'w2', 'w3', 'w4'])
  })

  it('renders lifecycle names through a lookup with a fallback', () => {
    expect(lifecycleLabel('criteria')).toBe('Criteria')
    expect(lifecycleLabel('held')).toBe('Held')
    expect(lifecycleLabel('future-state')).toBe('Future state')
  })

  it('states plainly when stream metrics were not supplied', () => {
    expect(slotMetrics(undefined)).toEqual({
      throughput: 'Throughput unavailable',
      tokens: 'Tokens unavailable',
      context: undefined
    })
    expect(slotMetrics({ throughput: 64, inputTokens: 120, outputTokens: 80 })).toEqual({
      throughput: '64 tps',
      tokens: '80 out',
      context: '120 in'
    })
  })

  it('headlines output tokens, because that is the part the question caused', () => {
    // codex reports its whole prompt in input_tokens while claude reports the
    // same bulk as a cache read. Summing the two made a 33k reading sit beside
    // a 961 reading for the same question - the vendors' harness overhead, not
    // their spend.
    expect(slotMetrics({ outputTokens: 900, inputTokens: 33000 }).tokens).toBe('900 out')
    expect(slotMetrics({ inputTokens: 33000 }).tokens).toBe('Tokens unavailable')
  })

  it('breaks the input side out, cached input included', () => {
    expect(slotMetrics({ inputTokens: 120, cachedInputTokens: 4100 }).context)
      .toBe('120 in · 4,100 cached')
    expect(slotMetrics({ outputTokens: 80 }).context).toBeUndefined()
  })

  it('rounds throughput for display, leaving the measured value alone', () => {
    expect(slotMetrics({ throughput: 39.52973249275856 }).throughput).toBe('40 tps')
    expect(slotMetrics({ throughput: 64 }).throughput).toBe('64 tps')
    expect(slotMetrics({ throughput: 0.4 }).throughput).toBe('0 tps')
  })

  it('counts completed workers from live fan state', () => {
    const state = {
      slots: {
        w1: { phase: 'completed', text: 'one' },
        w2: { phase: 'running', partialText: 'two' },
        w3: { phase: 'completed', text: 'three' },
        w4: { phase: 'idle' }
      }
    } as Pick<FanState, 'slots'>

    expect(workerSlots(DEFAULT_SLOTS).filter((slot) => state.slots[slot.id]?.phase === 'completed'))
      .toHaveLength(2)
  })
})

describe('buildFanConfig', () => {
  it('carries an explicit delegation steer, trimmed', () => {
    expect(buildFanConfig('why?', '  split by topic  ').delegation).toBe('split by topic')
  })

  it('omits the steer entirely when the box is empty', () => {
    // The orchestrator decides the split either way (ADR 0020), so an empty box
    // is a run with no steer rather than a run that cannot start.
    expect(buildFanConfig('why?').delegation).toBeUndefined()
    expect(buildFanConfig('why?', '   ').delegation).toBeUndefined()
  })

  it('carries the question and the full slot arrangement', () => {
    const config = buildFanConfig('why?')
    expect(config.question).toBe('why?')
    expect(config.slots).toHaveLength(DEFAULT_SLOTS.length)
  })

  it('carries the workspace fixed at Enter, and names none when there is none', () => {
    expect(buildFanConfig('why?').workspace).toBeUndefined()
    expect(buildFanConfig('why?', '', DEFAULT_SLOTS, 'C:\\FIles\\repo').workspace)
      .toBe('C:\\FIles\\repo')
  })
})

describe('run notice', () => {
  const at = (lifecycle: FanState['lifecycle']): FanState =>
    ({ lifecycle } as FanState)

  it('says nothing while a run is live', () => {
    expect(runNotice(undefined)).toBeUndefined()
    expect(runNotice(at('delegating'))).toBeUndefined()
    expect(runNotice(at('held'))).toBeUndefined()
    expect(runNotice(at('workers'))).toBeUndefined()
    expect(runNotice(at('synthesis'))).toBeUndefined()
    expect(runNotice(at('done'))).toBeUndefined()
  })

  it('explains an unscored run without claiming a comparison happened', () => {
    const notice = runNotice(at('unscored'))
    expect(notice).toBeDefined()
    expect(notice).toMatch(/no comparison ran/i)
    expect(notice).not.toMatch(/compar(ed|ison) (is |was )?(ready|complete)/i)
  })

  it('says a stopped run does not resume', () => {
    expect(runNotice(at('stopped'))).toMatch(/does not resume/i)
  })

  it('says an interrupted run does not resume either', () => {
    expect(runNotice(at('interrupted'))).toMatch(/does not resume/i)
  })
})

describe('slot vendors', () => {
  it('names only vendors the harness can actually spawn', () => {
    for (const slot of DEFAULT_SLOTS) {
      expect(FAN_VENDORS).toContain(slot.vendor)
    }
  })
})

describe('model options', () => {
  it("offers claude's closed set", () => {
    expect(modelOptions('claude', ['gpt-5.6-terra'])).toEqual(['haiku', 'sonnet', 'opus', 'fable'])
  })

  it("offers codex the config's roster, since it is not a set the app can name", () => {
    expect(modelOptions('codex', ['gpt-5.6-terra', 'gpt-5.5'], 'gpt-5.6-terra'))
      .toEqual(['gpt-5.6-terra', 'gpt-5.5'])
  })

  it('never offers one vendor a model belonging to the other', () => {
    expect(modelOptions('claude', ['gpt-5.6-terra'])).not.toContain('gpt-5.6-terra')
    expect(modelOptions('codex', ['gpt-5.6-terra'])).not.toContain('opus')
  })

  it('offers AGY the live roster rather than another vendor\'s models', () => {
    expect(modelOptions('agy', ['gpt-5.6-terra'], undefined, ['gemini-3.7-flash-high']))
      .toEqual(['gemini-3.7-flash-high'])
  })

  it('shows the model a slot already names even when the roster has yet to load', () => {
    expect(modelOptions('codex', [], 'gpt-5.6-sol')).toEqual(['gpt-5.6-sol'])
  })

  it('offers nothing extra for a slot naming no model at all', () => {
    expect(modelOptions('codex', [])).toEqual([])
  })
})

describe('effort options', () => {
  it('stops codex at high and lets claude go to max', () => {
    expect(effortOptions('codex')).toEqual(['low', 'medium', 'high'])
    expect(effortOptions('claude')).toContain('max')
  })

  it('reads an effort as its glyph run and its name', () => {
    expect(effortOptionLabel('high')).toBe('▮▮▮▯ HIGH')
  })
})

describe('editing a slot', () => {
  it('switches the named slot to a vendor default rather than keeping its old model', () => {
    const next = withSlotVendor(DEFAULT_SLOTS, 'w1', 'agy')

    expect(next.find((slot) => slot.id === 'w1')).toMatchObject({
      vendor: 'agy',
      model: undefined,
      effort: 'high'
    })
    expect(next.find((slot) => slot.id === 'w2')).toEqual(DEFAULT_SLOTS[1])
  })

  it('drops an effort the selected vendor does not accept', () => {
    const claudeMax = withSlotSettings(DEFAULT_SLOTS, 'w1', { effort: 'max' })

    expect(withSlotVendor(claudeMax, 'w1', 'agy').find((slot) => slot.id === 'w1'))
      .toMatchObject({ vendor: 'agy', model: undefined, effort: undefined })
  })

  it('changes only the slot named', () => {
    const next = withSlotSettings(DEFAULT_SLOTS, 'w1', { model: 'haiku' })
    expect(next.find((slot) => slot.id === 'w1')?.model).toBe('haiku')
    expect(next.filter((slot) => slot.id !== 'w1'))
      .toEqual(DEFAULT_SLOTS.filter((slot) => slot.id !== 'w1'))
  })

  it('leaves the original arrangement alone', () => {
    const before = DEFAULT_SLOTS.map((slot) => ({ ...slot }))
    withSlotSettings(DEFAULT_SLOTS, 'w1', { effort: 'max' })
    expect(DEFAULT_SLOTS).toEqual(before)
  })

  it('keeps a slot that names nothing naming nothing, so it launches on vendor defaults', () => {
    const bare = [{ id: 'w1', role: 'worker' as const, vendor: 'claude' }]
    const next = withSlotSettings(bare, 'w2', { model: 'opus' })
    expect(next).toEqual(bare)
  })

  it('is what the run is built from, so an edit reaches the machine', () => {
    const edited = withSlotSettings(DEFAULT_SLOTS, 'w1', { model: 'haiku' })
    expect(buildFanConfig('why?', '', edited).slots).toEqual(edited)
  })
})

describe('slot count', () => {
  function withWorkers(count: number): SlotConfig[] {
    const workers = Array.from({ length: count }, (_, i) => ({
      id: `w${i + 1}`,
      role: 'worker' as const,
      vendor: 'claude'
    }))
    return [
      ...workers,
      { id: 'orchestrator', role: 'orchestrator', vendor: 'claude' }
    ]
  }

  it('adds up to five workers and no further', () => {
    expect(canAddWorker(withWorkers(4))).toBe(true)
    expect(canAddWorker(withWorkers(MAX_WORKERS))).toBe(false)
    expect(workerSlots(addWorkerSlot(withWorkers(MAX_WORKERS)))).toHaveLength(MAX_WORKERS)
  })

  it('removes down to two workers and no further', () => {
    expect(canRemoveWorker(withWorkers(3))).toBe(true)
    expect(canRemoveWorker(withWorkers(MIN_WORKERS))).toBe(false)
    expect(workerSlots(removeWorkerSlot(withWorkers(MIN_WORKERS), 'w1'))).toHaveLength(MIN_WORKERS)
  })

  it('never removes the criteria slot or the orchestrator', () => {
    const slots = withWorkers(4)
    expect(removeWorkerSlot(slots, 'orchestrator')).toEqual(slots)
    expect(removeWorkerSlot(slots, 'criteria')).toEqual(slots)
  })

  it('starts a new slot on its vendor defaults, naming no model and no effort', () => {
    const added = addWorkerSlot(withWorkers(2))
    const fresh = workerSlots(added).at(-1)
    expect(fresh?.model).toBeUndefined()
    expect(fresh?.effort).toBeUndefined()
  })

  it('balances a new slot onto the vendor the fan is using less', () => {
    const added = addWorkerSlot(withWorkers(2))
    expect(workerSlots(added).at(-1)?.vendor).toBe('codex')
  })

  it('keeps the orchestrator last, so the arrangement stays in shape', () => {
    const added = addWorkerSlot(withWorkers(3))
    expect(added.at(-1)?.role).toBe('orchestrator')
    expect(added.at(0)?.role).toBe('worker')
  })

  it('gives every slot a unique id, reusing one freed by a removal', () => {
    const removed = removeWorkerSlot(withWorkers(4), 'w2')
    const added = addWorkerSlot(removed)
    const ids = added.map((slot) => slot.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('w2')
  })

  it('leaves the arrangement it was given alone', () => {
    const before = withWorkers(3)
    const snapshot = before.map((slot) => ({ ...slot }))
    addWorkerSlot(before)
    removeWorkerSlot(before, 'w1')
    expect(before).toEqual(snapshot)
  })
})
