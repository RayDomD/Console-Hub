import { useEffect, useRef } from 'react'
import type { SlotConfig, SlotStatus, SlotUsage } from '../../../../../shared/fan'
import {
  agentRim,
  effortOptionLabel,
  effortOptions,
  FAN_VENDORS,
  type FanExecutor,
  lifecycleLabel,
  modelOptions,
  slotMetrics
} from './model'
import styles from './WorkerCard.module.css'

/**
 * One worker slot, rendered.
 *
 * Its own file because the slot card and the criteria panel are worked
 * separately: a card owns every terminal state a slot can reach, and the panel
 * owns the criteria gate. Splitting them keeps the two sets of edits from
 * landing in one file.
 */

const FAULT_PHASES = new Set<SlotStatus['phase']>(['process_crash', 'quota', 'stream_invalid'])

const SLOT_STATUS_LABELS: Partial<Record<SlotStatus['phase'], string>> = {
  idle: 'Idle',
  running: 'Running',
  completed: 'Done',
  stopped: 'Stopped',
  process_crash: 'Crash',
  quota: 'Quota exhausted',
  stream_invalid: 'Invalid stream'
}

/** Glyph run for faults — alternating fill reads as "broken", distinct from full or empty. */
const FAULT_GLYPHS = '▯▮▯▮'

export function isFaulted(status: SlotStatus | undefined): boolean {
  return status !== undefined && FAULT_PHASES.has(status.phase)
}

export function statusLabel(status: SlotStatus | undefined): string {
  if (status === undefined) return '▯▯▯▯ Idle'
  const glyphs = status.phase === 'completed' ? '▮▮▮▮'
    : isFaulted(status) ? FAULT_GLYPHS
    : '▯▯▯▯'
  const label = SLOT_STATUS_LABELS[status.phase] ?? lifecycleLabel(status.phase)
  return `${glyphs} ${label}`
}

export function slotText(status: SlotStatus | undefined): string {
  if (status?.phase === 'running') return status.partialText ?? ''
  if (status?.phase === 'completed') return status.text
  if (status?.phase === 'process_crash') {
    const parts: string[] = []
    if (status.message) parts.push(status.message)
    if (status.diagnosticOutput) parts.push(`[diagnostic] ${status.diagnosticOutput}`)
    return parts.join('\n')
  }
  if (status?.phase === 'quota') return status.message ?? ''
  if (status?.phase === 'stream_invalid') {
    const parts: string[] = []
    if (status.message) parts.push(status.message)
    if (status.rawOutput) parts.push(`[diagnostic] ${status.rawOutput}`)
    return parts.join('\n')
  }
  return ''
}

/**
 * Usage for the bar, live as well as final.
 *
 * A running slot carries whatever the stream has supplied so far, so the bar
 * fills during the run rather than staying blank until the turn ends. Where the
 * stream supplies nothing, `slotMetrics` says so plainly.
 */
export function slotUsage(status: SlotStatus | undefined): SlotUsage | undefined {
  if (status?.phase === 'running') return status.usage
  if (status?.phase === 'completed') return status.usage
  return undefined
}

/**
 * What the card shows, given what it has been told and what it remembers.
 *
 * `stopped` carries no text at all, and a fault carries only its diagnosis, so
 * a card reading the status alone would throw away everything its agent had
 * already said. The remembered scrollback stands in when the status is silent.
 * It is never merged with text the status does supply - a completed answer is
 * the answer, not the partial plus the answer.
 */
export function keptText(status: SlotStatus | undefined, remembered: string): string {
  const current = slotText(status)
  if (current.length > 0) return current
  return status === undefined || status.phase === 'idle' ? '' : remembered
}

/** Within this many pixels of the bottom, the card is following the stream. */
const PINNED_SLACK_PX = 6

export function WorkerCard({
  slot,
  status,
  streamKey,
  editable,
  codexModels,
  agyModels,
  onChange,
  onVendorChange,
  onRemove,
  showSettings = true
}: {
  slot: SlotConfig
  status: SlotStatus | undefined
  /**
   * Identifies the launch this card is showing. Changing it - a new run, or a
   * retry of this slot - is what clears the remembered scrollback, so a retry
   * does not read as an answer the fresh process has not produced yet.
   */
  streamKey: string
  /** False the moment a run starts, so no control looks editable while its agent works. */
  editable: boolean
  codexModels: readonly string[]
  agyModels: readonly string[]
  onChange: (patch: { model?: string; effort?: string }) => void
  onVendorChange: (vendor: FanExecutor) => void
  /**
   * Absent at the floor of two workers, and while a run is live. The limit is
   * shown by the control not being there rather than by an error afterwards.
   */
  onRemove?: () => void
  showSettings?: boolean
}): React.JSX.Element {
  const metrics = slotMetrics(slotUsage(status))
  const faulted = isFaulted(status)

  const remembered = useRef({ key: streamKey, text: '' })
  if (remembered.current.key !== streamKey) {
    remembered.current = { key: streamKey, text: '' }
  }
  const live = slotText(status)
  if (live.length > 0) remembered.current.text = live
  const text = keptText(status, remembered.current.text)

  // Follow the stream, but stop following the moment the reader scrolls up, so
  // reading a card mid-run is not yanked back to the bottom by the next chunk.
  const streamRef = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  useEffect(() => {
    const element = streamRef.current
    if (element === null || !pinned.current) return
    element.scrollTop = element.scrollHeight
  }, [text])

  const onStreamScroll = (): void => {
    const element = streamRef.current
    if (element === null) return
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    pinned.current = distance <= PINNED_SLACK_PX
  }

  const rim = agentRim(slot.vendor)

  return (
    <article className={`${styles.card}${rim !== undefined ? ` ${styles['card_' + rim]}` : ''}`}>
      <div
        className={`${styles.vendorCap}${rim !== undefined ? ` ${styles[rim]}` : ''}`}
        aria-hidden="true"
      />
      <div className={styles.cardBody}>
        <div className={styles.cardName}>
          <span className={styles.slotId}>{slot.id}</span>
          <span className={`${styles.slotVendor}${rim !== undefined ? ` ${styles['vendor_' + rim]}` : ''}`}>
            {slot.vendor} · {slot.model ?? 'vendor default'} · {slot.effort ?? 'default'}
          </span>
          {onRemove !== undefined && (
            <button
              className={styles.remove}
              type="button"
              aria-label={`Remove ${slot.id}`}
              onClick={onRemove}
            >
              Remove
            </button>
          )}
        </div>
        {showSettings && (
          <SlotSettings
            slot={slot}
            editable={editable}
            codexModels={codexModels}
            agyModels={agyModels}
            onChange={onChange}
            onVendorChange={onVendorChange}
          />
        )}
        <div className={styles.cardStatus}>{statusLabel(status)}</div>
        <div
          className={`${styles.stream}${faulted ? ` ${styles.diagnostic}` : ''}${!text ? ` ${styles.streamIdle}` : ''}`}
          ref={streamRef}
          onScroll={onStreamScroll}
        >
          {text || (
            <div className={styles.idleState}>
              <span className={styles.idleMark} aria-hidden="true">+</span>
              <span>Waiting for stream from Orchestrator delegation.</span>
            </div>
          )}
        </div>
        {faulted && (
          <button
            className={styles.retryButton}
            type="button"
            onClick={() => { void window.consoleHub.fan.retry(slot.id) }}
          >
            Retry
          </button>
        )}
      </div>
      <div className={styles.metrics}>
        <div className={styles.metricCell}>
          <span className={styles.metricKey}>RATE</span>
          <span className={styles.metricVal}>
            {metrics.throughput === 'Throughput unavailable' ? '—' : metrics.throughput}
          </span>
        </div>
        <div className={styles.metricCell}>
          <span className={styles.metricKey}>TOKENS</span>
          <span className={styles.metricVal}>
            {metrics.tokens === 'Tokens unavailable' ? '—' : metrics.tokens}
          </span>
        </div>
      </div>
      {metrics.context !== undefined && (
        <div className={styles.context}>
          <span className={styles.metricKey}>CONTEXT</span>
          <span className={styles.metricVal}>{metrics.context}</span>
        </div>
      )}
    </article>
  )
}

/**
 * The model and effort a slot will run on, edited where its answer will appear.
 *
 * Frozen rather than hidden once the fan is live: a control that vanishes mid-run
 * moves everything under it, and the value still has to be readable while the
 * agent is working. A disabled select reads as inert and holds its place.
 */
export function SlotSettings({ slot, editable, codexModels, agyModels, onChange, onVendorChange, vendorEditable = true }: {
  vendorEditable?: boolean
  slot: SlotConfig
  editable: boolean
  codexModels: readonly string[]
  agyModels: readonly string[]
  onChange: (patch: { model?: string; effort?: string }) => void
  onVendorChange: (vendor: FanExecutor) => void
}): React.JSX.Element {
  const models = modelOptions(slot.vendor, codexModels, slot.model, agyModels)
  const efforts = effortOptions(slot.vendor)

  return (
    <>
      <select
        className={styles.field}
        aria-label={`${slot.id} vendor`}
        disabled={!editable || !vendorEditable}
        value={slot.vendor}
        onChange={(event) => onVendorChange(event.target.value as FanExecutor)}
      >
        {FAN_VENDORS.map((vendor) => <option key={vendor} value={vendor}>{vendor}</option>)}
      </select>
      <select
        className={styles.field}
        aria-label={`${slot.id} model`}
        disabled={!editable}
        value={slot.model ?? ''}
        onChange={(event) => onChange({ model: event.target.value })}
      >
        {slot.model === undefined && <option value="">vendor default</option>}
        {models.map((model) => <option key={model} value={model}>{model}</option>)}
      </select>
      <select
        className={styles.field}
        aria-label={`${slot.id} effort`}
        disabled={!editable}
        value={slot.effort ?? ''}
        onChange={(event) => onChange({ effort: event.target.value })}
      >
        {slot.effort === undefined && <option value="">▯▯▯▯ DEFAULT</option>}
        {efforts.map((effort) => (
          <option key={effort} value={effort}>{effortOptionLabel(effort)}</option>
        ))}
      </select>
    </>
  )
}

/**
 * The control that adds a worker, shaped like the card it will become.
 *
 * A dashed card rather than a button in the sidebar, because the row is where
 * the count is read, and because at five workers it simply is not there - there
 * is nothing to click rather than something that says no.
 */
export function GhostCard({ onAdd }: { onAdd: () => void }): React.JSX.Element {
  return (
    <button className={styles.ghost} type="button" onClick={onAdd}>
      + add slot
    </button>
  )
}
