/**
 * The Orchestrator conversation contract, shared by main, preload and renderer.
 *
 * Types only - nothing here executes. It exists for the same reason `fan.ts`
 * does: the three sides compile as separate TypeScript projects, so the shape of
 * a transcript entry has to live somewhere none of them owns.
 *
 * ADR 0049: the dedicated Orchestrator slot is a persistent conversation, not a
 * read-only stream. It frames the Fan task, may be asked about a live run, and
 * receives the synthesis back into the same transcript.
 */

/** What the conversation runs on. Locked once the first message is sent. */
export interface ConversationSettings {
  vendor: string
  model?: string
  effort?: string
}

/** A message the user typed. */
export interface UserEntry {
  kind: 'user'
  id: string
  at: number
  text: string
}

/**
 * One Orchestrator reply. `responding` is the single live turn; a `failed` reply
 * keeps whatever text arrived before the fault, because partial text is evidence
 * of what the turn was doing and deleting it hides the failure.
 */
export interface OrchestratorEntry {
  kind: 'orchestrator'
  id: string
  at: number
  text: string
  phase: 'responding' | 'complete' | 'failed'
  /** Present on `failed`. The wording the vendor or harness gave. */
  failure?: string
}

/** One worker's assignment in an accepted delegation. */
export interface DelegationAssignment {
  slotId: string
  task: string
  /** Console only (ADR 0050): what the Orchestrator typed in first. Absent for a Fan slot. */
  launch?: string
  /** Console only (ADR 0051): what this was held on before being typed in. Absent for a Fan slot. */
  dependsOn?: readonly string[]
}

/**
 * The delegation the Fan accepted, written into the transcript where it was
 * proposed. Immutable: it records what was released, not what is running.
 */
export interface DelegationEntry {
  kind: 'delegation'
  id: string
  at: number
  runId: string
  assignments: DelegationAssignment[]
  /** True when no per-slot split could be read and every worker got all of it. */
  degraded: boolean
}

/** One worker, as it stood at the moment the snapshot was captured. */
export interface WorkerSnapshot {
  slotId: string
  phase: string
  elapsedMs: number
  /** The tail of what the worker has produced so far. May be empty. */
  excerpt: string
  outputTokens?: number
}

/**
 * A point-in-time view of a live run, captured when the user asked about it.
 *
 * It is a photograph, never a control channel: an answer built from it can be
 * stale by the time it is read, which is why the capture time is part of the
 * entry rather than implied by its position.
 */
export interface SnapshotEntry {
  kind: 'snapshot'
  id: string
  at: number
  runId: string
  lifecycle: string
  workers: WorkerSnapshot[]
}

/** The Fan's synthesis, returned to the conversation that proposed the run. */
export interface SynthesisEntry {
  kind: 'synthesis'
  id: string
  at: number
  runId: string
  text: string
  outputPath?: string
  /** Named when fewer than all workers answered. */
  absentSlotIds?: string[]
}

export type ConversationEntry =
  | UserEntry
  | OrchestratorEntry
  | DelegationEntry
  | SnapshotEntry
  | SynthesisEntry

/**
 * A run this conversation created, with every entry that preceded it.
 *
 * The transcript is copied, not referenced: a later message must not be able to
 * change what a released run was proposed from.
 */
export interface RunRecord {
  runId: string
  proposedAt: number
  transcript: ConversationEntry[]
}

/**
 * Whether this conversation's turns continue an agent session or start a fresh
 * one with the transcript as context. Restart and retry both produce `new`,
 * because vendor session resumption is not proven (ADR 0049).
 */
export type SessionContinuity = 'fresh' | 'restored'

export interface ConversationState {
  id: string
  startedAt: number
  settings: ConversationSettings
  /** True once the first message was sent. Changing vendor/model/effort after
   *  that would be a different agent session wearing the same transcript. */
  settingsLocked: boolean
  continuity: SessionContinuity
  entries: ConversationEntry[]
  /** `responding` disables the composer: replies are refused, never queued. */
  turn: 'idle' | 'responding' | 'failed'
  runs: RunRecord[]
}

/** The persisted shape. Versioned so a future change can refuse an old file. */
export interface ConversationSnapshotFile {
  version: 1
  state: ConversationState
}

export const CONVERSATION_FILE_VERSION = 1

/**
 * What releasing a Console delegation plan produced (ADR 0050). Mirrors
 * `main/modules/console-conversation`'s own `ReleaseResult` for the preload
 * seam - this file, not that module, is what the renderer is allowed to know
 * the shape of.
 */
export type ConsoleReleaseResult =
  | { kind: 'released'; assignments: readonly DelegationAssignment[] }
  | { kind: 'refused'; reason: string }
