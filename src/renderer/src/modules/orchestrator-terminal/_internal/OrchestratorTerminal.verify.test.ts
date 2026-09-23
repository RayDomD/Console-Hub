import { describe, expect, it } from 'vitest'
import {
  fixtures,
  invariants,
  orchestratorTerminalVerifyAttrs
} from './OrchestratorTerminal.verify'

describe('OrchestratorTerminal invariants and fixtures', () => {
  for (const fixture of fixtures) {
    it(`fixture "${fixture.name}" matches expectation: ${fixture.expected}`, () => {
      const allPassed = invariants.every((invariant) => invariant.check(fixture.attrs))
      expect(allPassed ? 'pass' : 'fail').toBe(fixture.expected)
    })
  }

  it('disables the composer exactly while a reply is live', () => {
    expect(orchestratorTerminalVerifyAttrs('responding', 'fresh', 2, 0, true, false)
      ['data-verify-composer']).toBe('disabled')
    expect(orchestratorTerminalVerifyAttrs('failed', 'fresh', 2, 0, true, false)
      ['data-verify-composer']).toBe('live')
  })

  it('reports a restored transcript as restored', () => {
    expect(orchestratorTerminalVerifyAttrs('idle', 'restored', 4, 1, true, true)
      ['data-verify-continuity']).toBe('restored')
  })
})
