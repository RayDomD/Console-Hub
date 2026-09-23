import type {
  FanConfig,
  FanLifecycle,
  FanState,
  FanVendor,
  SlotConfig,
  SlotUsage
} from '../../../../../shared/fan'
import type { RecipeId } from '../../../../../shared/recipes'
import { CLAUDE_MODELS } from '../../../../../shared/agent-models'

/**
 * The arrangement the sidebar shows until a persisted one exists.
 *
 * A fan is a criteria slot, two to five workers and an orchestrator, so the sidebar
 * has to show that shape. It is not a pair of per-provider executor defaults,
 * which is what a skill button carries and a different thing entirely.
 *
 * The authoritative source will be the persisted arrangement, which is a later
 * ticket in this epic. `DEFAULT_EXECUTORS` lives in main and is not exposed over
 * IPC, so there is nothing renderer-side to read today. This constant is the
 * stand-in, typed as `SlotConfig[]` so replacing it is a swap and not a rewrite.
 */
export const DEFAULT_SLOTS: readonly SlotConfig[] = [
  { id: 'w1', role: 'worker', vendor: 'claude', model: 'opus', effort: 'high' },
  { id: 'w2', role: 'worker', vendor: 'codex', model: 'gpt-5.6-terra', effort: 'medium' },
  { id: 'w3', role: 'worker', vendor: 'codex', model: 'gpt-5.6-sol', effort: 'medium' },
  { id: 'w4', role: 'worker', vendor: 'claude', model: 'sonnet', effort: 'medium' },
  { id: 'orchestrator', role: 'orchestrator', vendor: 'claude', model: 'opus', effort: 'high' }
]

/**
 * The vendors a slot can actually be run on.
 *
 * These are executor names, not brand names, because they are what the harness
 * can spawn: `toHarnessVendor` in main accepts the configured executors and throws
 * for anything else, and their model rosters follow the same executor names.
 * A slot naming a brand would pass every check
 * here and then fail at launch, which is why the plate speaks the executor's
 * vocabulary rather than translating into it.
 */
export const FAN_VENDORS = ['claude', 'codex', 'agy'] as const

export type FanExecutor = (typeof FAN_VENDORS)[number]

const CONVENTIONS_FILE_BY_VENDOR: Readonly<Record<FanExecutor, string>> = {
  claude: 'CLAUDE.md',
  codex: 'AGENTS.md',
  agy: 'GEMINI.md'
}

/**
 * Every vendor loads its user-level convention file. A project convention is
 * deliberate only when the fan was given a workspace, never inferred from
 * Console Hub's own directory.
 */
export function slotConventions(vendor: FanVendor, workspace: string | undefined): string {
  const filename = CONVENTIONS_FILE_BY_VENDOR[vendor.toLowerCase() as FanExecutor] ?? 'NONE'
  return `USER · ${filename} · PROJECT · ${workspace === undefined ? 'NONE' : filename}`
}

/**
 * The vendors carrying a shell identity rim, per ADR 0048. `agy` is named here
 * and the card editor offers it alongside the two original executors.
 */
const AGENT_RIM_VENDORS = new Set(['codex', 'claude', 'agy'])

export type AgentRimVendor = 'codex' | 'claude' | 'agy'

/**
 * The identity rim a slot carries, or `undefined` when its vendor has none.
 * ADR 0048: a vendor with no rim gets no rim, never a placeholder colour, so
 * this returns nothing rather than a spare default.
 */
export function agentRim(vendor: FanVendor): AgentRimVendor | undefined {
  const lower = vendor.toLowerCase()
  return AGENT_RIM_VENDORS.has(lower) ? (lower as AgentRimVendor) : undefined
}

/**
 * Claude's models are a closed set the app can name. Codex's are not - it ships
 * new model strings on its own schedule - so those come from config, over the
 * same `skills:codexModels` channel the registry reads, and main validates a
 * slot against that same list when the run starts.
 */

const EFFORTS: Readonly<Record<FanExecutor, readonly string[]>> = {
  claude: ['low', 'medium', 'high', 'xhigh', 'max'],
  codex: ['low', 'medium', 'high'],
  agy: ['low', 'medium', 'high']
}

/**
 * The models this slot's vendor accepts, and nothing else, so an unaccepted
 * model cannot be picked in the first place.
 *
 * The slot's current model is included even when the roster does not name it:
 * that is showing what the slot is set to, not offering a new choice, and a
 * config whose `codexModels` has yet to load must not read as "no models".
 */
export function modelOptions(
  vendor: FanVendor,
  codexModels: readonly string[],
  current?: string,
  agyModels: readonly string[] = []
): string[] {
  const roster = vendor.toLowerCase() === 'claude'
    ? [...CLAUDE_MODELS]
    : vendor.toLowerCase() === 'agy'
      ? [...agyModels]
      : [...codexModels]
  if (current !== undefined && current.length > 0 && !roster.includes(current)) {
    return [current, ...roster]
  }
  return roster
}

/** The effort levels this slot's vendor accepts. Codex stops at high. */
export function effortOptions(vendor: FanVendor): string[] {
  return [...(EFFORTS[vendor.toLowerCase() as FanExecutor] ?? EFFORTS.claude)]
}

/**
 * One slot's model or effort changed. Returns a new arrangement; the caller
 * holds it. A slot that names nothing keeps naming nothing, so it still
 * launches on its vendor's defaults.
 */
export function withSlotSettings(
  slots: readonly SlotConfig[],
  slotId: string,
  patch: { model?: string; effort?: string }
): SlotConfig[] {
  return slots.map((slot) => (slot.id === slotId ? { ...slot, ...patch } : slot))
}

/** A vendor owns its models, so a switch always returns to its default model. */
export function withSlotVendor(
  slots: readonly SlotConfig[],
  slotId: string,
  vendor: FanExecutor
): SlotConfig[] {
  return slots.map((slot) => (
    slot.id === slotId
      ? {
          ...slot,
          vendor,
          model: undefined,
          effort: slot.effort !== undefined && effortOptions(vendor).includes(slot.effort)
            ? slot.effort
            : undefined
        }
      : slot
  ))
}

const EFFORT_CELLS: Readonly<Record<string, number>> = {
  low: 1,
  medium: 2,
  high: 3,
  xhigh: 4,
  max: 4
}

const EFFORT_CELL_COUNT = 4
const DEFAULT_EFFORT_CELLS = 2

/**
 * Effort stays achromatic, in the glyph run, because effort is ordinal and
 * colour encodes ordinal badly. A slot naming no effort reads as the middle of
 * the run rather than as empty, since that is what a vendor default gives it.
 */
export function effortGlyphs(effort: string | undefined): string {
  const filled =
    effort === undefined
      ? DEFAULT_EFFORT_CELLS
      : (EFFORT_CELLS[effort.toLowerCase()] ?? DEFAULT_EFFORT_CELLS)
  return '▮'.repeat(filled) + '▯'.repeat(EFFORT_CELL_COUNT - filled)
}

/**
 * A fan is however many opinions the question deserves, within the bounds the
 * machine validates: fewer than two cannot be compared, and more than five is
 * five subscriptions spent on one question.
 */
export const MIN_WORKERS = 2
export const MAX_WORKERS = 5

export function canAddWorker(slots: readonly SlotConfig[]): boolean {
  return workerSlots(slots).length < MAX_WORKERS
}

export function canRemoveWorker(slots: readonly SlotConfig[]): boolean {
  return workerSlots(slots).length > MIN_WORKERS
}

/**
 * The vendor a new slot lands on: whichever executor the fan is using less.
 *
 * Four slots on one vendor drain one subscription four times, and the 5-hour
 * window is the real ceiling rather than any token count. Balancing is the
 * cheapest thing that spreads a fan across separately-paid quotas without
 * asking the user to think about it. A tie goes to claude, arbitrarily.
 */
export function nextWorkerVendor(slots: readonly SlotConfig[]): FanExecutor {
  const workers = workerSlots(slots)
  const claude = workers.filter((slot) => slot.vendor === 'claude').length
  const codex = workers.filter((slot) => slot.vendor === 'codex').length
  return codex < claude ? 'codex' : 'claude'
}

/**
 * A worker slot appended to the arrangement, naming no model and no effort so
 * it launches on its vendor's defaults - which is what `DEFAULT_EXECUTORS` in
 * main is for, and the renderer cannot read.
 *
 * The id is the first `wN` free, so removing w2 and adding again reuses w2
 * rather than climbing forever. Ids must be unique within a fan; the machine
 * refuses a config that repeats one.
 */
export function addWorkerSlot(slots: readonly SlotConfig[]): SlotConfig[] {
  if (!canAddWorker(slots)) return [...slots]

  const taken = new Set(slots.map((slot) => slot.id))
  let index = 1
  while (taken.has(`w${index}`)) index += 1

  const fresh: SlotConfig = {
    id: `w${index}`,
    role: 'worker',
    vendor: nextWorkerVendor(slots)
  }

  // After the last worker, so the orchestrator stays at the end of the arrangement.
  const lastWorker = slots.map((slot) => slot.role).lastIndexOf('worker')
  const at = lastWorker === -1 ? slots.length : lastWorker + 1
  return [...slots.slice(0, at), fresh, ...slots.slice(at)]
}

/** One worker removed. The floor holds: at two workers this is a no-op. */
export function removeWorkerSlot(slots: readonly SlotConfig[], slotId: string): SlotConfig[] {
  const target = slots.find((slot) => slot.id === slotId)
  if (target?.role !== 'worker' || !canRemoveWorker(slots)) return [...slots]
  return slots.filter((slot) => slot.id !== slotId)
}

/**
 * An effort as it reads in the picker: the achromatic run, then the name. The
 * glyphs are the same ones the card shows, so choosing an effort and reading it
 * back are the same gesture.
 */
export function effortOptionLabel(effort: string): string {
  return `${effortGlyphs(effort)} ${effort.toUpperCase()}`
}

/**
 * The config one Enter produces.
 *
 * `delegation` is an optional steer, not a requirement: the orchestrator decides
 * the split either way (ADR 0020), so a blank box is a run with no steer rather
 * than a run that cannot start.
 */
export function buildFanConfig(
  question: string,
  delegation = '',
  slots: readonly SlotConfig[] = DEFAULT_SLOTS,
  workspace?: string
): FanConfig {
  const steer = delegation.trim()
  return {
    slots: [...slots],
    question,
    ...(steer.length > 0 ? { delegation: steer } : {}),
    ...(workspace !== undefined ? { workspace } : {})
  }
}

/**
 * What a closed run needs to say about itself, or `undefined` while it is live.
 *
 * These are the run-level outcomes, as distinct from a single slot's status:
 * a comparison that could not run, a run the user cut short, and a run that was
 * interrupted and cannot be resumed.
 */
export function runNotice(state: FanState | undefined): string | undefined {
  switch (state?.lifecycle) {
    case 'unscored':
      return 'Fewer than two workers answered, so no comparison ran. '
        + 'The answers and the spend are still here, and a slot can be retried.'
    case 'stopped':
      return 'Stopped. This run does not resume - ask again to start a new one.'
    case 'interrupted':
      return 'Interrupted before it finished. This run does not resume - ask again to start a new one.'
    default:
      return undefined
  }
}

export function workerSlots(slots: readonly SlotConfig[]): SlotConfig[] {
  return slots.filter((slot) => slot.role === 'worker')
}

/**
 * Only `synthesize` has a running machine behind it, so its live lifecycle is
 * the only one that maps onto a stage strip at all. The stage names here are
 * `synthesize`'s own strip - PROPOSE, HOLD, MERGE, SYNC.
 */
const SYNTHESIZE_STAGE_BY_LIFECYCLE: Partial<Record<FanLifecycle, number>> = {
  delegating: 0, // PROPOSE
  held: 1, // HOLD
  workers: 2, // MERGE
  synthesis: 3 // SYNC
}

/**
 * The Recipe stage strip's current index, or `undefined` when nothing is
 * current. For any Recipe other than `synthesize` - or while the fan is
 * `idle` or has not run at all - no stage is current, because nothing is
 * running.
 */
export function currentStageIndex(
  recipeId: RecipeId,
  lifecycle: FanLifecycle | undefined
): number | undefined {
  if (recipeId !== 'synthesize' || lifecycle === undefined) return undefined
  return SYNTHESIZE_STAGE_BY_LIFECYCLE[lifecycle]
}

/**
 * Whether a Recipe has a machine behind it. The orchestrated fan and the console
 * do; every other Recipe reads as unavailable, with its runtime named as the
 * missing thing, until this is the one place to flip (ADR 0038).
 *
 * The console's runtime is a pty rather than a fan, so it renders its own plate
 * on the stage and never reaches this plate - but it is a built Recipe, and the
 * rail asks this question about all seven.
 */
export function recipeHasRuntime(id: RecipeId): boolean {
  return id === 'synthesize' || id === 'console'
}

const LIFECYCLE_LABELS: Partial<Record<FanLifecycle, string>> = {
  idle: 'Idle',
  delegating: 'Delegating',
  held: 'Held',
  workers: 'Workers',
  synthesis: 'Synthesis',
  done: 'Done',
  unscored: 'Unscored',
  stopped: 'Stopped',
  interrupted: 'Interrupted'
}

export function lifecycleLabel(lifecycle: string): string {
  return LIFECYCLE_LABELS[lifecycle as FanLifecycle]
    ?? lifecycle.replace(/[_-]+/g, ' ').replace(/^./, (first) => first.toUpperCase())
}

export interface SlotMetricLabels {
  throughput: string
  tokens: string
  /** The input side, or `undefined` when the stream supplied none of it. */
  context: string | undefined
}

/**
 * What a card says about a turn's cost.
 *
 * Output tokens are the headline because they are the only figure the two
 * vendors mean the same thing by. codex reports its entire prompt - system
 * prompt and tool schemas - in `input_tokens` on every turn, while claude
 * reports that same bulk as a cache read. Summing input and output therefore
 * put a 33k reading beside a 961 reading for one question, which read as codex
 * spending thirty-five times more and was actually the two vendors disclosing
 * different things. The input side is still shown, as its own line, so the
 * overhead is visible as overhead.
 */
export function slotMetrics(usage: SlotUsage | undefined): SlotMetricLabels {
  const cached = usage?.cachedInputTokens

  const context: string[] = []
  if (usage?.inputTokens !== undefined) context.push(`${usage.inputTokens.toLocaleString()} in`)
  if (cached !== undefined) context.push(`${cached.toLocaleString()} cached`)

  return {
    // Rounded here, at render: the measured value at runtime.ts:102 stays exact.
    throughput: usage?.throughput === undefined
      ? 'Throughput unavailable'
      : `${Math.round(usage.throughput)} tps`,
    tokens: usage?.outputTokens === undefined
      ? 'Tokens unavailable'
      : `${usage.outputTokens.toLocaleString()} out`,
    context: context.length > 0 ? context.join(' · ') : undefined
  }
}
