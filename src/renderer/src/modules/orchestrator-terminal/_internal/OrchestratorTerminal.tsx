import { useEffect, useRef, useState } from 'react'
import type { FanLifecycle, SlotConfig } from '../../../../../shared/fan'
import { SlotSettings } from '../../question-fan-plate'
import type {
  ConversationEntry,
  ConversationState,
  DelegationEntry,
  OrchestratorEntry,
  SnapshotEntry,
  SynthesisEntry,
  UserEntry
} from '../../../../../shared/orchestrator-conversation'
import {
  canPropose as canProposeNow,
  canRetry,
  composerDisabled,
  identityLabel,
  snapshotLine,
  stampLabel,
  turnLabel
} from './model'
import { orchestratorTerminalVerifyAttrs } from './OrchestratorTerminal.verify'
import styles from './OrchestratorTerminal.module.css'

/**
 * The Orchestrator conversation, as the Hub's one planning surface (ADR 0049).
 *
 * It replaced two panels that said overlapping things - a Delegation panel with
 * its own textarea and a read-only Orchestrator stream - plus the plate's Ask
 * box. All three were places to describe the same task, and a run could be
 * started from any of them.
 *
 * Nothing here is a shell. The composer sends a sentence over a seam that
 * carries no executable, no path and no process input; main decides what the
 * message becomes.
 */

const RIM_VENDORS = new Set(['claude', 'codex', 'agy'])

export function OrchestratorTerminal({ slots, lifecycle, codexModels, agyModels }: {
  slots: readonly SlotConfig[]
  lifecycle: FanLifecycle | undefined
  codexModels: readonly string[]
  agyModels: readonly string[]
}): React.JSX.Element | null {
  const [state, setState] = useState<ConversationState>()
  const [draft, setDraft] = useState('')
  const [routeError, setRouteError] = useState<string>()
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let mounted = true
    const unsubscribe = window.consoleHub.conversation.onState((next) => setState(next))
    void window.consoleHub.conversation.current().then((current) => {
      if (mounted) setState(current)
    })
    return () => { mounted = false; unsubscribe() }
  }, [])

  // The newest turn is the one being read. Held to the bottom rather than
  // animated there: DESIGN.md stops everything dead under reduced motion, and a
  // smooth scroll is the one thing a transcript does not need.
  useEffect(() => {
    const body = bodyRef.current
    if (body !== null) body.scrollTop = body.scrollHeight
  }, [state])

  if (state === undefined) return null

  const disabled = composerDisabled(state)
  const canPropose = canProposeNow(state, lifecycle)
  const rim = state.settings.vendor.toLowerCase()
  const settingSlot: SlotConfig = {
    id: 'orchestrator',
    role: 'orchestrator',
    vendor: state.settings.vendor,
    ...(state.settings.model !== undefined ? { model: state.settings.model } : {}),
    ...(state.settings.effort !== undefined ? { effort: state.settings.effort } : {})
  }

  const send = (): void => {
    const text = draft.trim()
    if (text.length === 0 || disabled) return
    setDraft('')
    if (text.toLowerCase() === '/clear') {
      void window.consoleHub.conversation.newConversation()
      return
    }
    void window.consoleHub.conversation.send(text)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    send()
  }

  return (
    <section
      className={`${styles.terminal}${RIM_VENDORS.has(rim) ? ` ${styles['card_' + rim]}` : ''}`}
      aria-labelledby="orchestrator-terminal-heading"
      {...orchestratorTerminalVerifyAttrs(
        state.turn,
        state.continuity,
        state.entries.length,
        state.runs.length,
        state.settingsLocked,
        canPropose
      )}
    >
      {RIM_VENDORS.has(rim) && (
        <div className={`${styles.vendorCap} ${styles[rim]}`} aria-hidden="true" />
      )}

      <header className={styles.head}>
        <h2 id="orchestrator-terminal-heading">Orchestrator</h2>
        <span className={`${styles.identity}${RIM_VENDORS.has(rim) ? ` ${styles['identity_' + rim]}` : ''}`}>{identityLabel(state.settings)}</span>
        {!state.settingsLocked && (
          <details className={styles.settings}>
            <summary>Configure</summary>
            <div>
              <SlotSettings
                slot={settingSlot}
                editable
                codexModels={codexModels}
                agyModels={agyModels}
                onChange={(patch) => { void window.consoleHub.conversation.configure(patch) }}
                onVendorChange={(vendor) => { void window.consoleHub.conversation.configure({ vendor }) }}
              />
            </div>
          </details>
        )}
        <span role="status" aria-live="polite">{turnLabel(state, lifecycle)}</span>
        <span className={styles.spacer} />
        {canRetry(state) && (
          <button
            type="button"
            className={styles.headButton}
            onClick={() => { void window.consoleHub.conversation.retry() }}
          >
            Retry last message
          </button>
        )}
        <button
          type="button"
          className={styles.headButton}
          onClick={() => { void window.consoleHub.conversation.newConversation() }}
        >
          New conversation
        </button>
      </header>

      <div className={styles.body} ref={bodyRef} aria-label="Transcript">
        {state.entries.length === 0 && (
          <p className={styles.empty}>
            Say what the Stack should work on. Nothing spends until you propose a delegation.
          </p>
        )}
        {state.entries.map((entry) => (
          <Entry key={entry.id} entry={entry} />
        ))}
      </div>

      <div className={styles.compose}>
        <span className={styles.prompt} aria-hidden="true">&gt;</span>
        <textarea
          className={styles.input}
          aria-label="Message the Orchestrator"
          rows={1}
          value={draft}
          disabled={disabled}
          placeholder={disabled
            ? 'Waiting for the Orchestrator to reply…'
            : 'Ask the Orchestrator about this run…'}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className={styles.send}
          disabled={disabled || draft.trim().length === 0}
          onClick={send}
        >
          Send
        </button>
        {canPropose && (
          <button
            type="button"
            className={styles.propose}
            onClick={() => {
              setRouteError(undefined)
              void window.consoleHub.conversation.propose([...slots]).catch((error: Error) => setRouteError(error.message))
            }}
          >
            Propose delegation
          </button>
        )}
      </div>
      {routeError && <p className={styles.failure} role="alert">{routeError}</p>}

      {state.continuity === 'restored' && (
        <p className={styles.note} role="status">
          Restored from disk. This is a new agent session with the transcript above as context.
        </p>
      )}
    </section>
  )
}

function Entry({ entry }: { entry: ConversationEntry }): React.JSX.Element {
  switch (entry.kind) {
    case 'user': return <UserTurn entry={entry} />
    case 'orchestrator': return <OrchestratorTurn entry={entry} />
    case 'delegation': return <AcceptedDelegation entry={entry} />
    case 'snapshot': return <RunStatusSnapshot entry={entry} />
    case 'synthesis': return <Synthesis entry={entry} />
  }
}

function UserTurn({ entry }: { entry: UserEntry }): React.JSX.Element {
  return (
    <article className={styles.entry}>
      <div className={styles.stamp}>You · {stampLabel(entry.at)}</div>
      <p className={styles.line}><span className={styles.marker}>&gt; </span>{entry.text}</p>
    </article>
  )
}

/**
 * One reply. A turn still in flight shows what has arrived so far, marked as
 * pending: partial text is evidence of what the turn is doing, not an answer.
 */
function OrchestratorTurn({ entry }: { entry: OrchestratorEntry }): React.JSX.Element {
  const pending = entry.phase === 'responding'
  return (
    <article className={styles.entry}>
      <div className={styles.stamp}>
        Orchestrator · {stampLabel(entry.at)}
        {pending ? ' · responding' : entry.phase === 'failed' ? ' · failed' : ''}
      </div>
      <p className={`${styles.line} ${styles.assistant}${pending ? ` ${styles.pending}` : ''}`}>
        <span className={styles.marker}>&lt; </span>
        {entry.text.length > 0 ? entry.text : pending ? 'Waiting for the first token.' : ''}
      </p>
      {entry.failure !== undefined && (
        <p className={styles.failure} role="alert">
          {entry.failure} · Retry last message starts a new session from this transcript.
        </p>
      )}
    </article>
  )
}

/**
 * The delegation the Fan accepted. Structured, and fixed: this records what was
 * released, so a later message in the same transcript cannot rewrite it.
 */
function AcceptedDelegation({ entry }: { entry: DelegationEntry }): React.JSX.Element {
  return (
    <article className={styles.entry}>
      <div className={styles.stamp}>Delegation · {stampLabel(entry.at)}</div>
      <div className={styles.delegation}>
        <div className={styles.delegationTitle}>Delegation accepted · run {entry.runId}</div>
        {entry.degraded ? (
          <p className={styles.degraded}>
            No per-slot split could be read, so every worker was sent all of it.
            This run is not a split.
          </p>
        ) : (
          <dl>
            {entry.assignments.map((assignment) => (
              <div key={assignment.slotId} className={styles.assignment}>
                <dt>{assignment.slotId}</dt>
                <dd>{assignment.task}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </article>
  )
}

/** A photograph of a live run, stamped with when it was taken. */
function RunStatusSnapshot({ entry }: { entry: SnapshotEntry }): React.JSX.Element {
  return (
    <article className={styles.entry}>
      <div className={styles.stamp}>
        Orchestrator · {stampLabel(entry.at)} · run-status snapshot
      </div>
      <div className={styles.snapshot}>
        {entry.workers.map((worker) => (
          <p key={worker.slotId} className={styles.snapshotLine}>{snapshotLine(worker)}</p>
        ))}
      </div>
    </article>
  )
}

function Synthesis({ entry }: { entry: SynthesisEntry }): React.JSX.Element {
  const absent = entry.absentSlotIds ?? []
  return (
    <article className={styles.entry}>
      <div className={styles.stamp}>
        Synthesis · {stampLabel(entry.at)} · run {entry.runId}
        {absent.length > 0 ? ` · partial advisory · absent ${absent.join(', ')}` : ''}
      </div>
      <p className={`${styles.line} ${styles.assistant}`}>{entry.text}</p>
      {entry.outputPath !== undefined && (
        <p className={styles.synthesisPath}>→ {entry.outputPath}</p>
      )}
    </article>
  )
}
