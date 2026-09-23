/**
 * The question-fan state machine.
 *
 * A pure function of state plus event: no timers, no I/O, no clock.
 * Every rule in the brief (run sequence, faults, recovery, interruption)
 * is reachable in a unit test by feeding events with no process spawned
 * and nothing mocked.
 *
 * The caller performs all effects (process launch, kill, atomic file write).
 * The machine only decides *what* must happen next.
 */

import { EventEmitter } from 'node:events'
import { parseDelegation } from './delegation'
import type {
  FanConfig,
  FanState,
  FanTransition,
  FanCommand,
  SlotConfig,
  SlotEvent,
  SlotScope,
  SlotStatus,
  OrchestratorStatus,
  FanLifecycle
} from '../../../../shared/fan'

// ---------------------------------------------------------------------------
// Options type for enter()
// ---------------------------------------------------------------------------

/**
 * Defaults and acceptable-model roster, supplied by the caller so the machine
 * never touches config or the filesystem during a state transition.
 */
export interface EnterOptions {
  /**
   * Map from vendor to the default model and effort for that vendor. Applied to
   * any slot that does not name its own. A slot's own values always win.
   */
  defaults?: Record<string, { model?: string; effort?: string }>
  /**
   * Map from vendor to the set of model names the vendor will accept. When
   * absent for a vendor, no model on that vendor's slots is rejected — absence
   * of a list is not evidence a model is wrong.
   */
  acceptableModels?: Record<string, string[]>
  /**
   * A unique identifier for the run about to start, supplied by the caller.
   * The machine holds no clock and no randomness of its own — this is the
   * only way a run id can survive a process restart. `archOutputPath` derives
   * the comparison document's filename from it, so two runs started in two
   * different Console Hub sessions must never receive the same one. Absent, the
   * run id falls back to a process-local counter, which is what let a second
   * session's first run silently overwrite the first session's comparison.
   */
  runId?: string
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

let seq = 0
/**
 * `supplied` is the caller-provided id from `EnterOptions.runId`, used verbatim
 * when present. The counter fallback exists only for callers that do not
 * supply one; it resets with the process, which is the defect this guards
 * callers away from once they pass a real id.
 */
function freshRunId(supplied: string | undefined): string {
  return supplied ?? `fan-run-${++seq}`
}

function validateConfig(config: FanConfig, options?: EnterOptions): void {
  const ids = config.slots.map(s => s.id)
  const unique = new Set(ids)
  if (unique.size !== ids.length) {
    throw new Error('Fan config has duplicate slot ids')
  }

  const orchestrators = config.slots.filter(s => s.role === 'orchestrator')
  if (orchestrators.length !== 1) {
    throw new Error(
      `Fan config must have exactly one orchestrator slot (got ${orchestrators.length})`
    )
  }

  const workers = config.slots.filter(s => s.role === 'worker')
  if (workers.length < 2 || workers.length > 5) {
    throw new Error(
      `Fan config must have 2–5 worker slots (got ${workers.length})`
    )
  }

  // Per-slot model validation — only when an acceptable-model set was supplied
  // for the slot's vendor. Absence of a list is not evidence a model is wrong.
  if (options?.acceptableModels) {
    const acceptableModels = options.acceptableModels
    for (const slot of config.slots) {
      if (slot.model === undefined) continue
      const list = acceptableModels[slot.vendor]
      if (list === undefined) continue
      if (!list.includes(slot.model)) {
        throw new Error(
          `Slot '${slot.id}': model '${slot.model}' is not accepted by vendor '${slot.vendor}'`
        )
      }
    }
  }
}

function blankSlots(config: FanConfig): Record<string, SlotStatus> {
  const record: Record<string, SlotStatus> = {}
  for (const slot of config.slots) {
    record[slot.id] = { phase: 'idle' }
  }
  return record
}

/** Returns the scope for a slot based on its role. */
function slotScope(slot: SlotConfig): SlotScope {
  // Both scopes are read-only at the process level: Console Hub performs any
  // document write itself. The difference is what Console Hub does with the output.
  return slot.role === 'orchestrator' ? 'DOCS' : 'NONE'
}

/**
 * Resolves effective model and effort for a slot.
 * The slot's own values win; the defaults argument fills gaps.
 * When neither supplies a value the field is absent from the launch command.
 */
function resolveModelEffort(
  slot: SlotConfig,
  defaults: EnterOptions['defaults']
): { model?: string; effort?: string } {
  const def = defaults?.[slot.vendor]
  const model = slot.model ?? def?.model
  const effort = slot.effort ?? def?.effort
  return {
    ...(model !== undefined ? { model } : {}),
    ...(effort !== undefined ? { effort } : {})
  }
}

function isTerminal(status: SlotStatus | undefined): boolean {
  if (status === undefined) return false
  return (
    status.phase === 'completed' ||
    status.phase === 'process_crash' ||
    status.phase === 'quota' ||
    status.phase === 'stream_invalid' ||
    status.phase === 'stopped'
  )
}

/**
 * Lifecycles in which the run is over and no further slot event is accepted.
 *
 * Single source of truth: `step` drops events here, `retry` refuses to launch
 * here, and the Enter latch treats a slot still marked running here as a
 * phantom. Those three must agree — when they did not, a slot could be set
 * running in a state that could never clear it, latching Enter forever.
 */
const CLOSED_LIFECYCLES: ReadonlyArray<FanLifecycle> = ['stopped', 'done', 'interrupted']

function isClosed(state: FanState): boolean {
  return CLOSED_LIFECYCLES.includes(state.lifecycle)
}

/**
 * True while any slot still has a live process behind it.
 *
 * Derived from the slots rather than from a list of lifecycle names, because a
 * retried slot can be in flight in a lifecycle that is not itself "running" —
 * which is how a hand-listed latch let a second Enter spend twice.
 *
 * A closed run has no live process by definition: every launch path refuses to
 * start one there. Ignoring slot phase in that case means a stuck `running`
 * cannot deadlock Enter.
 */
function hasLiveSlot(state: FanState): boolean {
  if (isClosed(state)) return false
  return Object.values(state.slots).some(s => s.phase === 'running')
}

/** The slot's next attempt number, for a launch about to be emitted. */
function nextAttempt(state: FanState, slotId: string): number {
  return (state.attempts[slotId] ?? 0) + 1
}

/**
 * Output only. The vendors do not agree on what input they disclose - codex
 * reports its whole prompt each turn, claude reports the same bulk as a cache
 * read - so a running total that includes input measures the harnesses rather
 * than the run.
 */
function countTokens(usage: { outputTokens?: number } | undefined): number {
  return usage?.outputTokens ?? 0
}

function archOutputPath(runId: string): string {
  // The caller writes the file atomically; we decide the path. `docs/plans/` holds
  // this project's real planning artifacts and a dashboard generated from them, so
  // a comparison lands in its own directory rather than corrupting that index.
  const stamp = runId.replace(/[^a-zA-Z0-9-]/g, '-')
  return `docs/comparisons/${stamp}-comparison.md`
}

function launchWorkers(state: FanState): FanTransition {
  const workers = state.config.slots.filter(s => s.role === 'worker')
  const slots: Record<string, SlotStatus> = { ...state.slots }
  const attempts = { ...state.attempts }

  for (const worker of workers) {
    slots[worker.id] = { phase: 'running' }
    attempts[worker.id] = nextAttempt(state, worker.id)
  }

  return {
    state: { ...state, slots, attempts, lifecycle: 'workers' },
    commands: [
      {
        kind: 'launch_workers',
        slots: workers.map(worker => ({
          slotId: worker.id,
          vendor: worker.vendor,
          // Orchestrated runs send each worker the task written for it; a
          // question fan sends the question verbatim (ADR 0017, scoped by 0019).
          question: state.delegation?.tasks[worker.id] ?? state.config.question,
          attempt: attempts[worker.id] as number,
          scope: slotScope(worker),
          ...(worker.model !== undefined ? { model: worker.model } : {}),
          ...(worker.effort !== undefined ? { effort: worker.effort } : {}),
          ...(state.config.workspace !== undefined ? { workspace: state.config.workspace } : {})
        }))
      }
    ]
  }
}

// ---------------------------------------------------------------------------
// Public: enter
// ---------------------------------------------------------------------------

/**
 * Start a new fan run. If a state is provided and a run is already live,
 * this is a no-op (latch: repeated Enter cannot spend twice).
 *
 * Validates the config and throws on violations.
 *
 * @param options - Optional defaults (vendor → model/effort) and acceptable-model
 *   roster. Defaults are merged onto any slot that did not name its own values.
 *   A slot's own model and effort always win.
 */
export function enter(config: FanConfig, state?: FanState, options?: EnterOptions): FanTransition {
  validateConfig(config, options)

  // Latch: a live run absorbs the duplicate Enter. Any slot still running counts,
  // including one revived by a retry after the run itself went terminal.
  if (state && (hasLiveSlot(state) || state.lifecycle === 'held')) {
    return { state, commands: [] }
  }

  // Merge defaults into slot configs so every subsequent launch command
  // (workers, orchestrator) can read the resolved model/effort directly from
  // state.config.slots without re-receiving the options argument.
  const resolvedSlots = config.slots.map(slot => {
    const { model, effort } = resolveModelEffort(slot, options?.defaults)
    return {
      ...slot,
      ...(model !== undefined ? { model } : {}),
      ...(effort !== undefined ? { effort } : {})
    }
  })
  const resolvedConfig: FanConfig = { ...config, slots: resolvedSlots }

  const runId = freshRunId(options?.runId)
  const newSlots = blankSlots(resolvedConfig)

  // A fresh run restarts attempt numbering; the run id already separates runs.
  const attempts: Record<string, number> = {}
  for (const slot of resolvedConfig.slots) attempts[slot.id] = 0

  const orchestrator = resolvedConfig.slots.find(s => s.role === 'orchestrator') as SlotConfig

  const newState: FanState = {
    kind: 'orchestrated',
    runId,
    config: resolvedConfig,
    slots: newSlots,
    attempts,
    orchestrator: { phase: 'idle' },
    cumulativeTokens: 0,
    lifecycle: 'delegating'
  }

  // Every run starts with the orchestrator's delegation turn (ADR 0020). No
  // worker spends until the split it produces has been read and released.
  newState.orchestrator = { phase: 'running' }
  // The slot itself, not only the panel's status: the Enter latch reads live
  // slots, and the plate reads this slot's stream to show the split being
  // written. Without it a second Enter starts a second delegation.
  newSlots[orchestrator.id] = { phase: 'running' }
  attempts[orchestrator.id] = 1

  const workerSlotIds = resolvedConfig.slots.filter(s => s.role === 'worker').map(s => s.id)
  return {
    state: newState,
    commands: [
      {
        kind: 'launch_delegation',
        attempt: 1,
        slotId: orchestrator.id,
        vendor: orchestrator.vendor,
        question: resolvedConfig.question,
        delegation: resolvedConfig.delegation ?? '',
        workerSlotIds,
        // NONE, not the orchestrator's usual DOCS: the split is read at the
        // hold and never becomes a document. Only the synthesis turn does.
        scope: 'NONE',
        ...(orchestrator.model !== undefined ? { model: orchestrator.model } : {}),
        ...(orchestrator.effort !== undefined ? { effort: orchestrator.effort } : {}),
        ...(resolvedConfig.workspace !== undefined ? { workspace: resolvedConfig.workspace } : {})
      }
    ]
  }
}

// ---------------------------------------------------------------------------
// Public: step
// ---------------------------------------------------------------------------

/**
 * Feed a slot lifecycle event into the machine and get the next state + commands.
 * Events from an older run id are silently dropped (stale-event rejection).
 */
export function step(event: SlotEvent, state: FanState): FanTransition {
  // Stale run-id rejection — the single most important guard
  if (event.runId !== state.runId) {
    return { state, commands: [] }
  }

  // Ignore events once the run is closed
  if (isClosed(state)) {
    return { state, commands: [] }
  }

  // Stale-attempt rejection: an event from a superseded process for this slot.
  // Without it a killed orchestrator could complete the launch that replaced it.
  if (event.attempt !== (state.attempts[event.slotId] ?? 0)) {
    return { state, commands: [] }
  }

  if (event.kind === 'progress') {
    return handleProgress(event, state)
  }
  return handleTerminal(event, state)
}

function handleProgress(
  event: Extract<SlotEvent, { kind: 'progress' }>,
  state: FanState
): FanTransition {
  const slot = state.config.slots.find(s => s.id === event.slotId)
  if (!slot) return { state, commands: [] }

  // Don't overwrite already-terminal slots
  const current = state.slots[event.slotId]
  if (isTerminal(current)) return { state, commands: [] }

  // Keep the last usage the stream supplied when this event carries none, so a
  // card's throughput reading holds steady instead of blinking to unavailable
  // between the events that happen to include it.
  const carriedUsage = event.usage
    ?? (current?.phase === 'running' ? current.usage : undefined)

  const newSlots: Record<string, SlotStatus> = {
    ...state.slots,
    [event.slotId]: {
      phase: 'running' as const,
      partialText: event.partialText,
      usage: carriedUsage
    }
  }
  const tokens = countTokens(event.usage)
  return {
    state: {
      ...state,
      slots: newSlots,
      cumulativeTokens: state.cumulativeTokens + tokens
    },
    commands: []
  }
}

function handleTerminal(
  event: Extract<SlotEvent, { kind: 'terminal' }>,
  state: FanState
): FanTransition {
  const slot = state.config.slots.find(s => s.id === event.slotId)
  if (!slot) return { state, commands: [] }

  // Don't double-count a slot that is already terminal
  const current = state.slots[event.slotId]
  if (isTerminal(current)) return { state, commands: [] }

  const tokens = countTokens(event.usage)
  const cumulativeTokens = state.cumulativeTokens + tokens

  // Build updated slot status
  let newStatus: SlotStatus
  const { outcome } = event
  switch (outcome.kind) {
    case 'completed':
      newStatus = {
        phase: 'completed',
        text: outcome.text,
        sessionId: outcome.sessionId,
        usage: event.usage
      }
      break
    case 'process_crash':
      newStatus = {
        phase: 'process_crash',
        message: outcome.message,
        diagnosticOutput: outcome.diagnosticOutput
      }
      break
    case 'quota':
      newStatus = { phase: 'quota', message: outcome.message }
      break
    case 'stream_invalid':
      newStatus = {
        phase: 'stream_invalid',
        message: outcome.message,
        rawOutput: outcome.rawOutput
      }
      break
  }

  const newSlots: Record<string, SlotStatus> = { ...state.slots, [event.slotId]: newStatus }
  const newState: FanState = { ...state, slots: newSlots, cumulativeTokens }
  const commands: FanCommand[] = []

  // Route based on which role just went terminal
  if (slot.role === 'worker') {
    return handleWorkerTerminal(newState, commands)
  } else if (slot.role === 'orchestrator') {
    // The orchestrator takes two turns on one slot (ADR 0020). Which turn just
    // ended is read from the lifecycle, because the two are the same process
    // kind and only their place in the run tells them apart.
    return state.lifecycle === 'delegating'
      ? handleDelegationTerminal(event, newState, commands)
      : handleSynthesisTerminal(event, newState, commands)
  }

  return { state: newState, commands }
}

/**
 * The orchestrator's delegation turn ended. Its text is parsed into one task per
 * worker and the run holds, so the split is read before the workers spend.
 */
function handleDelegationTerminal(
  event: Extract<SlotEvent, { kind: 'terminal' }>,
  state: FanState,
  commands: FanCommand[]
): FanTransition {
  if (event.outcome.kind !== 'completed') {
    // No split, so nothing to release. The orchestrator slot may be retried.
    return { state: { ...state, lifecycle: 'delegating', orchestrator: { phase: 'failed' } }, commands }
  }

  const workerSlotIds = state.config.slots.filter(s => s.role === 'worker').map(s => s.id)
  const parsed = parseDelegation(event.outcome.text, workerSlotIds)

  return {
    state: {
      ...state,
      lifecycle: 'held',
      // Back to idle: this slot's second turn is the one whose status the plate
      // reports as the orchestrator's.
      orchestrator: { phase: 'idle' },
      delegation: { text: event.outcome.text, ...parsed }
    },
    commands
  }
}

// ---------------------------------------------------------------------------
// Public: release
// ---------------------------------------------------------------------------

export function release(state: FanState): FanTransition {
  if (state.lifecycle !== 'held') return { state, commands: [] }
  return launchWorkers(state)
}

function handleWorkerTerminal(state: FanState, commands: FanCommand[]): FanTransition {
  const workers = state.config.slots.filter(s => s.role === 'worker')
  const allWorkersTerminal = workers.every(w => isTerminal(state.slots[w.id]))

  if (!allWorkersTerminal) {
    // Still waiting on at least one worker
    return { state, commands }
  }

  // All workers are terminal — check if we can run orchestrator
  const successfulWorkers = workers.filter(w => {
    const s = state.slots[w.id]
    return s !== undefined && s.phase === 'completed'
  })
  const failedWorkers = workers.filter(w => {
    const s = state.slots[w.id]
    return s === undefined || s.phase !== 'completed'
  })

  if (successfulWorkers.length < 2) {
    // Fewer than two valid workers — no comparison runs. This is terminal for the
    // run, not 'idle': answers and spend stay visible and a slot may still be retried.
    return { state: { ...state, lifecycle: 'unscored' }, commands }
  }

  const orchestratorSlot = state.config.slots.find(s => s.role === 'orchestrator')
  if (!orchestratorSlot) return { state, commands }

  const absentSlotIds = failedWorkers.map(w => w.id)

  const answers = successfulWorkers.flatMap(w => {
    const s = state.slots[w.id]
    if (s === undefined || s.phase !== 'completed') return []
    return [{ slotId: w.id, text: s.text }]
  })

  const newOrchestratorStatus: OrchestratorStatus = {
    phase: 'running',
    absentSlotIds: absentSlotIds.length > 0 ? absentSlotIds : undefined
  }

  // A recovered worker supersedes an in-flight comparison. Kill the running
  // orchestrator before launching its replacement, and bump the attempt so a late
  // event from the killed process cannot complete the replacement.
  const orchestratorWasLive = state.slots[orchestratorSlot.id]?.phase === 'running'
  if (orchestratorWasLive) {
    commands.push({ kind: 'kill_slot', slotId: orchestratorSlot.id })
  }

  const attempt = nextAttempt(state, orchestratorSlot.id)

  commands.push({
    kind: 'launch_synthesis',
    attempt,
    slotId: orchestratorSlot.id,
    vendor: orchestratorSlot.vendor,
    answers,
    absentSlotIds,
    scope: slotScope(orchestratorSlot),
    ...(orchestratorSlot.model !== undefined ? { model: orchestratorSlot.model } : {}),
    ...(orchestratorSlot.effort !== undefined ? { effort: orchestratorSlot.effort } : {}),
    ...(state.config.workspace !== undefined ? { workspace: state.config.workspace } : {})
  })

  const newSlots: Record<string, SlotStatus> = {
    ...state.slots,
    [orchestratorSlot.id]: { phase: 'running' }
  }

  return {
    state: {
      ...state,
      slots: newSlots,
      attempts: { ...state.attempts, [orchestratorSlot.id]: attempt },
      orchestrator: newOrchestratorStatus,
      lifecycle: 'synthesis'
    },
    commands
  }
}

function handleSynthesisTerminal(
  event: Extract<SlotEvent, { kind: 'terminal' }>,
  state: FanState,
  commands: FanCommand[]
): FanTransition {
  if (event.outcome.kind !== 'completed') {
    // Orchestrator failed - every valid answer remains; no partial write
    const newOrchestrator: OrchestratorStatus = { ...state.orchestrator, phase: 'failed' }
    return { state: { ...state, orchestrator: newOrchestrator }, commands }
  }

  // Valid completed orchestrator stream — emit write command
  const outputPath = archOutputPath(state.runId)
  const absentSlotIds = state.orchestrator.absentSlotIds ?? []
  const documentLabels = absentSlotIds.length > 0
    ? [`> PARTIAL ADVISORY: ${absentSlotIds.join(', ')} reported nothing. The synthesis is incomplete.`]
    : []
  const content = documentLabels.length > 0
    ? `${documentLabels.join('\n\n')}\n\n${event.outcome.text}`
    : event.outcome.text

  commands.push({
    kind: 'write_synthesis_document',
    outputPath,
    content,
    ...(absentSlotIds.length > 0 ? { partialAdvisory: { absentSlotIds } } : {})
  })

  const newOrchestrator: OrchestratorStatus = {
    phase: 'completed',
    outputPath,
    absentSlotIds: absentSlotIds.length > 0 ? absentSlotIds : undefined
  }

  return { state: { ...state, orchestrator: newOrchestrator, lifecycle: 'done' }, commands }
}

// ---------------------------------------------------------------------------
// Public: retry
// ---------------------------------------------------------------------------

/**
 * Retry a specific slot. Never reruns a successful worker.
 * Never changes the original question or the delegation already released.
 * Latches while the slot is already running.
 */
export function retry(state: FanState, slotId: string): FanTransition {
  const slot = state.config.slots.find(s => s.id === slotId)
  if (!slot) return { state, commands: [] }

  // A closed run is not resumable. Launching here would start a process whose
  // events `step` then drops, stranding the slot as permanently `running`.
  // Stop, close, shutdown and crash restoration all offer a new run instead.
  if (isClosed(state) || state.lifecycle === 'idle') {
    return { state, commands: [] }
  }

  // At the hold, the only thing worth retrying is the split itself: no worker
  // has spent yet, and redoing one would launch it against a delegation the
  // user has not released.
  if (state.lifecycle === 'held' && slot.role !== 'orchestrator') {
    return { state, commands: [] }
  }

  const current = state.slots[slotId]

  // Never retry a completed worker
  if (current !== undefined && current.phase === 'completed' && slot.role === 'worker') {
    return { state, commands: [] }
  }

  // Latch — already running
  if (current !== undefined && current.phase === 'running') {
    return { state, commands: [] }
  }

  // Only retry terminal-failed or idle slots
  if (current !== undefined && !isTerminal(current) && current.phase !== 'idle') {
    return { state, commands: [] }
  }

  const newSlots: Record<string, SlotStatus> = { ...state.slots, [slotId]: { phase: 'running' } }
  const commands: FanCommand[] = []

  if (slot.role === 'worker') {
    const attempt = nextAttempt(state, slot.id)
    commands.push({
      kind: 'launch_workers',
      slots: [{ slotId: slot.id, vendor: slot.vendor, question: state.config.question, attempt, scope: slotScope(slot), ...(slot.model !== undefined ? { model: slot.model } : {}), ...(slot.effort !== undefined ? { effort: slot.effort } : {}), ...(state.config.workspace !== undefined ? { workspace: state.config.workspace } : {}) }]
    })
    // A retried worker is in flight like any other, so the run returns to 'workers'.
    return {
      state: {
        ...state,
        slots: newSlots,
        attempts: { ...state.attempts, [slot.id]: attempt },
        lifecycle: 'workers'
      },
      commands
    }
  }

  if (slot.role === 'orchestrator'
    && (state.lifecycle === 'delegating' || state.lifecycle === 'held')) {
    // Redo the split. Nothing has spent yet, so this is the one retry that costs
    // a single turn rather than re-running the fan.
    const attempt = nextAttempt(state, slot.id)
    const workerSlotIds = state.config.slots.filter(s => s.role === 'worker').map(s => s.id)
    commands.push({
      kind: 'launch_delegation',
      attempt,
      slotId: slot.id,
      vendor: slot.vendor,
      question: state.config.question,
      delegation: state.config.delegation ?? '',
      workerSlotIds,
      scope: 'NONE',
      ...(slot.model !== undefined ? { model: slot.model } : {}),
      ...(slot.effort !== undefined ? { effort: slot.effort } : {}),
      ...(state.config.workspace !== undefined ? { workspace: state.config.workspace } : {})
    })
    return {
      state: {
        ...state,
        slots: newSlots,
        attempts: { ...state.attempts, [slot.id]: attempt },
        orchestrator: { phase: 'running' },
        // The previous split is dropped rather than kept alongside a new one.
        delegation: undefined,
        lifecycle: 'delegating'
      },
      commands
    }
  }

  if (slot.role === 'orchestrator') {
    const workers = state.config.slots.filter(s => s.role === 'worker')
    const successfulWorkers = workers.filter(w => {
      const s = state.slots[w.id]
      return s !== undefined && s.phase === 'completed'
    })
    if (successfulWorkers.length < 2) return { state, commands: [] }

    const absentSlotIds = workers
      .filter(w => {
        const s = state.slots[w.id]
        return s === undefined || s.phase !== 'completed'
      })
      .map(w => w.id)

    const answers = successfulWorkers.flatMap(w => {
      const s = state.slots[w.id]
      if (s === undefined || s.phase !== 'completed') return []
      return [{ slotId: w.id, text: s.text }]
    })

    const attempt = nextAttempt(state, slot.id)
    commands.push({
      kind: 'launch_synthesis',
      attempt,
      slotId: slot.id,
      vendor: slot.vendor,
      answers,
      absentSlotIds,
      scope: slotScope(slot),
      ...(slot.model !== undefined ? { model: slot.model } : {}),
      ...(slot.effort !== undefined ? { effort: slot.effort } : {}),
      ...(state.config.workspace !== undefined ? { workspace: state.config.workspace } : {})
    })

    const newOrchestrator: OrchestratorStatus = {
      ...state.orchestrator,
      phase: 'running',
      absentSlotIds: absentSlotIds.length > 0 ? absentSlotIds : undefined
    }

    return {
      state: {
        ...state,
        slots: newSlots,
        attempts: { ...state.attempts, [slot.id]: attempt },
        orchestrator: newOrchestrator,
        lifecycle: 'synthesis'
      },
      commands
    }
  }

  return { state: newSlots !== state.slots ? { ...state, slots: newSlots } : state, commands }
}

// ---------------------------------------------------------------------------
// Public: stop
// ---------------------------------------------------------------------------

/**
 * Kill every pending process tree immediately.
 * Completed answers and measured spend remain visible.
 * No comparison is ever launched after Stop.
 * Enter afterward starts a new run.
 */
export function stop(state: FanState): FanTransition {
  const commands: FanCommand[] = []
  const newSlots: Record<string, SlotStatus> = { ...state.slots }

  for (const slot of state.config.slots) {
    const s = state.slots[slot.id]
    if (s !== undefined && s.phase === 'running') {
      commands.push({ kind: 'kill_slot', slotId: slot.id })
      newSlots[slot.id] = { phase: 'stopped' }
    }
  }

  const newOrchestrator: OrchestratorStatus =
    state.orchestrator.phase === 'running'
      ? { ...state.orchestrator, phase: 'stopped' }
      : state.orchestrator

  return {
    state: { ...state, slots: newSlots, orchestrator: newOrchestrator, lifecycle: 'stopped' },
    commands
  }
}

// ---------------------------------------------------------------------------
// Public: shutdown
// ---------------------------------------------------------------------------

/**
 * Application shutdown: emits teardown for all fan process trees and records
 * the last durable terminal snapshot before exit.
 * Equivalent to stop, but for the shutdown path.
 */
export function shutdown(state: FanState): FanTransition {
  return stop(state)
}

// ---------------------------------------------------------------------------
// Public: restoreInterrupted
// ---------------------------------------------------------------------------

/**
 * After a crash, startup reconciliation opens a stale run as INTERRUPTED.
 * Restores completed answers and diagnostic streams; never resumes automatically.
 * Enter afterward starts a new run.
 */
export function restoreInterrupted(
  config: FanConfig,
  savedRunId: string,
  savedSlots: Record<string, SlotStatus>
): FanTransition {
  const restoredSlots: Record<string, SlotStatus> = blankSlots(config)
  // Only restore completed and diagnostic slots — never assume a pid is live
  for (const [id, status] of Object.entries(savedSlots)) {
    if (
      status.phase === 'completed' ||
      status.phase === 'process_crash' ||
      status.phase === 'stream_invalid'
    ) {
      restoredSlots[id] = status
    }
  }

  // A restored run is never resumed, so no attempt can be outstanding. Seeding
  // zero means any event arriving from a process that outlived the crash fails
  // the attempt check as well as the closed-lifecycle check.
  const restoredAttempts: Record<string, number> = {}
  for (const slot of config.slots) restoredAttempts[slot.id] = 0

  const restoredState: FanState = {
    kind: 'orchestrated',
    runId: savedRunId,
    config,
    slots: restoredSlots,
    attempts: restoredAttempts,
    orchestrator: { phase: 'idle' },
    cumulativeTokens: 0,
    lifecycle: 'interrupted'
  }

  return { state: restoredState, commands: [] }
}

// ---------------------------------------------------------------------------
// Event emitter — onEvent subscription (same shape as skill-runner's onRunEvent)
// ---------------------------------------------------------------------------

const emitter = new EventEmitter()

export function onEvent(listener: (transition: FanTransition) => void): () => void {
  emitter.on('fan', listener)
  return () => emitter.off('fan', listener)
}

/** Internal: emit a transition to subscribers. */
export function emitTransition(transition: FanTransition): void {
  emitter.emit('fan', transition)
}
