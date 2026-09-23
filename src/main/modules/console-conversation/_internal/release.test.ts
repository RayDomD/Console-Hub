import { describe, expect, it } from 'vitest'
import { isReleaseReply, parseGoalCommand } from './release'

describe('isReleaseReply', () => {
  it('matches go and yes, case-insensitively, trimmed', () => {
    expect(isReleaseReply('go')).toBe(true)
    expect(isReleaseReply('Go')).toBe(true)
    expect(isReleaseReply('  YES  ')).toBe(true)
  })

  it('does not match a sentence that merely contains the word', () => {
    expect(isReleaseReply("let's go look at this first")).toBe(false)
    expect(isReleaseReply('yes, but change T2 first')).toBe(false)
  })

  it('does not match an unrelated reply', () => {
    expect(isReleaseReply('what will T1 do')).toBe(false)
  })
})

describe('parseGoalCommand', () => {
  it('extracts the text after ./goal', () => {
    expect(parseGoalCommand('./goal research gemini 3.8 vs 3.7')).toBe('research gemini 3.8 vs 3.7')
  })

  it('trims surrounding whitespace and multi-line input', () => {
    expect(parseGoalCommand('  ./goal   finish the build  ')).toBe('finish the build')
    expect(parseGoalCommand('./goal line one\nline two')).toBe('line one\nline two')
  })

  it('returns undefined for a message with no goal text', () => {
    expect(parseGoalCommand('./goal')).toBeUndefined()
    expect(parseGoalCommand('./goal   ')).toBeUndefined()
  })

  it('returns undefined for an ordinary message', () => {
    expect(parseGoalCommand('research gemini 3.8')).toBeUndefined()
    expect(parseGoalCommand('go')).toBeUndefined()
  })
})
