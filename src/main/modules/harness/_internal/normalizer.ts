import type { HarnessUsage, HarnessVendor } from '../../../../shared/harness'

export interface CompletedTurn {
  type: 'turn-completed'
  text: string
  sessionId?: string
  usage?: HarnessUsage
  durationMs?: number
}

export interface PartialTurn {
  type: 'turn-partial'
  text: string
  sessionId?: string
  usage?: HarnessUsage
}

export interface InvalidStream {
  type: 'stream-invalid'
  rawOutput: string
}

export interface VendorReportedError {
  type: 'vendor-error'
  message: string
}

export type NormalizedStreamEvent = PartialTurn | CompletedTurn | InvalidStream | VendorReportedError

export interface StreamState {
  vendor: HarnessVendor
  buffer: string
  rawOutput: string
  sessionId?: string
  assistantText?: string
  usage?: HarnessUsage
  invalid: boolean
}

export interface StreamResult {
  state: StreamState
  events: NormalizedStreamEvent[]
}

interface VendorEvent {
  event?: string
  type?: string
  subtype?: string
  session_id?: string
  thread_id?: string
  result?: string | AgyResult
  duration_api_ms?: number
  total_cost_usd?: number
  message?: string | {
    role?: string
    content?: Array<{ type?: string; text?: string }>
    usage?: VendorUsage
  }
  item?: {
    type?: string
    text?: string
  }
  step_update?: AgyStepUpdate
  usage?: VendorUsage
}

interface VendorUsage {
  input_tokens?: number
  cached_input_tokens?: number
  cache_write_input_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
  cache_read_tokens?: number
  output_tokens?: number
  reasoning_output_tokens?: number
  thinking_tokens?: number
}

interface AgyStepUpdate {
  conversation_id?: string
  text_delta?: string
  usage?: VendorUsage
}

interface AgyResult {
  conversation_id?: string
  status?: string
  response?: string
  error?: string
  duration_seconds?: number
  usage?: VendorUsage
}

export function createStreamState(vendor: HarnessVendor): StreamState {
  return { vendor, buffer: '', rawOutput: '', invalid: false }
}

export function normalizeStreamChunk(state: StreamState, chunk: string): StreamResult {
  if (state.invalid) return { state, events: [] }

  const rawOutput = state.rawOutput + chunk
  const pending = state.buffer + chunk
  const lines = pending.split(/\r?\n/u)
  const buffer = lines.pop() ?? ''
  return processLines({ ...state, rawOutput, buffer }, lines)
}

export function flushStream(state: StreamState): StreamResult {
  if (state.invalid || state.buffer.length === 0) return { state, events: [] }
  return processLines({ ...state, buffer: '' }, [state.buffer])
}

function processLines(initial: StreamState, lines: string[]): StreamResult {
  let state = initial
  const events: NormalizedStreamEvent[] = []

  for (const line of lines) {
    if (!line.trim()) continue

    let parsed: unknown
    try {
      parsed = JSON.parse(line) as unknown
    } catch {
      state = { ...state, invalid: true }
      return { state, events: [{ type: 'stream-invalid', rawOutput: state.rawOutput }] }
    }
    if (!isVendorEvent(parsed)) {
      state = { ...state, invalid: true }
      return { state, events: [{ type: 'stream-invalid', rawOutput: state.rawOutput }] }
    }

    const normalized = state.vendor === 'claude'
      ? normalizeClaudeEvent(state, parsed)
      : state.vendor === 'codex'
        ? normalizeCodexEvent(state, parsed)
        : normalizeAgyEvent(state, parsed)
    state = normalized.state
    if (normalized.event) events.push(normalized.event)
  }

  return { state, events }
}

function normalizeClaudeEvent(
  state: StreamState,
  event: VendorEvent
): { state: StreamState; event?: PartialTurn | CompletedTurn | VendorReportedError } {
  const sessionId = event.session_id ?? state.sessionId
  /**
   * A claude run that fails still ends with a `result` event - only its subtype
   * changes. Reading every non-success result as an ordinary mid-stream event
   * swallowed it, so the run fell through to `process exited N before a valid turn
   * boundary` and the vendor's own words never reached the card: the exact
   * misreading this harness exists to prevent.
   *
   * The subtypes are claude's own - `error_during_execution`, `error_max_turns`,
   * `error_max_budget_usd`, `error_max_structured_output_retries` alongside
   * `success`. **Which one an exhausted quota uses has never been observed**, so
   * nothing here decides that; this only stops the terminal event being dropped.
   * Classification stays where it already is for codex - the runner reads the
   * message - so a quota fault reads as QUOTA once its wording is known, and as a
   * crash carrying claude's text until then.
   */
  if (event.type === 'result' && event.subtype !== 'success') {
    const reported = typeof event.result === 'string' ? event.result.trim() : ''
    return {
      state: { ...state, sessionId },
      event: {
        type: 'vendor-error',
        message: reported || `claude ended with ${event.subtype ?? 'an unnamed error'}`
      }
    }
  }
  if (event.type !== 'result' || event.subtype !== 'success') {
    const usage = event.type === 'assistant'
      ? mergeUsage(
          state.usage,
          usageFrom(typeof event.message === 'object' ? event.message.usage : undefined)
        )
      : state.usage
    const text = event.type === 'assistant' ? assistantText(event) : undefined
    const next = { ...state, sessionId, usage, ...(text !== undefined ? { assistantText: text } : {}) }
    return text === undefined
      ? { state: next }
      : { state: next, event: { type: 'turn-partial', text, sessionId, usage: hasUsage(usage ?? {}) ? usage : undefined } }
  }

  const usage = usageFrom(event.usage)
  if (typeof event.total_cost_usd === 'number') usage.costUsd = event.total_cost_usd
  return {
    state: { ...state, sessionId, assistantText: typeof event.result === 'string' ? event.result : undefined, usage },
    event: {
      type: 'turn-completed',
      text: typeof event.result === 'string' ? event.result : '',
      sessionId,
      usage: hasUsage(usage) ? usage : undefined,
      durationMs: event.duration_api_ms
    }
  }
}

function normalizeCodexEvent(
  state: StreamState,
  event: VendorEvent
): { state: StreamState; event?: PartialTurn | CompletedTurn | VendorReportedError } {
  const sessionId = event.type === 'thread.started' ? event.thread_id : state.sessionId
  const text =
    event.type === 'item.completed' && event.item?.type === 'agent_message'
      ? event.item.text ?? ''
      : undefined
  const assistantText = text ?? state.assistantText

  if (event.type === 'error' && typeof event.message === 'string') {
    return {
      state: { ...state, sessionId, assistantText },
      event: { type: 'vendor-error', message: event.message }
    }
  }

  if (event.type !== 'turn.completed') {
    const next = { ...state, sessionId, assistantText }
    return text === undefined
      ? { state: next }
      : { state: next, event: { type: 'turn-partial', text, sessionId } }
  }

  const usage = usageFrom(event.usage)
  return {
    state: { ...state, sessionId, assistantText, usage },
    event: {
      type: 'turn-completed',
      text: assistantText ?? '',
      sessionId,
      usage: hasUsage(usage) ? usage : undefined
    }
  }
}

function normalizeAgyEvent(
  state: StreamState,
  event: VendorEvent
): { state: StreamState; event?: PartialTurn | CompletedTurn | VendorReportedError } {
  const update = event.step_update
  const sessionId = update?.conversation_id ?? agyResult(event)?.conversation_id ?? state.sessionId
  if (event.event === 'step_update' && typeof update?.text_delta === 'string') {
    const usage = mergeUsage(state.usage, usageFrom(update.usage))
    const next = { ...state, sessionId, assistantText: update.text_delta, usage }
    return {
      state: next,
      event: {
        type: 'turn-partial',
        text: update.text_delta,
        sessionId,
        usage: hasUsage(usage ?? {}) ? usage : undefined
      }
    }
  }

  const result = agyResult(event)
  if (event.event !== 'result' || !result) return { state: { ...state, sessionId } }
  if (result.status !== 'SUCCESS') {
    return {
      state: { ...state, sessionId },
      event: { type: 'vendor-error', message: result.error ?? `AGY ended with ${result.status ?? 'no status'}` }
    }
  }

  const usage = usageFrom(result.usage)
  return {
    state: { ...state, sessionId, assistantText: result.response, usage },
    event: {
      type: 'turn-completed',
      text: result.response ?? state.assistantText ?? '',
      sessionId,
      usage: hasUsage(usage) ? usage : undefined,
      durationMs: result.duration_seconds === undefined ? undefined : result.duration_seconds * 1000
    }
  }
}

function agyResult(event: VendorEvent): AgyResult | undefined {
  return typeof event.result === 'object' && event.result !== null ? event.result : undefined
}

function assistantText(event: VendorEvent): string | undefined {
  if (typeof event.message !== 'object') return undefined
  const text = event.message.content
    ?.filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text ?? '')
    .join('')
  return text === undefined || text.length === 0 ? undefined : text
}

function usageFrom(usage: VendorUsage | undefined): HarnessUsage {
  return {
    inputTokens: usage?.input_tokens,
    cachedInputTokens: usage?.cached_input_tokens,
    cacheWriteInputTokens: usage?.cache_write_input_tokens,
    cacheCreationInputTokens: usage?.cache_creation_input_tokens,
    cacheReadInputTokens: usage?.cache_read_input_tokens ?? usage?.cache_read_tokens,
    outputTokens: usage?.output_tokens,
    reasoningOutputTokens: usage?.reasoning_output_tokens ?? usage?.thinking_tokens
  }
}

function mergeUsage(
  current: HarnessUsage | undefined,
  next: HarnessUsage
): HarnessUsage | undefined {
  if (!hasUsage(next)) return current
  return { ...current, ...next }
}

function hasUsage(usage: HarnessUsage): boolean {
  return Object.values(usage).some((value) => value !== undefined)
}

function isVendorEvent(value: unknown): value is VendorEvent {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
