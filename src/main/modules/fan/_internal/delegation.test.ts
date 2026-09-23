import { describe, expect, it } from 'vitest'
import { parseDelegation } from './delegation'

const SLOTS = ['w1', 'w2', 'w3']

describe('parseDelegation', () => {
  it('gives each slot the task written under its own heading', () => {
    const text = [
      'Splitting three ways.',
      '',
      '### w1',
      'Find the founding story.',
      '',
      '### w2',
      'Find the product range.',
      '',
      '### w3',
      'Find the controversies.'
    ].join('\n')

    expect(parseDelegation(text, SLOTS)).toEqual({
      tasks: { w1: 'Find the founding story.', w2: 'Find the product range.', w3: 'Find the controversies.' },
      degraded: false
    })
  })

  it('keeps a task that runs to several paragraphs whole', () => {
    const text = '### w1\nFirst line.\n\nSecond line.\n\n### w2\nOther.'
    expect(parseDelegation(text, ['w1', 'w2']).tasks.w1).toBe('First line.\n\nSecond line.')
  })

  it('ignores a heading naming a slot that is not in this fan', () => {
    const text = '### w1\nMine.\n\n### ghost\nNot a slot here.'
    expect(parseDelegation(text, ['w1']).tasks).toEqual({ w1: 'Mine.' })
  })

  it('hands every slot the whole delegation when no heading parsed, and says it degraded', () => {
    // A delegation nobody can split is still usable - every slot reads all of
    // it - but the run must never present that as a split that happened.
    const result = parseDelegation('Just do some research on the company.', SLOTS)
    expect(result.degraded).toBe(true)
    expect(result.tasks.w1).toBe('Just do some research on the company.')
    expect(result.tasks.w2).toBe('Just do some research on the company.')
  })

  it('degrades when the orchestrator wrote headings for only some slots', () => {
    // A partial split silently leaves a slot with nothing to do, which reads at
    // the plate as a slot that failed rather than one that was never tasked.
    const result = parseDelegation('### w1\nMine.', SLOTS)
    expect(result.degraded).toBe(true)
  })

  it('treats an empty delegation as degraded rather than as empty tasks', () => {
    expect(parseDelegation('   ', SLOTS).degraded).toBe(true)
  })
})
