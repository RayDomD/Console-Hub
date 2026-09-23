import { describe, expect, it } from 'vitest'
import { parseConsoleDelegation } from './delegation'

const TARGETS = ['T1', 'T2', 'T3']

describe('parseConsoleDelegation', () => {
  it('gives each terminal its launch command and task written under its own heading', () => {
    const text = [
      'Splitting three ways.',
      '',
      '### T1 — claude',
      'Deep dive on Gemini 3.8.',
      '',
      '### T2 — codex',
      'Baseline on Gemini 3.7.',
      '',
      '### T3 — agy',
      'Synthesize both.'
    ].join('\n')

    expect(parseConsoleDelegation(text, TARGETS)).toEqual({
      assignments: [
        { targetId: 'T1', launch: 'claude', task: 'Deep dive on Gemini 3.8.' },
        { targetId: 'T2', launch: 'codex', task: 'Baseline on Gemini 3.7.' },
        { targetId: 'T3', launch: 'agy', task: 'Synthesize both.' }
      ],
      degraded: false
    })
  })

  it('omits launch when the heading names no command - a bare shell target', () => {
    const text = '### T1\nrun the tests\n\n### T2 — claude\nreview them'
    const result = parseConsoleDelegation(text, ['T1', 'T2'])
    expect(result.assignments[0]).toEqual({ targetId: 'T1', task: 'run the tests' })
    expect(result.assignments[1]).toEqual({ targetId: 'T2', launch: 'claude', task: 'review them' })
  })

  it('keeps a task that runs to several paragraphs whole', () => {
    const text = '### T1 — claude\nFirst line.\n\nSecond line.\n\n### T2 — codex\nOther.'
    const result = parseConsoleDelegation(text, ['T1', 'T2'])
    expect(result.assignments[0]?.task).toBe('First line.\n\nSecond line.')
  })

  it('ignores a heading naming a terminal that is not open', () => {
    const text = '### T1 — claude\nMine.\n\n### ghost — codex\nNot a terminal here.'
    const result = parseConsoleDelegation(text, ['T1'])
    expect(result.assignments).toEqual([{ targetId: 'T1', launch: 'claude', task: 'Mine.' }])
  })

  it('degrades and dispatches nothing when the plan cannot be split, unlike the Fan', () => {
    // Typing an unsplit plan into every terminal at once would run the same
    // task on all of them simultaneously - never what "delegate to T1" meant -
    // so a degraded Console plan has zero assignments, not a whole-text fallback.
    const result = parseConsoleDelegation('Just go do the research.', TARGETS)
    expect(result).toEqual({ assignments: [], degraded: true })
  })

  it('degrades when the orchestrator wrote headings for only some terminals', () => {
    const result = parseConsoleDelegation('### T1 — claude\nMine.', TARGETS)
    expect(result.degraded).toBe(true)
    expect(result.assignments).toEqual([])
  })

  it('degrades on an empty delegation', () => {
    expect(parseConsoleDelegation('   ', TARGETS).degraded).toBe(true)
  })

  it('degrades when there are no open terminals to delegate to', () => {
    expect(parseConsoleDelegation('### T1 — claude\nMine.', [])).toEqual({ assignments: [], degraded: true })
  })

  it('parses a dependency after the launch command', () => {
    const text = [
      '### T1 — claude',
      'deep dive',
      '',
      '### T2 — codex',
      'baseline',
      '',
      '### T3 — agy — waits on T1, T2',
      'synthesize both'
    ].join('\n')
    const result = parseConsoleDelegation(text, TARGETS)
    expect(result.degraded).toBe(false)
    expect(result.assignments[2]).toEqual({
      targetId: 'T3',
      launch: 'agy',
      task: 'synthesize both',
      dependsOn: ['T1', 'T2']
    })
  })

  it('parses a dependency with no launch command', () => {
    const text = '### T1 — claude\ndeep dive\n\n### T2 — waits on T1\nsynthesize'
    const result = parseConsoleDelegation(text, ['T1', 'T2'])
    expect(result.assignments[1]).toEqual({ targetId: 'T2', task: 'synthesize', dependsOn: ['T1'] })
  })

  it('accepts the dependency segment before the launch segment too', () => {
    const text = '### T1 — claude\ndeep dive\n\n### T2 — waits on T1 — codex\nsynthesize'
    const result = parseConsoleDelegation(text, ['T1', 'T2'])
    expect(result.assignments[1]).toEqual({ targetId: 'T2', launch: 'codex', task: 'synthesize', dependsOn: ['T1'] })
  })

  it('degrades with a reason when a dependency names a terminal that is not open', () => {
    const text = '### T1 — claude\ndeep dive\n\n### T2 — waits on ghost\nsynthesize'
    const result = parseConsoleDelegation(text, ['T1', 'T2'])
    expect(result.degraded).toBe(true)
    expect(result.degraded && result.reason).toContain('ghost')
  })

  it('degrades with a reason on a direct dependency cycle', () => {
    const text = '### T1 — waits on T2\nfirst\n\n### T2 — waits on T1\nsecond'
    const result = parseConsoleDelegation(text, ['T1', 'T2'])
    expect(result.degraded).toBe(true)
    expect(result.degraded && result.reason).toContain('cycle')
  })

  it('degrades with a reason on an indirect dependency cycle', () => {
    const text = [
      '### T1 — waits on T3', 'a',
      '', '### T2 — waits on T1', 'b',
      '', '### T3 — waits on T2', 'c'
    ].join('\n')
    const result = parseConsoleDelegation(text, ['T1', 'T2', 'T3'])
    expect(result.degraded).toBe(true)
  })

  it('does not flag two independent terminals waiting on the same one as a cycle', () => {
    const text = [
      '### T1 — claude', 'root',
      '', '### T2 — waits on T1', 'a',
      '', '### T3 — waits on T1', 'b'
    ].join('\n')
    const result = parseConsoleDelegation(text, ['T1', 'T2', 'T3'])
    expect(result.degraded).toBe(false)
  })
})
