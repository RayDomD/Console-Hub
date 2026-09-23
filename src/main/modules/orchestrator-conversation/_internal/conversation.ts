/**
 * The Orchestrator conversation against a real harness.
 *
 * The reducer decides what the transcript becomes; this decides when. Its one
 * real job is identity: a harness run id is bound to the turn that started it,
 * so a superseded process's late event cannot write into the reply that replaced
 * it - the same rule `FanRuntime` follows, for the same reason.
 *
 * It never learns about the Fan. Main bridges the two, so a run record can exist
 * here without this module importing the machine that produced it.
 */

import { EventEmitter } from 'node:events'
import {
  appendDelegation,
  appendSynthesis,
  configure,
  freshConversation,
  restoreConversation,
  retryLastMessage,
  send,
  serialize,
  turnCompleted,
  turnFailed,
  turnProgressed,
  type CapturedSnapshot
} from './reducer'
import { buildPrompt, type WorkerDescriptor } from './prompt'
import type {
  ConversationEntry,
  ConversationSettings,
  ConversationSnapshotFile,
  ConversationState,
  DelegationAssignment
} from '../../../../shared/orchestrator-conversation'
import type { HarnessEvent, HarnessRunOptions, HarnessVendor } from '../../../../shared/harness'

/** What the conversation needs from the harness. Injected so tests spawn nothing. */
export interface ConversationHarnessPort {
  start(options: HarnessRunOptions): { runId: string }
  cancel(runId: string): boolean
  onEvent(listener: (event: HarnessEvent) => void): () => void
}

export interface ConversationOptions {
  harness: ConversationHarnessPort
  /**
   * The dedicated Orchestrator slot's frozen vendor, model and effort, read when
   * a conversation starts rather than held: the Stack is editable while Console Hub
   * runs, and a value pinned at construction would be the one from window open.
   */
  settings: () => ConversationSettings
  /**
   * The live worker slots, read when a turn begins so the Orchestrator's prompt
   * can name the available slots to delegate to.
   */
  workers?: () => readonly WorkerDescriptor[]
  /**
   * Replaces `buildPrompt` entirely when present. The Fan's framing ("a fan
   * run", "worker agents in slots") is wrong for a caller whose entries mean
   * something else - the Console Orchestrator (ADR 0050), for one - and this
   * is how such a caller supplies its own preamble without this class needing
   * to know that caller exists.
   */
  promptOverride?: (entries: readonly ConversationEntry[]) => string
  load: () => unknown
  save: (file: ConversationSnapshotFile) => void
  now?: () => number
  freshId?: () => string
}

const CHANGED = 'changed'

/**
 * The Orchestrator plans and reads; it never writes. Console Hub performs every
 * document write itself, so `NONE` is the whole scope this conversation needs.
 */
const CONVERSATION_SCOPE = 'NONE'

/** The vendors the harness can actually launch. Anything else is refused loudly. */
function toHarnessVendor(vendor: string): HarnessVendor {
  if (vendor === 'claude' || vendor === 'codex' || vendor === 'agy') return vendor
  throw new Error(`Orchestrator vendor '${vendor}' is not a harnessable executor`)
}

export interface DelegationNote {
  runId: string
  assignments: DelegationAssignment[]
  degraded: boolean
}

export interface SynthesisNote {
  runId: string
  text: string
  outputPath?: string
  absentSlotIds?: string[]
}

/** What a proposal would send to the Fan, or nothing when there is no approved task. */
export interface ProposedTask {
  question: string
  delegation: string
}

export class OrchestratorConversation {
  private readonly harness: ConversationHarnessPort
  private readonly settingsSource: () => ConversationSettings
  private readonly workersSource?: () => readonly WorkerDescriptor[]
  private readonly promptOverride?: (entries: readonly ConversationEntry[]) => string
  private readonly save: (file: ConversationSnapshotFile) => void
  private readonly now: () => number
  private readonly freshId: () => string
  private readonly emitter = new EventEmitter()
  private readonly detach: () => void
  private state: ConversationState
  /** The harness run backing the live turn, or nothing when none is live. */
  private liveRunId?: string

  constructor(options: ConversationOptions) {
    this.harness = options.harness
    this.settingsSource = options.settings
    this.workersSource = options.workers
    this.promptOverride = options.promptOverride
    this.save = options.save
    this.now = options.now ?? (() => Date.now())
    this.freshId = options.freshId ?? (() => Math.random().toString(36).slice(2))

    this.state = restoreConversation(options.load())
      ?? freshConversation({
        id: this.freshId(),
        at: this.now(),
        settings: options.settings()
      })

    this.detach = this.harness.onEvent((event) => this.ingest(event))
  }

  current(): ConversationState {
    return this.state
  }

  onChange(listener: (state: ConversationState) => void): () => void {
    this.emitter.on(CHANGED, listener)
    return () => { this.emitter.off(CHANGED, listener) }
  }

  configure(patch: Partial<ConversationSettings>): ConversationState {
    return this.commit(configure(this.state, patch))
  }

  /**
   * One message, and the turn that answers it.
   *
   * The snapshot is captured by the caller and passed in, never read from here:
   * this module has no view of a run, and the capture time recorded with it is
   * what makes a stale answer recognisable as stale.
   */
  send(text: string, snapshot?: CapturedSnapshot): ConversationState {
    const trimmed = text.trim()
    if (trimmed.length === 0) return this.state

    const next = send(this.state, { id: this.freshId(), at: this.now(), text: trimmed, snapshot })
    if (next === this.state) return this.state

    this.commit(next)
    this.startTurn()
    return this.state
  }

  /** Start a new session from the stored transcript. The message is not resent. */
  retry(): ConversationState {
    const next = retryLastMessage(this.state, this.now())
    if (next === this.state) return this.state

    this.commit(next)
    this.startTurn()
    return this.state
  }

  /**
   * Discard the transcript and start over. A live turn is cancelled rather than
   * abandoned: it would otherwise keep spending against a conversation nobody
   * can read any more.
   */
  newConversation(): ConversationState {
    this.cancelLive()
    return this.commit(freshConversation({
      id: this.freshId(),
      at: this.now(),
      settings: this.settingsSource()
    }))
  }

  noteDelegation(note: DelegationNote): ConversationState {
    return this.commit(appendDelegation(this.state, {
      id: this.freshId(),
      at: this.now(),
      ...note
    }))
  }

  noteSynthesis(note: SynthesisNote): ConversationState {
    return this.commit(appendSynthesis(this.state, {
      id: this.freshId(),
      at: this.now(),
      ...note
    }))
  }

  /**
   * The task a proposal would freeze: what the user last asked for, and how the
   * Orchestrator last said to split it.
   *
   * The Fan still writes the per-slot split itself - it is the execution
   * authority (ADR 0049) - so this hands it a question and a steer, not tasks.
   * Absent until a reply has actually landed: proposing off a turn still in
   * flight would release workers against half a plan.
   */
  proposedTask(): ProposedTask | undefined {
    const question = [...this.state.entries]
      .reverse()
      .find((entry) => entry.kind === 'user')?.text
    const delegation = [...this.state.entries]
      .reverse()
      .find((entry) => entry.kind === 'orchestrator' && entry.phase === 'complete')
    if (question === undefined || delegation?.kind !== 'orchestrator') return undefined
    return { question, delegation: delegation.text }
  }

  /** Detach from the harness. Called when main tears the window down. */
  shutdown(): void {
    this.cancelLive()
    this.detach()
    this.emitter.removeAllListeners()
  }

  private startTurn(): void {
    const { vendor, model, effort } = this.state.settings
    const workers = this.workersSource?.()
    const prompt = this.promptOverride
      ? this.promptOverride(this.state.entries)
      : buildPrompt(this.state.entries, workers !== undefined ? { workers } : undefined)
    const { runId } = this.harness.start({
      vendor: toHarnessVendor(vendor),
      prompt,
      scope: CONVERSATION_SCOPE,
      model,
      effort
    })
    this.liveRunId = runId
  }

  private cancelLive(): void {
    if (this.liveRunId === undefined) return
    this.harness.cancel(this.liveRunId)
    this.liveRunId = undefined
  }

  private ingest(event: HarnessEvent): void {
    if (event.runId !== this.liveRunId) return

    switch (event.phase) {
      case 'running':
        return
      case 'partial':
        this.commit(turnProgressed(this.state, event.text))
        return
      case 'completed':
        this.liveRunId = undefined
        this.commit(turnCompleted(this.state, event.text, this.now()))
        return
      case 'faulted':
        this.liveRunId = undefined
        this.commit(turnFailed(this.state, event.fault.message, this.now()))
        return
      case 'cancelled':
        // Cancellation is always something this module asked for, and it has
        // already moved on. Feeding it back would react to its own command.
        return
    }
  }

  private commit(next: ConversationState): ConversationState {
    if (next === this.state) return this.state
    this.state = next
    this.save(serialize(next))
    this.emitter.emit(CHANGED, next)
    return next
  }
}
