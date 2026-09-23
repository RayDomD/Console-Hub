import { describe, expect, it } from 'vitest'
import { CONSOLE_LINEUP_MAX, canAddConsole, canRemoveConsole, nextConsoleLabel, consoleLaunchSpec } from './lineup'

describe('consoleLaunchSpec', () => {
  it.each(['codex', 'claude', 'agy'] as const)('starts %s in the chosen workspace', (agent) => {
    expect(consoleLaunchSpec(agent, 'C:\\work')).toEqual({ agent: { vendor: agent }, cwd: 'C:\\work' })
  })

  it('leaves a plain shell interactive and uses the configured default folder when blank', () => {
    expect(consoleLaunchSpec('shell', '   ')).toEqual({})
  })

  it('trims a workspace without interpreting shell syntax in its path', () => {
    expect(consoleLaunchSpec('claude', ' C:\\work & notes ')).toEqual({
      agent: { vendor: 'claude' }, cwd: 'C:\\work & notes'
    })
  })
})

describe('canAddConsole', () => {
  it('allows adding below the cap', () => {
    expect(canAddConsole(0)).toBe(true)
    expect(canAddConsole(CONSOLE_LINEUP_MAX - 1)).toBe(true)
  })

  it('refuses adding at or above the cap', () => {
    expect(canAddConsole(CONSOLE_LINEUP_MAX)).toBe(false)
    expect(canAddConsole(CONSOLE_LINEUP_MAX + 1)).toBe(false)
  })
})

describe('canRemoveConsole', () => {
  it('allows an empty lineup', () => {
    expect(canRemoveConsole(1)).toBe(true)
    expect(canRemoveConsole(0)).toBe(false)
  })

  it('allows removing above one', () => {
    expect(canRemoveConsole(2)).toBe(true)
    expect(canRemoveConsole(CONSOLE_LINEUP_MAX)).toBe(true)
  })
})

describe('nextConsoleLabel', () => {
  it('formats a counter as T<n>', () => {
    expect(nextConsoleLabel(1)).toBe('T1')
    expect(nextConsoleLabel(6)).toBe('T6')
  })
})
