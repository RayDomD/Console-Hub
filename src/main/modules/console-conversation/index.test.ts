import { beforeEach, describe, expect, it } from 'vitest'
import { consoleConversation, releaseConsoleDelegation, resetConsoleConversationForTests, type TerminalAssignment } from './index'
import type { HarnessEvent, HarnessRunOptions } from '../../../shared/harness'

class FakeHarness {
  readonly started: HarnessRunOptions[] = []
  private listeners: Array<(event: HarnessEvent) => void> = []
  private next = 0

  start(options: HarnessRunOptions): { runId: string } {
    this.started.push(options)
    this.next += 1
    return { runId: `h${this.next}` }
  }

  cancel(): boolean {
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

beforeEach(() => {
  resetConsoleConversationForTests()
  harness = new FakeHarness()
})

function build(openTargetLabels: () => readonly string[] = () => []) {
  return consoleConversation({
    harness,
    settings: () => SETTINGS,
    openTargetLabels,
    load: () => undefined,
    save: () => {}
  })
}

/** Sends a message and immediately completes the live turn with `replyText`. */
function askAndAnswer(conv: ReturnType<typeof build>, question: string, replyText: string): void {
  conv.send(question)
  harness.emit({ runId: 'h1', vendor: 'claude', tookMs: 5, phase: 'completed', text: replyText })
}

describe('releaseConsoleDelegation', () => {
  it('sends the Console preamble to the harness, naming open terminals, never the Fan framing', () => {
    const conv = build(() => ['T1', 'T2'])
    conv.send('research it')
    expect(harness.started).toHaveLength(1)
    const prompt = harness.started[0]?.prompt ?? ''
    expect(prompt).toContain('### <label> — <launch>')
    expect(prompt).toContain('T1, T2')
    expect(prompt.toLowerCase()).not.toContain('fan run')
  })

  it('refuses when there is no drafted plan yet', () => {
    const conv = build()
    const dispatched: string[] = []
    const result = releaseConsoleDelegation(conv, (a) => dispatched.push(a.targetId), ['T1'])
    expect(result).toEqual({ kind: 'refused', reason: 'No drafted plan to release yet.' })
    expect(dispatched).toEqual([])
  })

  it('refuses when no terminals are open', () => {
    const conv = build()
    askAndAnswer(conv, 'research it', '### T1 — claude\ndo it')
    const result = releaseConsoleDelegation(conv, () => {}, [])
    expect(result).toEqual({ kind: 'refused', reason: 'No terminals are open to delegate to.' })
  })

  it('refuses and dispatches nothing when the plan cannot be split', () => {
    const conv = build()
    askAndAnswer(conv, 'research it', 'just go do some research, no headings here')
    const dispatched: string[] = []
    const result = releaseConsoleDelegation(conv, (a) => dispatched.push(a.targetId), ['T1', 'T2'])
    expect(result.kind).toBe('refused')
    expect(dispatched).toEqual([])
  })

  it('refuses with the specific reason on a bad dependency, dispatching nothing', () => {
    const conv = build()
    askAndAnswer(conv, 'research it', '### T1 — claude\ndo it\n\n### T2 — waits on ghost\nsynthesize')
    const dispatched: string[] = []
    const result = releaseConsoleDelegation(conv, (a) => dispatched.push(a.targetId), ['T1', 'T2'])
    expect(result).toMatchObject({ kind: 'refused' })
    expect(result.kind === 'refused' && result.reason).toContain('ghost')
    expect(dispatched).toEqual([])
  })

  it('dispatches each assignment with its isWatched flag, and records the delegation', () => {
    const conv = build()
    askAndAnswer(
      conv,
      'research gemini',
      '### T1 — claude\nDeep dive on 3.8\n\n### T2 — codex\nBaseline on 3.7'
    )
    const dispatched: Array<[string, boolean]> = []
    const result = releaseConsoleDelegation(conv, (a, isWatched) => dispatched.push([a.targetId, isWatched]), ['T1', 'T2'])

    expect(result.kind).toBe('released')
    expect(result.kind === 'released' && result.assignments).toEqual([
      { targetId: 'T1', launch: 'claude', task: 'Deep dive on 3.8' },
      { targetId: 'T2', launch: 'codex', task: 'Baseline on 3.7' }
    ])
    expect(dispatched).toEqual([['T1', false], ['T2', false]])

    const entries = conv.current().entries
    const delegation = entries.find((e) => e.kind === 'delegation')
    expect(delegation).toMatchObject({
      degraded: false,
      assignments: [
        { slotId: 'T1', task: 'Deep dive on 3.8', launch: 'claude' },
        { slotId: 'T2', task: 'Baseline on 3.7', launch: 'codex' }
      ]
    })
  })

  it('omits launch for a target with no launch command', () => {
    const conv = build()
    askAndAnswer(conv, 'run it', '### T1\nrun the tests')
    const dispatched: TerminalAssignment[] = []
    releaseConsoleDelegation(conv, (a) => dispatched.push(a), ['T1'])
    expect(dispatched).toEqual([{ targetId: 'T1', task: 'run the tests' }])
  })

  it('holds a dependent assignment, marking its dependency isWatched, and dispatches it once released', () => {
    const conv = build()
    askAndAnswer(
      conv,
      'research it',
      '### T1 — claude\ndeep dive\n\n### T2 — agy — waits on T1\nsynthesize'
    )
    const dispatched: Array<[string, boolean]> = []
    const result = releaseConsoleDelegation(conv, (a, isWatched) => dispatched.push([a.targetId, isWatched]), ['T1', 'T2'])

    expect(dispatched).toEqual([['T1', true]])
    expect(result.kind === 'released' && result.sequencer.waitingOn('T2')).toEqual(['T1'])

    if (result.kind === 'released') result.sequencer.markDone('T1')
    expect(dispatched).toEqual([['T1', true], ['T2', false]])
  })

  it('the persistence key passed through load/save is "console", never the Fan key', () => {
    let loadedKey: string | undefined
    let savedKey: string | undefined
    consoleConversation({
      harness,
      settings: () => SETTINGS,
      openTargetLabels: () => [],
      load: (key) => { loadedKey = key; return undefined },
      save: (_file, key) => { savedKey = key }
    })
    expect(loadedKey).toBe('console')

    const conv = consoleConversation({
      harness,
      settings: () => SETTINGS,
      openTargetLabels: () => [],
      load: (key) => { loadedKey = key; return undefined },
      save: (_file, key) => { savedKey = key }
    })
    conv.configure({ effort: 'low' })
    expect(savedKey).toBe('console')
  })
})
