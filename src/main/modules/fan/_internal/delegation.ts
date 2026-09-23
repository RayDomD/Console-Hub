/**
 * Splitting an orchestrator's delegation turn into one task per slot.
 *
 * The orchestrator is asked to write a `### <slotId>` heading above each slot's
 * task. Parsing free prose into a split was never going to be reliable, and a
 * wrong split is worse than no split: a slot handed the wrong half answers a
 * question nobody asked, which is the exact failure ADR 0017's verbatim rule
 * existed to prevent.
 *
 * So the parser is deliberately strict and its failure is loud. Anything short
 * of a heading for every slot is `degraded`: every slot receives the whole
 * delegation, which is always usable, and the caller must disclose that the
 * split did not happen rather than presenting one that did not.
 */

export interface Delegation {
  /** The task text each slot should be sent. Always covers every slot id. */
  tasks: Record<string, string>
  /** True when no usable per-slot split was found and every slot got the whole text. */
  degraded: boolean
}

/** `### w1`, and nothing else on the line. */
const HEADING = /^#{1,6}\s+(\S+)\s*$/

export function parseDelegation(text: string, slotIds: readonly string[]): Delegation {
  const wanted = new Set(slotIds)
  const found: Record<string, string[]> = {}
  let current: string | undefined

  for (const line of text.split(/\r?\n/)) {
    const heading = HEADING.exec(line)
    if (heading) {
      const id = heading[1] as string
      // A heading for something that is not a slot in this fan ends the previous
      // slot's task rather than being appended to it.
      current = wanted.has(id) ? id : undefined
      if (current !== undefined) found[current] = []
      continue
    }
    if (current !== undefined) (found[current] as string[]).push(line)
  }

  const tasks: Record<string, string> = {}
  for (const id of slotIds) {
    const body = found[id]?.join('\n').trim()
    if (body !== undefined && body.length > 0) tasks[id] = body
  }

  if (Object.keys(tasks).length === slotIds.length && slotIds.length > 0) {
    return { tasks, degraded: false }
  }

  const whole = text.trim()
  const fallback: Record<string, string> = {}
  for (const id of slotIds) fallback[id] = whole
  return { tasks: fallback, degraded: true }
}
