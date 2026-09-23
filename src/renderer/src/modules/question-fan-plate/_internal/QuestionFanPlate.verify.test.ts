import { describe, expect, it } from 'vitest'
import { fixtures, invariants, questionFanVerifyAttrs } from './QuestionFanPlate.verify'

describe('QuestionFanPlate invariants and fixtures', () => {
  for (const fixture of fixtures) {
    it(`fixture "${fixture.name}" matches expectation: ${fixture.expected}`, () => {
      const allPassed = invariants.every((invariant) => invariant.check(fixture.attrs))
      expect(allPassed ? 'pass' : 'fail').toBe(fixture.expected)
    })
  }

  it('describes the causal main-column order and live controls for an open plate', () => {
    const attrs = questionFanVerifyAttrs(true, 6)

    expect(attrs['data-verify-controls']).toBe('live')
    expect(attrs['data-verify-main-order']).toBe('stage terminal streams')
  })

  it('reports the selected Recipe and its availability', () => {
    expect(questionFanVerifyAttrs(true, 2, 'none', 'synthesize', true)['data-verify-recipe'])
      .toBe('synthesize')
    expect(questionFanVerifyAttrs(true, 2)['data-verify-recipe']).toBe('none')
    expect(questionFanVerifyAttrs(true, 2, 'none', 'explore', false)['data-verify-recipe-available'])
      .toBe('false')
  })
})
