/**
 * The Orchestrator conversation, as a pure function of what happened to it.
 *
 * No clock, no process, no disk: every moment a caller wants recorded arrives as
 * an argument, exactly like the fan machine. That is what makes the rules in
 * ADR 0049 - one live reply, settings that lock, a run record nothing can edit
 * after the fact - testable without spawning a vendor CLI.
 */

import {
  CONVERSATION_FILE_VERSION,
  type ConversationEntry,
  type ConversationSettings,
  type ConversationSnapshotFile,
  type ConversationState,
  type DelegationAssignment,
  type WorkerSnapshot
} from '../../../../shared/orchestrator-conversation'

export interface FreshOptions {
  id: string
  at: number
  settings: ConversationSettings
}

export function freshConversation({ id, at, settings }: FreshOptions): ConversationState {
  return {
    id,
    startedAt: at,
    settings,
    settingsLocked: false,
    continuity: 'fresh',
    entries: [],
    turn: 'idle',
    runs: []
  }
}

/**
 * Change what the conversation runs on, while that is still an honest thing to
 * do. After the first message the transcript belongs to one agent session, and
 * swapping the vendor under it would relabel history that another agent wrote.
 *
 * A vendor owns its models and its effort levels, so naming a new vendor clears
 * both rather than carrying a setting the new vendor would refuse - the same
 * rule the slot cards follow.
 */
export function configure(
  state: ConversationState,
  patch: Partial<ConversationSettings>
): ConversationState {
  if (state.settingsLocked) return state
  const base = patch.vendor !== undefined && patch.vendor !== state.settings.vendor
    ? { vendor: patch.vendor }
    : state.settings
  return { ...state, settings: { ...base, ...patch } }
}

/** What a status question is given about a run that is already moving. */
export interface CapturedSnapshot {
  runId: string
  lifecycle: string
  workers: WorkerSnapshot[]
}

export interface SendOptions {
  id: string
  at: number
  text: string
  /** Captured now, by the caller, because the reducer holds no run state. */
  snapshot?: CapturedSnapshot
}

/**
 * One user message, and the empty reply it is waiting on.
 *
 * The live reply is appended immediately rather than when the first token
 * arrives, so "a reply is live" is a fact about the transcript and not a second
 * flag that can disagree with it.
 */
export function send(state: ConversationState, options: SendOptions): ConversationState {
  if (state.turn === 'responding') return state

  const entries: ConversationEntry[] = [
    ...state.entries,
    { kind: 'user', id: options.id, at: options.at, text: options.text }
  ]

  if (options.snapshot !== undefined) {
    entries.push({
      kind: 'snapshot',
      id: `${options.id}-snapshot`,
      at: options.at,
      runId: options.snapshot.runId,
      lifecycle: options.snapshot.lifecycle,
      workers: options.snapshot.workers.map((worker) => ({ ...worker }))
    })
  }

  entries.push({
    kind: 'orchestrator',
    id: `${options.id}-reply`,
    at: options.at,
    text: '',
    phase: 'responding'
  })

  return { ...state, settingsLocked: true, turn: 'responding', entries }
}

function withLiveReply(
  state: ConversationState,
  update: (entry: Extract<ConversationEntry, { kind: 'orchestrator' }>) => ConversationEntry,
  turn: ConversationState['turn']
): ConversationState {
  const index = state.entries.findLastIndex(
    (entry) => entry.kind === 'orchestrator' && entry.phase === 'responding'
  )
  if (index === -1) return state
  const live = state.entries[index] as Extract<ConversationEntry, { kind: 'orchestrator' }>
  const entries = [...state.entries]
  entries[index] = update(live)
  return { ...state, turn, entries }
}

/** Partial text from the live turn. Diagnostic until the turn completes. */
export function turnProgressed(state: ConversationState, text: string): ConversationState {
  return withLiveReply(state, (entry) => ({ ...entry, text }), 'responding')
}

export function turnCompleted(
  state: ConversationState,
  text: string,
  at: number
): ConversationState {
  return withLiveReply(state, (entry) => ({ ...entry, text, at, phase: 'complete' }), 'idle')
}

/**
 * The turn faulted. Whatever text arrived stays: it is the only evidence of what
 * the turn was doing, and a failure that erases itself cannot be diagnosed.
 */
export function turnFailed(
  state: ConversationState,
  failure: string,
  at: number
): ConversationState {
  return withLiveReply(state, (entry) => ({ ...entry, at, phase: 'failed', failure }), 'failed')
}

/**
 * Retry the failed reply. The user message is not resent - it is already in the
 * transcript - so it appends a fresh live entry and the runtime starts a new
 * session from the same history. The failed entry stays visible: partial output
 * is evidence, and replacing it would erase the reason a retry was needed.
 */
export function retryLastMessage(state: ConversationState, at: number): ConversationState {
  if (state.turn !== 'failed') return state
  const index = state.entries.findLastIndex(
    (entry) => entry.kind === 'orchestrator' && entry.phase === 'failed'
  )
  if (index === -1) return state
  const last = state.entries[index] as Extract<ConversationEntry, { kind: 'orchestrator' }>
  return {
    ...state,
    turn: 'responding',
    entries: [
      ...state.entries,
      { kind: 'orchestrator', id: `${last.id}-retry`, at, text: '', phase: 'responding' }
    ]
  }
}

export interface DelegationInput {
  id: string
  at: number
  runId: string
  assignments: DelegationAssignment[]
  degraded: boolean
}

/**
 * A delegation the Fan accepted, and the run record that freezes what it was
 * proposed from.
 *
 * The transcript is copied at this instant. Later messages append to the live
 * conversation and leave the record alone, which is what makes "what was this
 * run asked to do" answerable after the conversation has moved on.
 */
export function appendDelegation(
  state: ConversationState,
  input: DelegationInput
): ConversationState {
  if (state.runs.some((run) => run.runId === input.runId)) return state

  const entry: ConversationEntry = {
    kind: 'delegation',
    id: input.id,
    at: input.at,
    runId: input.runId,
    assignments: input.assignments.map((assignment) => ({ ...assignment })),
    degraded: input.degraded
  }

  return {
    ...state,
    entries: [...state.entries, entry],
    runs: [
      ...state.runs,
      { runId: input.runId, proposedAt: input.at, transcript: state.entries.map(copyEntry) }
    ]
  }
}

export interface SynthesisInput {
  id: string
  at: number
  runId: string
  text: string
  outputPath?: string
  absentSlotIds?: string[]
}

/** The synthesis comes back to the conversation that proposed that run, or nowhere. */
export function appendSynthesis(
  state: ConversationState,
  input: SynthesisInput
): ConversationState {
  if (!state.runs.some((run) => run.runId === input.runId)) return state
  if (state.entries.some((entry) => entry.kind === 'synthesis' && entry.runId === input.runId)) {
    return state
  }
  return { ...state, entries: [...state.entries, { kind: 'synthesis', ...input }] }
}

export interface SnapshotInput extends CapturedSnapshot {
  id: string
  at: number
}

/** A run-status snapshot recorded on its own, outside a message. */
export function appendSnapshot(
  state: ConversationState,
  input: SnapshotInput
): ConversationState {
  return {
    ...state,
    entries: [
      ...state.entries,
      {
        kind: 'snapshot',
        id: input.id,
        at: input.at,
        runId: input.runId,
        lifecycle: input.lifecycle,
        workers: input.workers.map((worker) => ({ ...worker }))
      }
    ]
  }
}

function copyEntry(entry: ConversationEntry): ConversationEntry {
  if (entry.kind === 'delegation') {
    return { ...entry, assignments: entry.assignments.map((a) => ({ ...a })) }
  }
  if (entry.kind === 'snapshot') {
    return { ...entry, workers: entry.workers.map((w) => ({ ...w })) }
  }
  return { ...entry }
}

export function serialize(state: ConversationState): ConversationSnapshotFile {
  return { version: CONVERSATION_FILE_VERSION, state }
}

/**
 * Reopen a stored transcript as a new agent session with that history as
 * context (ADR 0049).
 *
 * A reply that was live when the process died is restored as failed rather than
 * as still responding: the process it belonged to is gone, and a composer left
 * disabled forever waiting on it would be a transcript lying about a vendor.
 */
export function restoreConversation(file: unknown): ConversationState | undefined {
  if (file === null || typeof file !== 'object') return undefined
  const parsed = file as Partial<ConversationSnapshotFile>
  if (parsed.version !== CONVERSATION_FILE_VERSION) return undefined

  const state = parsed.state
  if (state === undefined || !Array.isArray(state.entries) || !Array.isArray(state.runs)) {
    return undefined
  }

  const hasLive = state.turn === 'responding' || state.entries.some(
    (entry) => entry.kind === 'orchestrator' && entry.phase === 'responding'
  )

  const restored: ConversationState = {
    ...state,
    continuity: 'restored',
    turn: hasLive ? 'failed' : state.turn
  }

  if (!hasLive) return restored

  const entries = restored.entries.map((entry) => {
    if (entry.kind === 'orchestrator' && entry.phase === 'responding') {
      return {
        ...entry,
        phase: 'failed' as const,
        failure: 'Console Hub closed while this reply was in flight.'
      }
    }
    return entry
  })

  return { ...restored, entries }
}
