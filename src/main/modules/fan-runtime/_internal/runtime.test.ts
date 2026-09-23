import { describe, expect, it, vi } from 'vitest'
import { FanRuntime, delegationPrompt, synthesisPrompt, toHarnessVendor, toSlotEvent, toSlotUsage } from './runtime'
import type { HarnessPort } from './runtime'
import type { FanConfig, FanState } from '../../../../shared/fan'
import type { HarnessEvent, HarnessRunOptions } from '../../../../shared/harness'

// ---------------------------------------------------------------------------
// A fake harness: records launches, replays events on demand, spawns nothing.
// ---------------------------------------------------------------------------

interface Launch extends HarnessRunOptions {
  runId: string
}

function fakeHarness(): {
  port: HarnessPort
  launches: Launch[]
  cancelled: string[]
  emit: (event: HarnessEvent) => void
} {
  const launches: Launch[] = []
  const cancelled: string[] = []
  const listeners: Array<(event: HarnessEvent) => void> = []
  let n = 0

  return {
    launches,
    cancelled,
    emit: event => listeners.forEach(l => l(event)),
    port: {
      start: options => {
        const runId = `h${++n}`
        launches.push({ ...options, runId })
        return { runId }
      },
      cancel: runId => {
        cancelled.push(runId)
        return true
      },
      onEvent: listener => {
        listeners.push(listener)
        return () => listeners.splice(listeners.indexOf(listener), 1)
      }
    }
  }
}

const NL = String.fromCharCode(10)
/** A split the parser reads, wide enough for every config here. */
const SPLIT = ['### w1', 'One.', '', '### w2', 'Two.', '', '### w3', 'Three.'].join(NL)

function cfg(workers: number): FanConfig {
  return {
    question: 'What should we do?',
    slots: [
      ...Array.from({ length: workers }, (_, i) => ({
        id: `w${i + 1}`,
        role: 'worker' as const,
        vendor: i % 2 === 0 ? 'claude' : 'codex'
      })),
      { id: 'arch', role: 'orchestrator', vendor: 'claude' }
    ]
  }
}

function completed(runId: string, text: string): HarnessEvent {
  return { phase: 'completed', runId, vendor: 'claude', tookMs: 1, text }
}
function faulted(runId: string): HarnessEvent {
  return {
    phase: 'faulted',
    runId,
    vendor: 'claude',
    tookMs: 1,
    fault: { kind: 'quota', message: 'weekly limit reached' }
  }
}

function runtimeWith(h: ReturnType<typeof fakeHarness>, writes: string[][] = []): FanRuntime {
  return new FanRuntime({
    harness: h.port,
    writeDocument: async (path, content) => {
      writes.push([path, content])
    }
  })
}

// ---------------------------------------------------------------------------

describe('vendor narrowing', () => {
  it('rejects a vendor the harness cannot spawn rather than defaulting', () => {
    expect(() => toHarnessVendor('gemini')).toThrow(/not a harnessable executor/)
    expect(toHarnessVendor('codex')).toBe('codex')
    expect(toHarnessVendor('agy')).toBe('agy')
  })
})

describe('event translation', () => {
  const binding = { fanRunId: 'r1', slotId: 'w1', attempt: 2 }

  it('stamps the binding onto every translated event', () => {
    const e = toSlotEvent(completed('h9', 'text'), binding)
    expect(e).toMatchObject({ kind: 'terminal', runId: 'r1', attempt: 2, slotId: 'w1' })
  })

  it('carries a fault message across the seam', () => {
    const e = toSlotEvent(faulted('h9'), binding)
    expect(e?.kind === 'terminal' && e.outcome).toEqual({
      kind: 'quota',
      message: 'weekly limit reached'
    })
  })

  it('carries partial harness text and usage into a running slot', () => {
    const e = toSlotEvent({
      phase: 'partial',
      runId: 'h9',
      vendor: 'claude',
      tookMs: 1,
      text: 'Still working.',
      usage: { outputTokens: 2 }
    }, binding)

    expect(e).toEqual({
      kind: 'progress',
      runId: 'r1',
      attempt: 2,
      slotId: 'w1',
      vendor: 'claude',
      partialText: 'Still working.',
      usage: { outputTokens: 2, inputTokens: undefined, cachedInputTokens: undefined, throughput: undefined }
    })
  })

  it('translates a cancellation to nothing, since the fan asked for it', () => {
    const e = toSlotEvent(
      { phase: 'cancelled', runId: 'h9', vendor: 'claude', tookMs: 1 },
      binding
    )
    expect(e).toBeUndefined()
  })
})

describe('the run sequence over real launches', () => {
  it('launches the delegation alone, holds, then releases every worker at once', async () => {
    const h = fakeHarness()
    const runtime = runtimeWith(h)

    await runtime.start(cfg(3))
    expect(h.launches).toHaveLength(1)
    // The delegation turn carries the question inside its own prompt.
    expect(h.launches[0]?.prompt).toContain('What should we do?')

    h.emit(completed('h1', SPLIT))
    await vi.waitFor(() => expect(runtime.current()?.lifecycle).toBe('held'))
    expect(h.launches).toHaveLength(1)

    await runtime.release()
    expect(h.launches).toHaveLength(4)

    // Each worker gets the task written for it, not the question.
    expect(h.launches.slice(1).map(l => l.prompt)).toEqual(['One.', 'Two.', 'Three.'])
    // And the slot's own vendor, not one shared default.
    expect(h.launches.map(l => l.vendor)).toEqual(['claude', 'claude', 'codex', 'claude'])
  })

  it('completes a slot that streamed before it finished, which is every real run', async () => {
    // The binding is what maps a harness run back to its slot, so releasing it
    // on a partial loses the completion that follows. A live CLI always streams
    // first, so a fan built on completions alone holds forever in delegating.
    const h = fakeHarness()
    const runtime = runtimeWith(h)

    await runtime.start(cfg(3))
    h.emit({ phase: 'partial', runId: 'h1', vendor: 'claude', tookMs: 1, text: '### w1' })
    await vi.waitFor(() => expect(runtime.current()?.slots.arch?.phase).toBe('running'))

    h.emit(completed('h1', SPLIT))
    await vi.waitFor(() => expect(runtime.current()?.lifecycle).toBe('held'))
  })

  it('gives every slot the fan workspace as its working directory, and none without one', async () => {
    const workspace = 'C:\FIles\some-repo'
    const h = fakeHarness()
    const runtime = runtimeWith(h)

    await runtime.start({ ...cfg(3), workspace })
    h.emit(completed('h1', SPLIT))
    await vi.waitFor(() => expect(runtime.current()?.lifecycle).toBe('held'))
    await runtime.release()

    // Criteria and every worker, so no answer in one comparison was produced
    // with different access from the others.
    expect(h.launches).toHaveLength(4)
    expect(h.launches.every(launch => launch.cwd === workspace)).toBe(true)

    // With no workspace nothing names a directory, so the harness gives the
    // process an empty one rather than letting it read Console Hub's own checkout.
    const without = fakeHarness()
    await runtimeWith(without).start(cfg(3))
    expect(without.launches[0]).not.toHaveProperty('cwd')
  })

  it('writes the synthesis atomically once the orchestrator completes', async () => {
    const writes: string[][] = []
    const h = fakeHarness()
    const runtime = runtimeWith(h, writes)

    await runtime.start(cfg(2))
    h.emit(completed('h1', SPLIT))
    await vi.waitFor(() => expect(runtime.current()?.lifecycle).toBe('held'))
    await runtime.release()
    expect(h.launches).toHaveLength(3)
    h.emit(completed('h2', 'answer one'))
    h.emit(completed('h3', 'answer two'))
    await vi.waitFor(() => expect(h.launches).toHaveLength(4))

    // The synthesis turn is handed its own delegation back, plus both findings.
    expect(h.launches[3]?.prompt).toContain('### w1')
    expect(h.launches[3]?.prompt).toContain('answer one')

    h.emit(completed('h4', 'the synthesis'))
    await vi.waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]?.[1]).toBe('the synthesis')
    expect(runtime.current()?.lifecycle).toBe('done')
  })
})

describe('supersession — the reason the binding exists', () => {
  it('kills the first orchestrator and ignores its late completion', async () => {
    const writes: string[][] = []
    const h = fakeHarness()
    const runtime = runtimeWith(h, writes)

    await runtime.start(cfg(3))
    h.emit(completed('h1', SPLIT))
    await vi.waitFor(() => expect(runtime.current()?.lifecycle).toBe('held'))
    await runtime.release()
    expect(h.launches).toHaveLength(4)

    h.emit(completed('h2', 'answer one'))
    h.emit(completed('h3', 'answer two'))
    h.emit(faulted('h4'))
    // First comparison is live on two answers, w3 absent.
    await vi.waitFor(() => expect(h.launches).toHaveLength(5))
    expect(h.launches[4]?.prompt).toContain('PARTIAL ADVISORY')

    // w3 is retried and recovers, superseding that comparison.
    await runtime.retrySlot('w3')
    const retryLaunch = h.launches[5]
    expect(retryLaunch).toBeDefined()
    h.emit(completed(retryLaunch?.runId ?? '', 'answer three'))

    await vi.waitFor(() => expect(h.launches).toHaveLength(7))
    // The live orchestrator was killed before its replacement launched.
    expect(h.cancelled).toContain('h5')
    expect(h.launches[6]?.prompt).not.toContain('PARTIAL ADVISORY')
    expect(h.launches[6]?.prompt).toContain('answer three')

    // The killed process reports back anyway. It must not finish the run.
    h.emit(completed('h5', 'stale comparison'))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(writes).toHaveLength(0)
    expect(runtime.current()?.lifecycle).toBe('synthesis')

    // The replacement finishes and writes the full comparison.
    h.emit(completed(h.launches[6]?.runId ?? '', 'full comparison'))
    await vi.waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]?.[1]).toBe('full comparison')
  })
})

describe('stop', () => {
  it('stops while held without cancelling a process that is not running', async () => {
    const h = fakeHarness()
    const runtime = runtimeWith(h)

    await runtime.start(cfg(2))
    h.emit(completed('h1', SPLIT))
    await vi.waitFor(() => expect(runtime.current()?.lifecycle).toBe('held'))

    await runtime.stop()
    expect(h.cancelled).toEqual([])
    expect(runtime.current()?.lifecycle).toBe('stopped')
  })

  it('cancels every live worker harness run', async () => {
    const h = fakeHarness()
    const runtime = runtimeWith(h)

    await runtime.start(cfg(2))
    h.emit(completed('h1', SPLIT))
    await vi.waitFor(() => expect(runtime.current()?.lifecycle).toBe('held'))
    await runtime.release()

    await runtime.stop()
    expect(h.cancelled).toEqual(expect.arrayContaining(['h2', 'h3']))
    expect(runtime.current()?.lifecycle).toBe('stopped')
  })
})


// ---------------------------------------------------------------------------
// The deferred join: per-slot settings reaching the harness.
// ---------------------------------------------------------------------------

describe('per-slot settings reach the harness', () => {
  it('passes a slot own model and effort through to the launch options', async () => {
    const h = fakeHarness()
    const runtime = runtimeWith(h)

    await runtime.start({
      question: 'q',
      slots: [
        { id: 'w1', role: 'worker', vendor: 'claude' },
        { id: 'w2', role: 'worker', vendor: 'codex', model: 'gpt-5.6-sol' },
        { id: 'arch', role: 'orchestrator', vendor: 'claude', model: 'opus', effort: 'high' }
      ]
    })

    expect(h.launches[0]).toMatchObject({ model: 'opus', effort: 'high' })

    h.emit(completed('h1', SPLIT))
    await vi.waitFor(() => expect(runtime.current()?.lifecycle).toBe('held'))
    await runtime.release()
    expect(h.launches).toHaveLength(3)
    // A slot that named nothing carries no model, rather than an empty one.
    expect(h.launches[1]?.model).toBeUndefined()
    expect(h.launches[2]?.model).toBe('gpt-5.6-sol')
  })

  it('launches workers with NONE and the orchestrator with DOCS', async () => {
    const h = fakeHarness()
    const runtime = runtimeWith(h)

    await runtime.start(cfg(2))
    expect(h.launches[0]?.scope).toBe('NONE')

    h.emit(completed('h1', SPLIT))
    await vi.waitFor(() => expect(runtime.current()?.lifecycle).toBe('held'))
    await runtime.release()
    expect(h.launches).toHaveLength(3)
    expect(h.launches[1]?.scope).toBe('NONE')
    expect(h.launches[2]?.scope).toBe('NONE')

    h.emit(completed('h2', 'answer one'))
    h.emit(completed('h3', 'answer two'))
    await vi.waitFor(() => expect(h.launches).toHaveLength(4))
    // Only the orchestrator's output is written by Console Hub, so only it is DOCS.
    expect(h.launches[3]?.scope).toBe('DOCS')
  })
})

describe('toSlotUsage', () => {
  it('folds either vendor name for cached input into one field', () => {
    // codex names it cached_input_tokens and claude cache_read_input_tokens.
    // The renderer sees one field, so a card cannot show one vendor's cache and
    // silently omit the other's.
    expect(toSlotUsage({ cachedInputTokens: 4100 })?.cachedInputTokens).toBe(4100)
    expect(toSlotUsage({ cacheReadInputTokens: 4100 })?.cachedInputTokens).toBe(4100)
    expect(toSlotUsage({ inputTokens: 12 })?.cachedInputTokens).toBeUndefined()
  })

  it('carries the input and output counts across unchanged', () => {
    expect(toSlotUsage({ inputTokens: 33000, outputTokens: 900 }))
      .toMatchObject({ inputTokens: 33000, outputTokens: 900 })
  })
})

describe('delegationPrompt', () => {
  const prompt = delegationPrompt('Research Belo.', 'Split by topic.', ['w1', 'w2'])

  it('carries the question and the instruction verbatim', () => {
    expect(prompt).toContain('Research Belo.')
    expect(prompt).toContain('Split by topic.')
  })

  it('names every slot it must write a heading for, in the format the parser reads', () => {
    // The parser is strict by design, so the prompt must state the exact shape
    // it will be parsed with. A near-miss format degrades the whole run.
    expect(prompt).toContain('### w1')
    expect(prompt).toContain('### w2')
  })

  it('does not ask the orchestrator to answer the question itself', () => {
    expect(prompt).not.toMatch(/answer the question/i)
  })
})

describe('synthesisPrompt', () => {
  const prompt = synthesisPrompt('Research Belo.', '### w1' + String.fromCharCode(10) + 'Story.', [
    { slotId: 'w1', text: 'founded 1990' }
  ])

  it('gives turn two its own delegation back, because the session did not resume', () => {
    expect(prompt).toContain('### w1')
    expect(prompt).toContain('Research Belo.')
    expect(prompt).toContain('founded 1990')
  })

  it('asks for a synthesis and never for a ranking, because the run is unscored', () => {
    expect(prompt).not.toMatch(/score|rank|best answer|compare the answers/i)
    expect(prompt).toMatch(/synthesis|synthesise/i)
  })
})

/*
 * The renderer only ever learns a new state from a transition. A command that
 * throws used to skip that emit entirely, so main advanced and the UI sat on
 * whatever it last heard - a slot reading RUNNING for a process that had already
 * finished, with no error anywhere. That is the freeze these two guard.
 */
describe('a command that throws', () => {
  function refusingHarness(): HarnessPort {
    const harness = fakeHarness()
    return { ...harness.port, start: () => { throw new Error('spawn refused') } }
  }

  it('still tells the renderer the state the machine moved to', async () => {
    const runtime = new FanRuntime({ harness: refusingHarness() })
    const seen: FanState[] = []
    runtime.onTransition((state) => seen.push(state))

    await runtime.start(cfg(2)).catch(() => undefined)

    expect(seen).toHaveLength(1)
  })

  it('still reports the failure rather than swallowing it into a silent freeze', async () => {
    const runtime = new FanRuntime({ harness: refusingHarness() })

    await expect(runtime.start(cfg(2))).rejects.toThrow('spawn refused')
  })
})
