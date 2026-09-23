import type { FanLifecycle } from '../../../../../shared/fan'
import type {
  ConversationSettings,
  ConversationState,
  WorkerSnapshot
} from '../../../../../shared/orchestrator-conversation'

/**
 * What the terminal reads out of a transcript, as plain functions.
 *
 * Kept out of the component for the usual reason: these are the rules ADR 0049
 * states - one live reply, no proposal without a landed one, a status readable
 * without colour - and a rule buried in JSX cannot be tested.
 */

/** `CLAUDE · SONNET · HIGH`, naming only what the slot actually sets. */
export function identityLabel(settings: ConversationSettings): string {
  return [settings.vendor, settings.model, settings.effort]
    .filter((part): part is string => part !== undefined && part.length > 0)
    .map((part) => part.toUpperCase())
    .join(' · ')
}

/**
 * Glyph run for a fault - alternating fill reads as "broken", and is the same
 * run the worker cards use. Colour never carries state (DESIGN.md), so every
 * status here is a glyph plus a word.
 */
const FAULT_GLYPHS = '▯▮▯▮'

const RUN_LABELS: Partial<Record<FanLifecycle, string>> = {
  delegating: '▮▯▯▯ PROPOSING',
  held: '▮▮▯▯ HELD',
  workers: '▮▮▮▮ WORKERS RUNNING',
  synthesis: '▮▮▮▯ SYNTHESISING'
}

/**
 * What the terminal head says about itself.
 *
 * A live reply outranks the run, because that is what the disabled composer is
 * waiting on: a head reading WORKERS RUNNING beside a composer nobody can type
 * in explains neither.
 */
export function turnLabel(
  state: ConversationState,
  lifecycle: FanLifecycle | undefined
): string {
  if (state.turn === 'responding') return '▮▯▯▯ RESPONDING'
  if (state.turn === 'failed') return `${FAULT_GLYPHS} REPLY FAILED`
  const run = lifecycle === undefined ? undefined : RUN_LABELS[lifecycle]
  return run ?? '▯▯▯▯ READY'
}

/** Only one reply may be live, so a second message is refused rather than queued. */
export function composerDisabled(state: ConversationState): boolean {
  return state.turn === 'responding'
}

export function canRetry(state: ConversationState): boolean {
  return state.turn === 'failed'
}

/** A run is in flight, so a second proposal would fork it. */
const RUNNING_LIFECYCLES = new Set<FanLifecycle>(
  ['delegating', 'held', 'workers', 'synthesis']
)

/**
 * Whether a proposal can be made now.
 *
 * It needs a reply that actually landed: proposing off a turn still in flight
 * would release workers against half a plan. A finished run is no obstacle -
 * one conversation may create several (ADR 0049) - but a live one is.
 */
export function canPropose(
  state: ConversationState,
  lifecycle: FanLifecycle | undefined
): boolean {
  if (state.turn !== 'idle') return false
  if (lifecycle !== undefined && RUNNING_LIFECYCLES.has(lifecycle)) return false
  return state.entries.some(
    (entry) => entry.kind === 'orchestrator' && entry.phase === 'complete'
  )
}

/** `2m 18s`, matching what the Orchestrator was told in its snapshot. */
export function elapsedLabel(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes === 0 ? `${seconds}s` : `${minutes}m ${seconds}s`
}

/** The wall clock an entry is stamped with. Local, because the reader is local. */
export function stampLabel(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

const SNAPSHOT_GLYPHS: Readonly<Record<string, string>> = {
  running: '▮▮▮▮',
  completed: '▮▮▮▮',
  idle: '▯▯▯▯',
  stopped: '▯▯▯▯'
}

/** One worker's line inside a snapshot block, readable without colour. */
export function snapshotLine(worker: WorkerSnapshot): string {
  const glyphs = SNAPSHOT_GLYPHS[worker.phase] ?? FAULT_GLYPHS
  const usage = worker.outputTokens === undefined ? '' : ` · ${worker.outputTokens.toLocaleString()} out`
  const head = `${worker.slotId} ${glyphs} ${worker.phase.toUpperCase()} · ${elapsedLabel(worker.elapsedMs)}${usage}`
  return worker.excerpt.length > 0 ? `${head} · ${worker.excerpt}` : head
}
