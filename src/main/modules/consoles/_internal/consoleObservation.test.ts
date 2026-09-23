import { describe, expect, it } from 'vitest'
import { ConsoleObservation } from './consoleObservation'

describe('ConsoleObservation', () => {
  it('reports a submitted agent turn as running until observed completion', () => {
    const observation = new ConsoleObservation(true)
    expect(observation.state()).toBe('available')
    observation.observeInput('please inspect this\r')
    expect(observation.state()).toBe('running')
    observation.observeTurnComplete()
    expect(observation.state()).toBe('available')
  })

  it('keeps a compact plain-text tail for Mission context handoff', () => {
    const observation = new ConsoleObservation(true)
    observation.observeOutput('\u001b[31mUser: preserve the layout\u001b[0m\r\nAgent: ConsoleView is the seam\r\n')
    expect(observation.context()).toBe('User: preserve the layout\nAgent: ConsoleView is the seam')
  })

  it('does not claim availability for a plain shell', () => {
    const observation = new ConsoleObservation(false)
    observation.observeInput('dir\r')
    expect(observation.state()).toBeUndefined()
  })
})
