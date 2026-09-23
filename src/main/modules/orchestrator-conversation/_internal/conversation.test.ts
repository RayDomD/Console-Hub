import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OrchestratorConversation } from './conversation'
import type { HarnessEvent, HarnessRunOptions } from '../../../../shared/harness'
import type { ConversationSnapshotFile } from '../../../../shared/orchestrator-conversation'

class FakeHarness {
  readonly started: HarnessRunOptions[] = []
  readonly cancelled: string[] = []
  private listeners: Array<(event: HarnessEvent) => void> = []
  private next = 0

  start(options: HarnessRunOptions): { runId: string } {
    this.started.push(options)
    this.next += 1
    return { runId: `h${this.next}` }
  }

  cancel(runId: string): boolean {
    this.cancelled.push(runId)
    return true
  }

  onEvent(listener: (event: HarnessEvent) => void): () => void {
    this.listeners.push(listener)
    return () => { this.listeners = this.listeners.filter((l) => l !== listener) }
  }

  emit(event: HarnessEvent): void {
    for (const listener of [...this.listeners]) listener(event)
  }
}

const SETTINGS = { vendor: 'claude', model: 'sonnet', effort: 'high' }

let harness: FakeHarness
let saved: ConversationSnapshotFile | undefined
let now: number

function build(stored?: unknown): OrchestratorConversation {
  return new OrchestratorConversation({
    harness,
    settings: () => SETTINGS,
    load: () => stored,
    save: (file) => { saved = file },
    now: () => now,
    freshId: (() => {
      let counter = 0
      return () => { counter += 1; return `id${counter}` }
    })()
  })
}

beforeEach(() => {
  harness = new FakeHarness()
  saved = undefined
  now = 1000
})

describe('a first message', () => {
  it('starts one read-only harnessed turn on the configured slot', () => {
    const conversation = build()
    conversation.send('Split the research.')

    expect(harness.started).toHaveLength(1)
    expect(harness.started[0]).toMatchObject({
      vendor: 'claude',
      model: 'sonnet',
      effort: 'high',
      scope: 'NONE'
    })
    expect(harness.started[0]?.prompt).toContain('Split the research.')
    expect(conversation.current().turn).toBe('responding')
  })

  it('includes available worker slots in the prompt when configured', () => {
    const custom = new OrchestratorConversation({
      harness,
      settings: () => SETTINGS,
      workers: () => [
        { id: 'w1', vendor: 'agy', model: 'gemini-3.8-flash-medium' },
        { id: 'w4', vendor: 'agy', model: 'gemini-3.8-flash-medium' }
      ],
      load: () => undefined,
      save: () => {},
      now: () => now,
      freshId: () => 'id1'
    })
    custom.send('Delegate to workers')
    expect(harness.started[0]?.prompt).toContain('Available worker slots: w1 · agy · gemini-3.8-flash-medium, w4 · agy · gemini-3.8-flash-medium.')
  })

  it('locks the settings once it is sent', () => {
    const conversation = build()
    conversation.send('Hello')
    conversation.configure({ vendor: 'codex' })
    expect(conversation.current().settings.vendor).toBe('claude')
  })

  it('refuses a second message while a reply is live', () => {
    const conversation = build()
    conversation.send('Hello')
    conversation.send('Again')
    expect(harness.started).toHaveLength(1)
  })

  it('never hands the renderer an executable or a command line', () => {
    const conversation = build()
    conversation.send('Hello')
    const state = JSON.stringify(conversation.current())
    expect(state).not.toContain('claude.exe')
    expect(state).not.toContain('cwd')
  })
})

describe('a live turn', () => {
  it('streams partial text and completes into the same entry', () => {
    const conversation = build()
    conversation.send('Hello')
    harness.emit({ runId: 'h1', vendor: 'claude', tookMs: 5, phase: 'partial', text: 'thin' })
    expect(conversation.current().entries.at(-1)).toMatchObject({ text: 'thin', phase: 'responding' })

    harness.emit({ runId: 'h1', vendor: 'claude', tookMs: 9, phase: 'completed', text: 'thinking' })
    expect(conversation.current().turn).toBe('idle')
    expect(conversation.current().entries.at(-1)).toMatchObject({ text: 'thinking', phase: 'complete' })
  })

  it('ignores events from a superseded turn', () => {
    const conversation = build()
    conversation.send('Hello')
    harness.emit({ runId: 'h1', vendor: 'claude', tookMs: 9, phase: 'completed', text: 'first' })
    conversation.send('Again')
    harness.emit({ runId: 'h1', vendor: 'claude', tookMs: 9, phase: 'partial', text: 'late' })
    expect(conversation.current().entries.at(-1)).toMatchObject({ text: '', phase: 'responding' })
  })

  it('keeps partial text when the turn faults and retries into a new turn', () => {
    const conversation = build()
    conversation.send('Hello')
    harness.emit({ runId: 'h1', vendor: 'claude', tookMs: 5, phase: 'partial', text: 'half' })
    harness.emit({
      runId: 'h1',
      vendor: 'claude',
      tookMs: 9,
      phase: 'faulted',
      fault: { kind: 'quota', message: 'quota exhausted' }
    })
    expect(conversation.current().turn).toBe('failed')
    expect(conversation.current().entries.at(-1))
      .toMatchObject({ text: 'half', phase: 'failed', failure: 'quota exhausted' })

    conversation.retry()
    expect(harness.started).toHaveLength(2)
    expect(harness.started[1]?.prompt).toContain('Hello')
    expect(conversation.current().turn).toBe('responding')
  })

  it('notifies subscribers on every change', () => {
    const conversation = build()
    const listener = vi.fn()
    conversation.onChange(listener)
    conversation.send('Hello')
    harness.emit({ runId: 'h1', vendor: 'claude', tookMs: 9, phase: 'completed', text: 'ok' })
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})

describe('a run this conversation proposed', () => {
  function withRun(): OrchestratorConversation {
    const conversation = build()
    conversation.send('Split it.')
    harness.emit({ runId: 'h1', vendor: 'claude', tookMs: 9, phase: 'completed', text: 'Proposed.' })
    conversation.noteDelegation({
      runId: 'run-1',
      assignments: [{ slotId: 'w1', task: 'Coding' }],
      degraded: false
    })
    return conversation
  }

  it('writes the accepted delegation into the transcript once', () => {
    const conversation = withRun()
    conversation.noteDelegation({ runId: 'run-1', assignments: [], degraded: false })
    const delegations = conversation.current().entries.filter((e) => e.kind === 'delegation')
    expect(delegations).toHaveLength(1)
    expect(conversation.current().runs).toHaveLength(1)
  })

  it('gives a status question a freshly captured snapshot it cannot edit', () => {
    const conversation = withRun()
    now = 2000
    conversation.send('How is it going?', {
      runId: 'run-1',
      lifecycle: 'workers',
      workers: [{ slotId: 'w1', phase: 'running', elapsedMs: 138_000, excerpt: 'drafting' }]
    })
    const snapshot = conversation.current().entries.find((e) => e.kind === 'snapshot')
    expect(snapshot).toMatchObject({ at: 2000, runId: 'run-1' })
    expect(harness.started.at(-1)?.prompt).toContain('RUN-STATUS SNAPSHOT')
    expect(conversation.current().runs[0]?.transcript).toHaveLength(2)
  })

  it('returns the synthesis to the same transcript', () => {
    const conversation = withRun()
    conversation.noteSynthesis({ runId: 'run-1', text: 'Merged.', outputPath: 'C:/out.md' })
    expect(conversation.current().entries.at(-1))
      .toMatchObject({ kind: 'synthesis', text: 'Merged.' })
  })

  it('records a second run separately in the same conversation', () => {
    const conversation = withRun()
    conversation.noteDelegation({ runId: 'run-2', assignments: [], degraded: false })
    expect(conversation.current().runs.map((run) => run.runId)).toEqual(['run-1', 'run-2'])
  })
})

describe('persistence', () => {
  it('saves after every change', () => {
    const conversation = build()
    conversation.send('Hello')
    expect(saved?.state.entries).toHaveLength(2)
  })

  it('restores the transcript as a visibly new session', () => {
    const first = build()
    first.send('Hello')
    harness.emit({ runId: 'h1', vendor: 'claude', tookMs: 9, phase: 'completed', text: 'Hi' })

    const stored = saved
    harness = new FakeHarness()
    const second = build(stored)
    expect(second.current().continuity).toBe('restored')
    expect(second.current().entries).toHaveLength(2)
  })

  it('opens a fresh conversation when nothing is stored', () => {
    const conversation = build()
    expect(conversation.current().entries).toEqual([])
    expect(conversation.current().continuity).toBe('fresh')
  })

  it('starts over on a new conversation, unlocking the settings', () => {
    const conversation = build()
    conversation.send('Hello')
    harness.emit({ runId: 'h1', vendor: 'claude', tookMs: 9, phase: 'completed', text: 'Hi' })
    conversation.newConversation()
    expect(conversation.current().entries).toEqual([])
    expect(conversation.current().settingsLocked).toBe(false)
  })

  it('cancels a live turn when a new conversation replaces it', () => {
    const conversation = build()
    conversation.send('Hello')
    conversation.newConversation()
    expect(harness.cancelled).toEqual(['h1'])
  })
})

describe('proposing a delegation', () => {
  it('offers the last user message and the last complete reply as the task', () => {
    const conversation = build()
    conversation.send('Compare the benchmarks.')
    harness.emit({
      runId: 'h1',
      vendor: 'claude',
      tookMs: 9,
      phase: 'completed',
      text: 'Split it three ways.'
    })
    expect(conversation.proposedTask()).toEqual({
      question: 'Compare the benchmarks.',
      delegation: 'Split it three ways.'
    })
  })

  it('offers nothing while no reply has landed', () => {
    const conversation = build()
    conversation.send('Compare the benchmarks.')
    expect(conversation.proposedTask()).toBeUndefined()
  })
})
