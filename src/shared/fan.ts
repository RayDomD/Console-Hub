/**
 * The question-fan lifecycle contract, shared by main, preload and renderer.
 *
 * Types only - nothing here executes. It exists because the three sides compile
 * as separate TypeScript projects: without a shared file the renderer would have
 * to import main's source to know the shape of a fan event, which is exactly the
 * dependency `contextIsolation` exists to prevent.
 */

// ---------------------------------------------------------------------------
// Slot input — what the caller feeds into the machine
// ---------------------------------------------------------------------------

/**
 * The vendor that produced the slot's output (mirrors the harness contract
 * so the adapter is a straight mapping with no information lost).
 */
export type FanVendor = string

/**
 * Measured token counts and observed throughput, where the stream supplies them.
 */
export interface SlotUsage {
  inputTokens?: number
  /**
   * Input the vendor served from cache, under one name. The vendors disagree on
   * theirs - codex says `cached_input_tokens`, claude says
   * `cache_read_input_tokens` - and the renderer should not have to know that.
   */
  cachedInputTokens?: number
  outputTokens?: number
  /** Observed tokens per second. */
  throughput?: number
}

/**
 * The slot's turn is complete and the assistant text is available.
 */
export interface SlotCompleted {
  kind: 'completed'
  text: string
  /** Captured session id where the stream supplies one. */
  sessionId?: string
  usage?: SlotUsage
}

/**
 * The process exited before a valid turn boundary.
 * Any partial stream is diagnostic only, never an answer.
 * Recovery: retry that slot only.
 */
export interface SlotFaultProcessCrash {
  kind: 'process_crash'
  /** Human-readable detail from the runner. Preserved from the harness fault. */
  message?: string
  /** Raw partial output retained for diagnosis. */
  diagnosticOutput?: string
}

/**
 * The vendor's quota is exhausted.
 * No automatic retry and no hidden wait.
 * Recovery: retry deliberately when quota is available.
 */
export interface SlotFaultQuota {
  kind: 'quota'
  /** Human-readable detail from the runner. Preserved from the harness fault. */
  message?: string
}

/**
 * The stream was malformed.
 * Raw output is retained for diagnosis; the slot is failed closed.
 * Recovery: retry that slot with a fresh process.
 */
export interface SlotFaultStreamInvalid {
  kind: 'stream_invalid'
  /** Human-readable detail from the runner. Preserved from the harness fault. */
  message?: string
  /** Raw output retained for diagnosis. */
  rawOutput?: string
}

/** Three discriminated terminal faults — mirrors the harness contract exactly. */
export type SlotFault =
  | SlotFaultProcessCrash
  | SlotFaultQuota
  | SlotFaultStreamInvalid

/** Terminal outcome for a slot: either a completed turn or a fault. */
export type SlotOutcome = SlotCompleted | SlotFault

/**
 * A lifecycle event the caller delivers to the machine.
 * Every event carries a run id so events from an older run are ignored.
 */
export interface SlotProgressEvent {
  kind: 'progress'
  runId: string
  /**
   * Which launch of this slot produced the event. Rejected like a stale run id
   * when it does not match the slot's current attempt, so a superseded process
   * cannot complete the launch that replaced it.
   */
  attempt: number
  slotId: string
  vendor: FanVendor
  /** Partial text accumulated so far. */
  partialText?: string
  usage?: SlotUsage
}

export interface SlotTerminalEvent {
  kind: 'terminal'
  runId: string
  /** See `SlotProgressEvent.attempt`. */
  attempt: number
  slotId: string
  vendor: FanVendor
  outcome: SlotOutcome
  usage?: SlotUsage
}

export type SlotEvent = SlotProgressEvent | SlotTerminalEvent

// ---------------------------------------------------------------------------
// Fan configuration — fixed at creation
// ---------------------------------------------------------------------------

/**
 * A slot in the fan. Workers run in worker slots; the orchestrator runs in the
 * orchestrator slot, taking two turns on it - the delegation and the synthesis
 * (ADR 0020).
 */
export type SlotRole = 'worker' | 'orchestrator'

/**
 * Phase 1 scope for a slot.
 *
 * Both values are read-only at the process level: Console Hub performs all document
 * writes itself from the orchestrator's text stream, so no agent ever needs write
 * tools. The distinction is what Console Hub does with the output, not what the
 * agent is allowed to do.
 *
 * - `NONE` — the slot's output is consumed but not persisted by Console Hub.
 * - `DOCS` — Console Hub writes the slot's text output to a file atomically.
 *
 * (CODE is phase 2 and is not declared here.)
 */
export type SlotScope = 'NONE' | 'DOCS'

export interface SlotConfig {
  /** Stable, unique within the fan. */
  id: string
  role: SlotRole
  vendor: FanVendor
  /** The model name the vendor CLI should use for this slot. Optional. */
  model?: string
  /** The effort level passed to the vendor CLI for this slot. Optional. */
  effort?: string
  /** The scope constraining what this slot (and Console Hub on its behalf) may do. Optional. */
  scope?: SlotScope
}

/**
 * The result of typing or clearing the fan's workspace, crossing back from main
 * where the filesystem check runs.
 */
export interface FanWorkspaceResult {
  /** Present when the value is accepted, including when it was cleared to none. */
  workspace?: string
  /** Present when a typed path was rejected. The stored workspace did not change. */
  error?: string
}

export interface FanConfig {
  /** 2-5 worker slots, and exactly one orchestrator slot. */
  slots: SlotConfig[]
  /** The raw question, sent verbatim to every worker slot. */
  question: string
  /**
   * An optional steer on how to split the work. The orchestrator decides the
   * split either way (ADR 0020); this only says what the user already knows
   * about how they want it divided.
   */
  delegation?: string
  /**
   * The folder every slot in this fan answers from, so every answer in one
   * comparison was produced with the same access. Absent when the fan has none,
   * which is itself a valid, represented state - not an unset field.
   */
  workspace?: string
}

// ---------------------------------------------------------------------------
// Fan state — what the machine exposes
// ---------------------------------------------------------------------------

/**
 * There is one kind of fan (ADR 0020). The type survives so a second kind - the
 * build fan of phase 2 - has somewhere to land without reshaping every consumer.
 */
export type FanKind = 'orchestrated'

export type SlotStatus =
  | { phase: 'idle' }
  | { phase: 'running'; partialText?: string; usage?: SlotUsage }
  | { phase: 'completed'; text: string; sessionId?: string; usage?: SlotUsage }
  | { phase: 'process_crash'; message?: string; diagnosticOutput?: string }
  | { phase: 'quota'; message?: string }
  | { phase: 'stream_invalid'; message?: string; rawOutput?: string }
  /** Set when Stop is called while the slot is in-flight. */
  | { phase: 'stopped' }

export interface OrchestratorStatus {
  phase: 'idle' | 'running' | 'completed' | 'failed' | 'stopped'
  /**
   * Only populated once the machine emits a WriteSynthesisDocument command.
   * The machine decides the path; the caller performs the atomic write.
   */
  outputPath?: string
  /**
   * When the synthesis ran with fewer than all workers, names the slots that
   * were absent so the output can be labelled `PARTIAL ADVISORY`.
   */
  absentSlotIds?: string[]
}

/** What the orchestrator's first turn produced, and how well it split. */
export interface DelegationResult {
  /** The orchestrator's turn-1 output, verbatim. Turn 2 is given this unchanged. */
  text: string
  /** The task each worker slot was actually sent, keyed by slot id. */
  tasks: Record<string, string>
  /**
   * True when no per-slot split could be read out of the text and every worker
   * was sent the whole thing. The plate must say so: a split that did not happen
   * must never be presented as one that did.
   */
  degraded: boolean
}

export interface FanState {
  kind: FanKind
  runId: string
  /** The question and slot config, fixed at Enter. */
  config: FanConfig
  /** Per-slot status, keyed by slot id. */
  slots: Record<string, SlotStatus>
  /**
   * How many times each slot has been launched, keyed by slot id. Incremented
   * on every launch; an event carrying an older attempt is discarded.
   */
  attempts: Record<string, number>
  orchestrator: OrchestratorStatus
  /**
   * The orchestrator's delegation turn, on an orchestrated run. Absent on a
   * question fan, and absent on an orchestrated run until that turn completes.
   */
  delegation?: DelegationResult
  /** Cumulative token count across all slots (input + output). */
  cumulativeTokens: number
  lifecycle: FanLifecycle
}

export type FanLifecycle =
  | 'idle'        // no run yet
  | 'delegating'  // orchestrated only: the orchestrator's first turn is in flight
  | 'held'        // the split is written; no process running until release
  | 'workers'     // workers running their delegated tasks
  | 'synthesis'   // the orchestrator's second turn is in flight
  | 'done'       // comparison complete
  | 'unscored'   // every worker is terminal but fewer than two produced a valid answer, so no
                 // comparison ran; answers and spend stay visible and a slot may still be retried
  | 'stopped'    // Stop was called; no resume
  | 'interrupted' // crash-restored; no resume; offers Restart as new run

// ---------------------------------------------------------------------------
// Fan output — commands the machine emits; the caller performs all effects
// ---------------------------------------------------------------------------

/** Launch all worker slots simultaneously. */
export interface CmdLaunchWorkers {
  kind: 'launch_workers'
  slots: Array<{
    slotId: string
    vendor: FanVendor
    question: string
    attempt: number
    model?: string
    effort?: string
    scope?: SlotScope
    /** The fan's workspace, fixed at Enter. Absent when the fan has none. */
    workspace?: string
  }>
}

/**
 * Launch the orchestrator's delegation turn - its first of two (ADR 0019).
 * Orchestrated runs only, and always before any worker spends.
 */
export interface CmdLaunchDelegation {
  kind: 'launch_delegation'
  attempt: number
  slotId: string
  vendor: FanVendor
  question: string
  /** What the user told the orchestrator to delegate. */
  delegation: string
  /** The worker slot ids the orchestrator must write a task for, in order. */
  workerSlotIds: string[]
  model?: string
  effort?: string
  scope?: SlotScope
  workspace?: string
}

/** Launch the orchestrator's second turn: the synthesis. */
export interface CmdLaunchSynthesis {
  kind: 'launch_synthesis'
  /** Echo this back on every event from the process this command starts. */
  attempt: number
  slotId: string
  vendor: FanVendor
  /** What each worker reported back. */
  answers: Array<{ slotId: string; text: string }>
  /**
   * Slots that reported nothing.
   * Present when the synthesis is partial (some workers failed).
   */
  absentSlotIds: string[]
  model?: string
  effort?: string
  scope?: SlotScope
  /** The fan's workspace, fixed at Enter. Absent when the fan has none. */
  workspace?: string
}

/**
 * Kill the process for a single slot.
 * Emitted when Stop is called while a slot is in-flight.
 */
export interface CmdKillSlot {
  kind: 'kill_slot'
  slotId: string
}

/**
 * The machine has determined that the synthesis document should be written.
 * The caller must perform an atomic write to `outputPath` so a failure cannot
 * leave a plausible-looking partial file.
 */
export interface CmdWriteSynthesisDocument {
  kind: 'write_synthesis_document'
  outputPath: string
  /** The full text produced by the orchestrator's synthesis turn. */
  content: string
  /** Present when written after a partial synthesis. */
  partialAdvisory?: { absentSlotIds: string[] }
}

export type FanCommand =
  | CmdLaunchDelegation
  | CmdLaunchWorkers
  | CmdLaunchSynthesis
  | CmdKillSlot
  | CmdWriteSynthesisDocument

/**
 * A state transition emitted by the machine.
 * The caller applies the new state and executes each command in order.
 */
export interface FanTransition {
  state: FanState
  commands: FanCommand[]
}
