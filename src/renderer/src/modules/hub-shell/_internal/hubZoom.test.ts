import { describe, expect, it } from 'vitest'
import { HUB_ZOOM_DEFAULT, HUB_ZOOM_MAX, HUB_ZOOM_MIN, nextHubZoom } from './hubZoom'

describe('nextHubZoom', () => {
  it('moves the stage one readable step in either direction', () => {
    expect(nextHubZoom(HUB_ZOOM_DEFAULT, 'in')).toBe(1.1)
    expect(nextHubZoom(HUB_ZOOM_DEFAULT, 'out')).toBe(0.9)
  })

  it('holds at the safe visibility limits', () => {
    expect(nextHubZoom(HUB_ZOOM_MAX, 'in')).toBe(HUB_ZOOM_MAX)
    expect(nextHubZoom(HUB_ZOOM_MIN, 'out')).toBe(HUB_ZOOM_MIN)
  })
})
