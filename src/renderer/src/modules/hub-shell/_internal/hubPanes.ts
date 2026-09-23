/**
 * The width of the Hub's two side columns.
 *
 * The Navigator and the Live Stack were fixed tracks, sized for the content they
 * had on the day they were drawn. A long workspace path and a five-slot Stack
 * both outgrow that, and neither has anywhere to go, so both tracks are now the
 * user's to set. The stage keeps whatever is left, which is why the bounds here
 * are about protecting the stage rather than about what fits in a sidebar.
 */

export const HUB_PANE_MIN = 200
export const HUB_PANE_MAX = 520

/** The columns the Hub was designed at, and what an unset or unreadable width falls back to. */
export const NAVIGATOR_WIDTH_DEFAULT = 264
export const STACK_WIDTH_DEFAULT = 286

export const HUB_PANES_STORAGE_KEY = 'console-hub.panes'

export type HubPane = 'navigator' | 'stack'

export interface HubPaneWidths {
  navigator: number
  stack: number
}

function clamp(width: number): number {
  return Math.round(Math.min(HUB_PANE_MAX, Math.max(HUB_PANE_MIN, width)))
}

/**
 * A pane's width after a pointer moved `deltaX` CSS pixels.
 *
 * The Stack's handle is on its left edge, so dragging left has to widen it. The
 * sign flip lives here rather than at the call site: both handles then read as
 * "drag away from the stage to grow", which is the only rule a user forms.
 */
export function nextPaneWidth(pane: HubPane, current: number, deltaX: number): number {
  return clamp(current + (pane === 'stack' ? -deltaX : deltaX))
}

/**
 * The stored widths, clamped on the way in.
 *
 * Clamping on restore and not only on drag is the point: a width saved on a
 * wide monitor would otherwise reopen on a narrow one with no stage left, and
 * the handle needed to fix it would be off-screen.
 */
export function readPaneWidths(stored: string | null): HubPaneWidths {
  const fallback: HubPaneWidths = {
    navigator: NAVIGATOR_WIDTH_DEFAULT,
    stack: STACK_WIDTH_DEFAULT
  }
  if (stored === null) return fallback

  let parsed: unknown
  try {
    parsed = JSON.parse(stored)
  } catch {
    return fallback
  }
  if (typeof parsed !== 'object' || parsed === null) return fallback

  const { navigator, stack } = parsed as Partial<HubPaneWidths>
  if (!Number.isFinite(navigator) || !Number.isFinite(stack)) return fallback
  return { navigator: clamp(navigator as number), stack: clamp(stack as number) }
}
