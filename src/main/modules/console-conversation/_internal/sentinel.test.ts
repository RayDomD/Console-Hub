import { describe, expect, it } from 'vitest'
import { sentinelFor, sentinelObserved, withSentinelInstruction } from './sentinel'

describe('sentinelFor', () => {
  it('is an exact, target-specific literal', () => {
    expect(sentinelFor('T2')).toBe('CONSOLE_DONE:T2')
    expect(sentinelFor('T2')).not.toBe(sentinelFor('T3'))
  })
})

describe('withSentinelInstruction', () => {
  it('appends the instruction after the task, carrying the same literal sentinelFor produces', () => {
    const result = withSentinelInstruction('do the research', 'T2')
    expect(result.startsWith('do the research')).toBe(true)
    expect(result).toContain(sentinelFor('T2'))
  })
})

describe('sentinelObserved', () => {
  it('is true once the exact line appears anywhere in the output', () => {
    expect(sentinelObserved('some output\nCONSOLE_DONE:T2\nmore', 'T2')).toBe(true)
  })

  it('is false before it appears, and false for a different target', () => {
    expect(sentinelObserved('still working...', 'T2')).toBe(false)
    expect(sentinelObserved('CONSOLE_DONE:T3', 'T2')).toBe(false)
  })
})
