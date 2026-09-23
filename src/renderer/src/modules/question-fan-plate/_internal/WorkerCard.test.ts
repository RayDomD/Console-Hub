import { describe, expect, it } from 'vitest'
import type { SlotStatus } from '../../../../../shared/fan'
import { isFaulted, keptText, statusLabel, slotText, slotUsage } from './WorkerCard'

describe('statusLabel', () => {
  it('renders idle with an empty glyph run', () => {
    expect(statusLabel(undefined)).toBe('▯▯▯▯ Idle')
    expect(statusLabel({ phase: 'idle' })).toBe('▯▯▯▯ Idle')
  })

  it('renders running with an empty glyph run', () => {
    expect(statusLabel({ phase: 'running' })).toBe('▯▯▯▯ Running')
  })

  it('renders completed with a full glyph run', () => {
    expect(statusLabel({ phase: 'completed', text: 'answer' })).toBe('▮▮▮▮ Done')
  })

  it('renders stopped as stopped, not as failed', () => {
    expect(statusLabel({ phase: 'stopped' })).toBe('▯▯▯▯ Stopped')
    expect(statusLabel({ phase: 'stopped' })).not.toMatch(/fail/i)
    expect(statusLabel({ phase: 'stopped' })).not.toMatch(/fault/i)
    expect(statusLabel({ phase: 'stopped' })).not.toMatch(/error/i)
  })

  it('renders process_crash distinctly as a crash', () => {
    const label = statusLabel({ phase: 'process_crash', message: 'segv' })
    expect(label).toBe('▯▮▯▮ Crash')
  })

  it('renders quota distinctly as quota exhausted', () => {
    const label = statusLabel({ phase: 'quota', message: 'rate limit' })
    expect(label).toBe('▯▮▯▮ Quota exhausted')
  })

  it('renders stream_invalid distinctly as invalid stream', () => {
    const label = statusLabel({ phase: 'stream_invalid', message: 'bad json' })
    expect(label).toBe('▯▮▯▮ Invalid stream')
  })

  it('gives every phase a distinct label', () => {
    const allStatuses: SlotStatus[] = [
      { phase: 'idle' },
      { phase: 'running' },
      { phase: 'completed', text: 'x' },
      { phase: 'process_crash' },
      { phase: 'quota' },
      { phase: 'stream_invalid' },
      { phase: 'stopped' }
    ]
    const labels = allStatuses.map((s) => statusLabel(s))
    expect(new Set(labels).size).toBe(labels.length)
  })
})

describe('slotText', () => {
  it('returns partial text while running', () => {
    expect(slotText({ phase: 'running', partialText: 'partial' })).toBe('partial')
  })

  it('returns empty string when running with no partial text', () => {
    expect(slotText({ phase: 'running' })).toBe('')
  })

  it('returns completed text', () => {
    expect(slotText({ phase: 'completed', text: 'final answer' })).toBe('final answer')
  })

  it('returns empty for idle and stopped', () => {
    expect(slotText(undefined)).toBe('')
    expect(slotText({ phase: 'idle' })).toBe('')
    expect(slotText({ phase: 'stopped' })).toBe('')
  })

  it('shows message for a crash', () => {
    expect(slotText({ phase: 'process_crash', message: 'OOM killed' })).toContain('OOM killed')
  })

  it('shows diagnostic output for a crash, labelled as diagnostic', () => {
    const text = slotText({
      phase: 'process_crash',
      message: 'OOM killed',
      diagnosticOutput: 'partial stdout before crash'
    })
    expect(text).toContain('OOM killed')
    expect(text).toContain('partial stdout before crash')
    expect(text.toLowerCase()).toContain('diagnostic')
  })

  it('shows message for quota exhausted', () => {
    expect(slotText({ phase: 'quota', message: 'rate limit exceeded' })).toContain('rate limit exceeded')
  })

  it('shows message for stream_invalid', () => {
    expect(slotText({ phase: 'stream_invalid', message: 'malformed JSON' })).toContain('malformed JSON')
  })

  it('shows raw output for stream_invalid, labelled as diagnostic', () => {
    const text = slotText({
      phase: 'stream_invalid',
      message: 'malformed JSON',
      rawOutput: '{truncated'
    })
    expect(text).toContain('malformed JSON')
    expect(text).toContain('{truncated')
    expect(text.toLowerCase()).toContain('diagnostic')
  })

  it('returns empty for faults with no message or diagnostic data', () => {
    expect(slotText({ phase: 'process_crash' })).toBe('')
    expect(slotText({ phase: 'quota' })).toBe('')
    expect(slotText({ phase: 'stream_invalid' })).toBe('')
  })
})

describe('isFaulted', () => {
  it('is true for the three fault phases', () => {
    expect(isFaulted({ phase: 'process_crash' })).toBe(true)
    expect(isFaulted({ phase: 'quota' })).toBe(true)
    expect(isFaulted({ phase: 'stream_invalid' })).toBe(true)
  })

  it('is false for non-fault phases', () => {
    expect(isFaulted(undefined)).toBe(false)
    expect(isFaulted({ phase: 'idle' })).toBe(false)
    expect(isFaulted({ phase: 'running' })).toBe(false)
    expect(isFaulted({ phase: 'completed', text: 'answer' })).toBe(false)
    expect(isFaulted({ phase: 'stopped' })).toBe(false)
  })
})

describe('slotUsage', () => {
  it('reports usage while the slot is still running', () => {
    expect(slotUsage({ phase: 'running', usage: { outputTokens: 120, throughput: 47 } }))
      .toEqual({ outputTokens: 120, throughput: 47 })
  })

  it('reports usage once the slot has completed', () => {
    expect(slotUsage({ phase: 'completed', text: 'answer', usage: { inputTokens: 9 } }))
      .toEqual({ inputTokens: 9 })
  })

  it('has nothing to report where the stream supplied nothing', () => {
    expect(slotUsage({ phase: 'running' })).toBeUndefined()
    expect(slotUsage({ phase: 'completed', text: 'answer' })).toBeUndefined()
    expect(slotUsage(undefined)).toBeUndefined()
    expect(slotUsage({ phase: 'quota' })).toBeUndefined()
  })
})

describe('keptText', () => {
  it('keeps the scrollback when a stopped slot carries no text', () => {
    expect(keptText({ phase: 'stopped' }, 'said before the stop')).toBe('said before the stop')
  })

  it('keeps the scrollback behind a fault that carries no diagnosis', () => {
    expect(keptText({ phase: 'quota' }, 'said before the quota ran out'))
      .toBe('said before the quota ran out')
  })

  it('prefers what the status carries over what is remembered', () => {
    expect(keptText({ phase: 'completed', text: 'final answer' }, 'partial')).toBe('final answer')
    expect(keptText({ phase: 'process_crash', message: 'segv' }, 'partial')).toContain('segv')
  })

  it('shows nothing for a slot that has not started', () => {
    expect(keptText(undefined, 'stale')).toBe('')
    expect(keptText({ phase: 'idle' }, 'stale')).toBe('')
  })
})
