import { describe, expect, it } from 'vitest'
import { defaultArrangement, validArrangement } from './arrangement'

const EXECUTORS = {
  claude: { model: 'sonnet', effort: 'medium' },
  codex: { model: 'gpt-5.6-terra', effort: 'medium' }
}

describe('defaultArrangement', () => {
  it('opens on the executors defaults rather than on a second literal', () => {
    const slots = defaultArrangement(EXECUTORS)
    for (const slot of slots) {
      expect(slot.model).toBe(EXECUTORS[slot.vendor as 'claude' | 'codex'].model)
      expect(slot.effort).toBe(EXECUTORS[slot.vendor as 'claude' | 'codex'].effort)
    }
  })

  it('is a shape the machine accepts', () => {
    expect(validArrangement(defaultArrangement(EXECUTORS))).toEqual(defaultArrangement(EXECUTORS))
  })

  it('spreads its workers across both vendors', () => {
    const vendors = defaultArrangement(EXECUTORS)
      .filter((slot) => slot.role === 'worker')
      .map((slot) => slot.vendor)
    expect(new Set(vendors).size).toBe(2)
  })

  it('leaves a slot naming nothing where the executors block names nothing', () => {
    const slots = defaultArrangement({ claude: {}, codex: {} })
    expect(slots.every((slot) => slot.model === undefined && slot.effort === undefined)).toBe(true)
  })
})

describe('validArrangement', () => {
  const valid = defaultArrangement(EXECUTORS)

  it('accepts a stored arrangement that still holds', () => {
    expect(validArrangement(valid)).toEqual(valid)
  })

  it('rejects anything that is not a list of slots', () => {
    expect(validArrangement(undefined)).toBeUndefined()
    expect(validArrangement(null)).toBeUndefined()
    expect(validArrangement('slots')).toBeUndefined()
    expect(validArrangement({ slots: valid })).toBeUndefined()
    expect(validArrangement([1, 2])).toBeUndefined()
  })

  it('rejects a vendor the harness cannot spawn', () => {
    const stale = valid.map((slot) => ({ ...slot, vendor: 'google' }))
    expect(validArrangement(stale)).toBeUndefined()
  })

  it('accepts a stored AGY slot because the harness can spawn it', () => {
    const stored = valid.map((slot, index) => index === 0 ? { ...slot, vendor: 'agy' } : slot)
    expect(validArrangement(stored)).toEqual(stored)
  })

  it('rejects duplicate slot ids, which the machine refuses at enter', () => {
    const duplicated = [...valid, { ...valid[1], id: 'w1' }]
    expect(validArrangement(duplicated)).toBeUndefined()
  })

  it('rejects a worker count outside two to five', () => {
    const workers = valid.filter((slot) => slot.role === 'worker')
    const others = valid.filter((slot) => slot.role !== 'worker')
    expect(validArrangement([...others, workers[0]])).toBeUndefined()
    const six = Array.from({ length: 6 }, (_, i) => ({ ...workers[0], id: `w${i + 1}` }))
    expect(validArrangement([...others, ...six])).toBeUndefined()
  })

  it('rejects an arrangement without exactly one orchestrator', () => {
    expect(validArrangement(valid.filter((slot) => slot.role !== 'orchestrator'))).toBeUndefined()
    expect(validArrangement([...valid, { ...valid[0], id: 'a2', role: 'orchestrator' }]))
      .toBeUndefined()
  })

  it('keeps a slot that names nothing, so it launches on its vendor defaults', () => {
    const bare = valid.map(({ id, role, vendor }) => ({ id, role, vendor }))
    expect(validArrangement(bare)).toEqual(bare)
  })

  it('drops keys a stored file added, rather than passing them into the machine', () => {
    const smuggled = valid.map((slot) => ({ ...slot, scope: 'CODE', extra: true }))
    expect(validArrangement(smuggled)).toEqual(valid)
  })
})
