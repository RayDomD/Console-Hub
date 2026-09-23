import { describe, expect, it } from 'vitest'
import { terminalEnvironment } from './terminalEnvironment'

describe('terminal environment', () => {
  it('advertises terminal colour even when Console Hub inherited colour suppression', () => {
    const env = terminalEnvironment({
      TERM: 'dumb',
      NO_COLOR: '1',
      COLORTERM: '',
      PATH: 'C:\\tools'
    })

    expect(env).toMatchObject({
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      PATH: 'C:\\tools'
    })
    expect(env).not.toHaveProperty('NO_COLOR')
  })

  it('preserves a capable terminal type supplied by the shell environment', () => {
    expect(terminalEnvironment({ TERM: 'screen-256color' }).TERM).toBe('screen-256color')
  })
})
