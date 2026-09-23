import { describe, expect, it } from 'vitest'
import {
  HUB_PANE_MAX,
  HUB_PANE_MIN,
  NAVIGATOR_WIDTH_DEFAULT,
  STACK_WIDTH_DEFAULT,
  nextPaneWidth,
  readPaneWidths,
  type HubPaneWidths
} from './hubPanes'

describe('nextPaneWidth', () => {
  it('follows the pointer, growing the navigator rightwards', () => {
    expect(nextPaneWidth('navigator', 264, 40)).toBe(304)
  })

  it('grows the Live Stack leftwards, so the two handles feel the same way round', () => {
    expect(nextPaneWidth('stack', 286, -40)).toBe(326)
  })

  it('holds at the limits rather than letting a pane eat the stage', () => {
    expect(nextPaneWidth('navigator', HUB_PANE_MAX, 200)).toBe(HUB_PANE_MAX)
    expect(nextPaneWidth('navigator', HUB_PANE_MIN, -200)).toBe(HUB_PANE_MIN)
  })

  it('lands on whole pixels, since a track is drawn not measured', () => {
    expect(nextPaneWidth('navigator', 264, 12.6)).toBe(277)
  })
})

describe('readPaneWidths', () => {
  const parse = (stored: string | null): HubPaneWidths => readPaneWidths(stored)

  it('opens on the designed columns when nothing was stored', () => {
    expect(parse(null)).toEqual({
      navigator: NAVIGATOR_WIDTH_DEFAULT,
      stack: STACK_WIDTH_DEFAULT
    })
  })

  it('clamps a width stored on a wider monitor, so the stage never opens empty', () => {
    expect(parse(JSON.stringify({ navigator: 900, stack: 4 })))
      .toEqual({ navigator: HUB_PANE_MAX, stack: HUB_PANE_MIN })
  })

  it('falls back to the defaults for anything it cannot read', () => {
    expect(parse('not json')).toEqual({
      navigator: NAVIGATOR_WIDTH_DEFAULT,
      stack: STACK_WIDTH_DEFAULT
    })
    expect(parse(JSON.stringify({ navigator: 'wide' }))).toEqual({
      navigator: NAVIGATOR_WIDTH_DEFAULT,
      stack: STACK_WIDTH_DEFAULT
    })
  })
})
