import { describe, expect, it } from 'vitest'
import { createStreamState, flushStream, normalizeStreamChunk } from './normalizer'

const CLAUDE_SESSION_ID = '3616b8a7-2346-42d9-9f56-42b7462bf351'
const CODEX_SESSION_ID = '01a05639-543c-7113-9e7a-45cee18d971b'
const AGY_CONVERSATION_ID = 'c3b66b04-872b-4fbe-a3a4-058a026ef20a'

const CLAUDE_CAPTURE =
  [
    JSON.stringify({
      type: 'system',
      subtype: 'init',
      session_id: CLAUDE_SESSION_ID
    }),
    JSON.stringify({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'OK' }],
        usage: {
          input_tokens: 2,
          cache_creation_input_tokens: 29316,
          cache_read_input_tokens: 0,
          output_tokens: 1
        }
      },
      session_id: CLAUDE_SESSION_ID
    }),
    JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: 'OK',
      session_id: CLAUDE_SESSION_ID,
      duration_api_ms: 2666,
      total_cost_usd: 0.29422699999999996,
      usage: {
        input_tokens: 2,
        cache_creation_input_tokens: 29316,
        cache_read_input_tokens: 0,
        output_tokens: 4
      }
    })
  ].join('\n') + '\n'

const CODEX_CAPTURE =
  [
    JSON.stringify({ type: 'thread.started', thread_id: CODEX_SESSION_ID }),
    JSON.stringify({ type: 'turn.started' }),
    JSON.stringify({
      type: 'item.completed',
      item: { id: 'item_0', type: 'agent_message', text: 'OK' }
    }),
    JSON.stringify({
      type: 'turn.completed',
      usage: {
        input_tokens: 22541,
        cached_input_tokens: 9984,
        cache_write_input_tokens: 0,
        output_tokens: 5,
        reasoning_output_tokens: 0
      }
    })
  ].join('\n') + '\n'

const AGY_CAPTURE =
  [
    JSON.stringify({
      event: 'step_update',
      step_update: {
        conversation_id: AGY_CONVERSATION_ID,
        state: 'DONE',
        step_type: 'agent_response',
        text_delta: 'OK',
        usage: { input_tokens: 12, output_tokens: 3, thinking_tokens: 2, cache_read_tokens: 5 }
      }
    }),
    JSON.stringify({
      event: 'result',
      result: {
        conversation_id: AGY_CONVERSATION_ID,
        status: 'SUCCESS',
        response: 'OK',
        duration_seconds: 2.5,
        usage: { input_tokens: 14, output_tokens: 4, thinking_tokens: 2, cache_read_tokens: 6 }
      }
    })
  ].join('\n') + '\n'

describe('normalizeStreamChunk', () => {
  it('normalizes the captured Claude assistant turn boundary', () => {
    const result = normalizeStreamChunk(createStreamState('claude'), CLAUDE_CAPTURE)

    expect(result.events).toEqual([
      {
        type: 'turn-partial',
        text: 'OK',
        sessionId: CLAUDE_SESSION_ID,
        usage: {
          inputTokens: 2,
          cacheCreationInputTokens: 29316,
          cacheReadInputTokens: 0,
          outputTokens: 1
        }
      },
      {
        type: 'turn-completed',
        text: 'OK',
        sessionId: CLAUDE_SESSION_ID,
        durationMs: 2666,
        usage: {
          inputTokens: 2,
          cacheCreationInputTokens: 29316,
          cacheReadInputTokens: 0,
          outputTokens: 4,
          costUsd: 0.29422699999999996
        }
      }
    ])
  })

  it('emits Claude assistant text as a partial turn before the result boundary', () => {
    const assistant = JSON.stringify({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Still working.' }],
        usage: { output_tokens: 2 }
      },
      session_id: CLAUDE_SESSION_ID
    })

    const result = normalizeStreamChunk(createStreamState('claude'), `${assistant}\n`)

    expect(result.events).toEqual([{
      type: 'turn-partial',
      text: 'Still working.',
      sessionId: CLAUDE_SESSION_ID,
      usage: { outputTokens: 2 }
    }])
  })

  it('reports a failed claude result as a vendor error carrying claude own words', () => {
    const failed = JSON.stringify({
      type: 'result',
      subtype: 'error_during_execution',
      is_error: true,
      result: 'Something went wrong while running the turn.',
      session_id: CLAUDE_SESSION_ID
    })

    const result = normalizeStreamChunk(createStreamState('claude'), `${failed}\n`)

    expect(result.events).toEqual([{
      type: 'vendor-error',
      message: 'Something went wrong while running the turn.'
    }])
  })

  it('names the subtype when a failed claude result carries no message', () => {
    const failed = JSON.stringify({
      type: 'result',
      subtype: 'error_max_turns',
      is_error: true,
      session_id: CLAUDE_SESSION_ID
    })

    const result = normalizeStreamChunk(createStreamState('claude'), `${failed}\n`)

    expect(result.events).toEqual([{
      type: 'vendor-error',
      message: 'claude ended with error_max_turns'
    }])
  })

  // The quota event shape is still unobserved (docs/tickets.md). Nothing may decide
  // that an unrecognised claude failure is a quota fault - a wrong guess would label
  // unrelated failures QUOTA, which is the outcome that ticket exists to prevent.
  it('does not itself decide that a failed claude result is a quota fault', () => {
    const failed = JSON.stringify({
      type: 'result',
      subtype: 'error_during_execution',
      is_error: true,
      result: 'connection reset by peer',
      session_id: CLAUDE_SESSION_ID
    })

    const result = normalizeStreamChunk(createStreamState('claude'), `${failed}\n`)

    expect(result.events).toEqual([{ type: 'vendor-error', message: 'connection reset by peer' }])
    expect(JSON.stringify(result.events)).not.toMatch(/quota/i)
  })

  it('still completes a successful claude result', () => {
    const ok = JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: 'Done.',
      session_id: CLAUDE_SESSION_ID
    })

    const result = normalizeStreamChunk(createStreamState('claude'), `${ok}\n`)

    expect(result.events).toEqual([{
      type: 'turn-completed',
      text: 'Done.',
      sessionId: CLAUDE_SESSION_ID,
      usage: undefined,
      durationMs: undefined
    }])
  })

  it('normalizes the captured Codex assistant turn boundary', () => {
    const result = normalizeStreamChunk(createStreamState('codex'), CODEX_CAPTURE)

    expect(result.events).toEqual([
      {
        type: 'turn-partial',
        text: 'OK',
        sessionId: CODEX_SESSION_ID
      },
      {
        type: 'turn-completed',
        text: 'OK',
        sessionId: CODEX_SESSION_ID,
        usage: {
          inputTokens: 22541,
          cachedInputTokens: 9984,
          cacheWriteInputTokens: 0,
          outputTokens: 5,
          reasoningOutputTokens: 0
        }
      }
    ])
  })

  it('emits a Codex agent message as partial text before turn completion', () => {
    const partial = [
      JSON.stringify({ type: 'thread.started', thread_id: CODEX_SESSION_ID }),
      JSON.stringify({
        type: 'item.completed',
        item: { id: 'item_0', type: 'agent_message', text: 'Still working.' }
      })
    ].join('\n') + '\n'

    const result = normalizeStreamChunk(createStreamState('codex'), partial)

    expect(result.events).toEqual([{
      type: 'turn-partial',
      text: 'Still working.',
      sessionId: CODEX_SESSION_ID
    }])
  })

  it('normalizes a Codex vendor error with its message', () => {
    const message = "You've hit your usage limit"
    const result = normalizeStreamChunk(
      createStreamState('codex'),
      `${JSON.stringify({ type: 'error', message })}\n`
    )

    expect(result.events).toEqual([{ type: 'vendor-error', message }])
  })

  it('normalizes AGY text deltas and uses its result status as the terminal verdict', () => {
    const result = normalizeStreamChunk(createStreamState('agy'), AGY_CAPTURE)

    expect(result.events).toEqual([
      {
        type: 'turn-partial',
        text: 'OK',
        sessionId: AGY_CONVERSATION_ID,
        usage: {
          inputTokens: 12,
          outputTokens: 3,
          reasoningOutputTokens: 2,
          cacheReadInputTokens: 5
        }
      },
      {
        type: 'turn-completed',
        text: 'OK',
        sessionId: AGY_CONVERSATION_ID,
        durationMs: 2500,
        usage: {
          inputTokens: 14,
          outputTokens: 4,
          reasoningOutputTokens: 2,
          cacheReadInputTokens: 6
        }
      }
    ])
  })

  it('reports an AGY error result even when the process itself exits successfully', () => {
    const result = normalizeStreamChunk(
      createStreamState('agy'),
      `${JSON.stringify({
        event: 'result',
        result: { status: 'ERROR', error: 'workspace was not attached' }
      })}\n`
    )

    expect(result.events).toEqual([{ type: 'vendor-error', message: 'workspace was not attached' }])
  })

  it('holds a JSON line split across chunks until the newline arrives', () => {
    const splitAt = CODEX_CAPTURE.indexOf('thread_id') + 5
    const first = normalizeStreamChunk(createStreamState('codex'), CODEX_CAPTURE.slice(0, splitAt))
    const second = normalizeStreamChunk(first.state, CODEX_CAPTURE.slice(splitAt))

    expect(first.events).toEqual([])
    expect(second.events).toHaveLength(2)
    expect(second.events[0]).toMatchObject({ type: 'turn-partial', text: 'OK' })
    expect(second.events[1]).toMatchObject({
      type: 'turn-completed',
      text: 'OK',
      sessionId: CODEX_SESSION_ID
    })
  })

  it('fails closed and retains raw output when a complete line is malformed', () => {
    const rawOutput = '{"type":"turn.started"}\nnot-json\n'
    const result = normalizeStreamChunk(createStreamState('codex'), rawOutput)

    expect(result.events).toEqual([{ type: 'stream-invalid', rawOutput }])
  })

  it('treats a JSON primitive as a malformed vendor event', () => {
    const rawOutput = 'null\n'
    const result = normalizeStreamChunk(createStreamState('claude'), rawOutput)

    expect(result.events).toEqual([{ type: 'stream-invalid', rawOutput }])
  })

  it('parses a valid trailing line only when exit flushes the stream', () => {
    const withoutNewline = CODEX_CAPTURE.trimEnd()
    const partial = normalizeStreamChunk(createStreamState('codex'), withoutNewline)
    const flushed = flushStream(partial.state)

    expect(partial.events).toMatchObject([{ type: 'turn-partial', text: 'OK' }])
    expect(flushed.events).toHaveLength(1)
    expect(flushed.events[0]).toMatchObject({ type: 'turn-completed', text: 'OK' })
  })
})
