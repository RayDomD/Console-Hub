export const HUB_ZOOM_MIN = 0.85
export const HUB_ZOOM_MAX = 1.4
export const HUB_ZOOM_DEFAULT = 1

const HUB_ZOOM_STEP = 0.1

export type HubZoomDirection = 'in' | 'out'

/** Keeps stage magnification readable without letting it eclipse Hub navigation. */
export function nextHubZoom(current: number, direction: HubZoomDirection): number {
  const delta = direction === 'in' ? HUB_ZOOM_STEP : -HUB_ZOOM_STEP
  const bounded = Math.min(HUB_ZOOM_MAX, Math.max(HUB_ZOOM_MIN, current + delta))
  return Math.round(bounded * 100) / 100
}
