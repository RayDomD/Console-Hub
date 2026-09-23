import { describe, expect, it } from 'vitest'
import { SubmittedLine } from './submittedLine'

describe('SubmittedLine', () => {
  it('returns a typed line only when Enter submits it', () => {
    const line = new SubmittedLine()
    expect(line.write('/mission')).toBeUndefined()
    expect(line.write('\r')).toBe('/mission')
  })

  it('tracks backspace and bracketed paste', () => {
    const line = new SubmittedLine()
    line.write('/mission rnu\x7f\x7f')
    expect(line.write('un\r')).toBe('/mission run')
    expect(line.write('\x1b[200~/mission review\x1b[201~\r')).toBe('/mission review')
  })

  it('still recognizes a command after terminal focus and mouse reporting', () => {
    const line = new SubmittedLine()
    line.write('\x1b[I')
    line.write('\x1b[<0;12;8M')
    line.write('/mission run')

    expect(line.write('\r')).toBe('/mission run')
  })

  it('does not claim a line edited with an unknown control sequence', () => {
    const line = new SubmittedLine()
    line.write('/mission\x1b[D')
    expect(line.write('\r')).toBeUndefined()
  })

  it('submit() reads and resets the tracked line before Enter reaches the terminal', () => {
    const line = new SubmittedLine()
    line.write('/delegate task')
    expect(line.submit()).toBe('/delegate task')
    // Reset like an ordinary CR would: a later write starts a fresh line.
    expect(line.write('next')).toBeUndefined()
    expect(line.write('\r')).toBe('next')
  })

  it('submit() returns undefined for unreliable (uncertain cursor-edited) input', () => {
    const line = new SubmittedLine()
    line.write('/mission\x1b[D')
    expect(line.submit()).toBeUndefined()
  })
})
