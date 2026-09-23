import type { SlotConfig } from '../../../../shared/fan'

/**
 * The stored fan arrangement, and what to do when it cannot be trusted.
 *
 * Kept out of the config store because these are fan rules, not storage rules:
 * how many workers a fan may have, which vendors can be spawned, and what a
 * fresh profile starts from. The store reads and writes the value; this decides
 * whether the value is one the plate can open on.
 */

/** Mirrors the machine's own bounds. A fan below two cannot be compared. */
const MIN_WORKERS = 2
const MAX_WORKERS = 5

/** What the harness can spawn. A stored slot on anything else would throw at launch. */
const SPAWNABLE = new Set(['claude', 'codex', 'agy'])

export interface ExecutorDefaults {
  [vendor: string]: { model?: string; effort?: string }
}

/**
 * The arrangement a profile with nothing stored opens on.
 *
 * Built from the `executors` block rather than from a second literal, so the
 * models a new fan starts on are the same ones every other executor default in
 * Console Hub comes from. Two vendors, alternating, because four slots on one
 * vendor spend one subscription four times.
 */
export function defaultArrangement(executors: ExecutorDefaults): SlotConfig[] {
  const on = (vendor: 'claude' | 'codex'): Omit<SlotConfig, 'id' | 'role'> => ({
    vendor,
    model: executors[vendor]?.model,
    effort: executors[vendor]?.effort
  })

  return [
    { id: 'w1', role: 'worker', ...on('claude') },
    { id: 'w2', role: 'worker', ...on('codex') },
    { id: 'w3', role: 'worker', ...on('claude') },
    { id: 'w4', role: 'worker', ...on('codex') },
    { id: 'orchestrator', role: 'orchestrator', ...on('claude') }
  ]
}

/**
 * A stored arrangement, or `undefined` when it is not one the plate can open on.
 *
 * Everything here is a rule the fan machine would throw on at Enter, or the
 * harness would throw on at launch. Refusing to open the plate because a stored
 * file went stale is the one outcome that is never acceptable, so the caller
 * falls back to the defaults - a broken arrangement costs the user their layout,
 * not their plate.
 */
export function validArrangement(stored: unknown): SlotConfig[] | undefined {
  if (!Array.isArray(stored)) return undefined

  const slots: SlotConfig[] = []
  for (const entry of stored) {
    const slot = validSlot(entry)
    if (slot === undefined) return undefined
    slots.push(slot)
  }

  const ids = slots.map((slot) => slot.id)
  if (new Set(ids).size !== ids.length) return undefined

  const count = (role: SlotConfig['role']): number =>
    slots.filter((slot) => slot.role === role).length

  if (count('orchestrator') !== 1) return undefined

  const workers = count('worker')
  if (workers < MIN_WORKERS || workers > MAX_WORKERS) return undefined

  return slots
}

function validSlot(entry: unknown): SlotConfig | undefined {
  if (typeof entry !== 'object' || entry === null) return undefined
  const slot = entry as Partial<SlotConfig>

  if (typeof slot.id !== 'string' || slot.id.length === 0) return undefined
  if (slot.role !== 'worker' && slot.role !== 'orchestrator') {
    return undefined
  }
  if (typeof slot.vendor !== 'string' || !SPAWNABLE.has(slot.vendor)) return undefined
  if (slot.model !== undefined && typeof slot.model !== 'string') return undefined
  if (slot.effort !== undefined && typeof slot.effort !== 'string') return undefined

  // Rebuilt rather than passed through, so a stored file cannot smuggle extra
  // keys into a config the machine will read.
  return {
    id: slot.id,
    role: slot.role,
    vendor: slot.vendor,
    ...(slot.model === undefined ? {} : { model: slot.model }),
    ...(slot.effort === undefined ? {} : { effort: slot.effort })
  }
}
