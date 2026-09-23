import { describe, expect, it } from 'vitest'
import {
  appendDelegation,
  appendSnapshot,
  appendSynthesis,
  configure,
  freshConversation,
  restoreConversation,
  retryLastMessage,
  send,
  serialize,
  turnCompleted,
  turnFailed,
  turnProgressed
} from './reducer'
import type { ConversationState } from '../../../../shared/orchestrator-conversation'

const SETTINGS = { vendor: 'claude', model: 'sonnet', effort: 'high' }

function started(): ConversationState {
  const blank = freshConversation({ id: 'c1', at: 1000, settings: SETTINGS })
  return send(blank, { id: 'u1', at: 1001, text: 'Split the benchmark research.' })
}

describe('freshConversation', () => {
  it('starts unlocked, idle and empty', () => {
    const state = freshConversation({ id: 'c1', at: 1000, settings: SETTINGS })
    expect(state.entries).toEqual([])
    expect(state.settingsLocked).toBe(false)
    expect(state.turn).toBe('idle')
    expect(state.continuity).toBe('fresh')
    expect(state.runs).toEqual([])
  })
})

describe('configure', () => {
  it('changes the settings while nothing has been sent', () => {
    const state = configure(freshConversation({ id: 'c1', at: 1000, settings: SETTINGS }), {
      vendor: 'codex',
      model: 'gpt-5.6-sol'
    })
    expect(state.settings).toEqual({ vendor: 'codex', model: 'gpt-5.6-sol' })
  })

  it('refuses once the first message is sent', () => {
    const state = started()
    expect(configure(state, { vendor: 'codex' })).toBe(state)
    expect(state.settings).toEqual(SETTINGS)
  })
})

describe('send', () => {
  it('locks the settings, appends the message and goes live', () => {
    const state = started()
    expect(state.settingsLocked).toBe(true)
    expect(state.turn).toBe('responding')
    expect(state.entries).toHaveLength(2)
    expect(state.entries[0]).toMatchObject({ kind: 'user', text: 'Split the benchmark research.' })
    expect(state.entries[1]).toMatchObject({ kind: 'orchestrator', phase: 'responding', text: '' })
  })

  it('refuses a second message while a reply is live', () => {
    const state = started()
    expect(send(state, { id: 'u2', at: 1002, text: 'And again' })).toBe(state)
  })

  it('carries a captured run-status snapshot in front of the reply', () => {
    let state = turnCompleted(started(), 'Proposed.', 1002)
    state = send(state, {
      id: 'u2',
      at: 1003,
      text: 'How is it going?',
      snapshot: {
        runId: 'run-1',
        lifecycle: 'workers',
        workers: [{ slotId: 'w1', phase: 'running', elapsedMs: 138_000, excerpt: 'drafting' }]
      }
    })
    expect(state.entries.map((entry) => entry.kind))
      .toEqual(['user', 'orchestrator', 'user', 'snapshot', 'orchestrator'])
    expect(state.entries[3]).toMatchObject({ kind: 'snapshot', at: 1003, runId: 'run-1' })
  })
})

describe('a live reply', () => {
  it('accumulates partial text without ending the turn', () => {
    const state = turnProgressed(started(), 'I have prop')
    expect(state.turn).toBe('responding')
    expect(state.entries.at(-1)).toMatchObject({ phase: 'responding', text: 'I have prop' })
  })

  it('completes into the same entry', () => {
    const state = turnCompleted(turnProgressed(started(), 'I have prop'), 'I have proposed.', 1002)
    expect(state.turn).toBe('idle')
    expect(state.entries).toHaveLength(2)
    expect(state.entries.at(-1)).toMatchObject({
      phase: 'complete',
      text: 'I have proposed.',
      at: 1002
    })
  })

  it('keeps partial text on a failure and stays retryable', () => {
    const state = turnFailed(turnProgressed(started(), 'I have prop'), 'quota exhausted', 1002)
    expect(state.turn).toBe('failed')
    expect(state.entries.at(-1))
      .toMatchObject({ phase: 'failed', text: 'I have prop', failure: 'quota exhausted' })
  })

  it('updates the live reply even if synthesis was appended while in flight', () => {
    let state = appendDelegation(turnCompleted(started(), 'Proposed.', 1002), {
      id: 'd1',
      at: 1003,
      runId: 'run-1',
      assignments: [{ slotId: 'w1', task: 'Coding' }],
      degraded: false
    })
    state = send(state, { id: 'u2', at: 1004, text: 'status' })
    expect(state.turn).toBe('responding')

    state = appendSynthesis(state, {
      id: 's1',
      at: 1005,
      runId: 'run-1',
      text: 'Synthesis output'
    })
    expect(state.entries.at(-1)?.kind).toBe('synthesis')

    state = turnProgressed(state, 'Partial answer')
    const liveEntry = state.entries.find((e) => e.kind === 'orchestrator' && e.id === 'u2-reply')
    expect(liveEntry).toMatchObject({ phase: 'responding', text: 'Partial answer' })

    state = turnCompleted(state, 'Complete answer', 1006)
    expect(state.turn).toBe('idle')
    const completedEntry = state.entries.find((e) => e.kind === 'orchestrator' && e.id === 'u2-reply')
    expect(completedEntry).toMatchObject({ phase: 'complete', text: 'Complete answer' })
  })
})

describe('retryLastMessage', () => {
  it('retains the failed partial reply and appends a live retry', () => {
    const failed = turnFailed(turnProgressed(started(), 'I have the first split.'), 'crashed', 1002)
    const state = retryLastMessage(failed, 1003)
    expect(state.turn).toBe('responding')
    expect(state.entries).toHaveLength(3)
    expect(state.entries[1]).toMatchObject({
      phase: 'failed',
      text: 'I have the first split.',
      failure: 'crashed'
    })
    expect(state.entries.at(-1)).toMatchObject({ phase: 'responding', text: '', at: 1003 })
  })

  it('refuses when nothing failed', () => {
    const state = turnCompleted(started(), 'done', 1002)
    expect(retryLastMessage(state, 1003)).toBe(state)
  })

  it('retries the failed reply even if synthesis arrived after it', () => {
    let state = appendDelegation(turnCompleted(started(), 'Proposed.', 1002), {
      id: 'd1',
      at: 1003,
      runId: 'run-1',
      assignments: [{ slotId: 'w1', task: 'Coding' }],
      degraded: false
    })
    state = send(state, { id: 'u2', at: 1004, text: 'status' })
    state = appendSynthesis(state, {
      id: 's1',
      at: 1005,
      runId: 'run-1',
      text: 'Synthesis output'
    })
    state = turnFailed(state, 'timeout', 1006)
    expect(state.turn).toBe('failed')
    const retried = retryLastMessage(state, 1007)
    expect(retried.turn).toBe('responding')
    expect(retried.entries.at(-1)).toMatchObject({ kind: 'orchestrator', id: 'u2-reply-retry', phase: 'responding' })
  })
})

describe('appendDelegation', () => {
  it('snapshots every earlier entry into the run record', () => {
    const state = appendDelegation(turnCompleted(started(), 'Proposed.', 1002), {
      id: 'd1',
      at: 1003,
      runId: 'run-1',
      assignments: [{ slotId: 'w1', task: 'Coding benchmarks' }],
      degraded: false
    })
    expect(state.runs).toHaveLength(1)
    expect(state.runs[0]?.transcript).toHaveLength(2)
    expect(state.entries.at(-1)).toMatchObject({ kind: 'delegation', runId: 'run-1' })
  })

  it('does not let a later message alter a proposed run', () => {
    let state = appendDelegation(turnCompleted(started(), 'Proposed.', 1002), {
      id: 'd1',
      at: 1003,
      runId: 'run-1',
      assignments: [],
      degraded: true
    })
    const snapshotBefore = state.runs[0]?.transcript
    state = send(state, { id: 'u2', at: 1004, text: 'status?' })
    expect(state.runs[0]?.transcript).toEqual(snapshotBefore)
    expect(state.runs[0]?.transcript).toHaveLength(2)
  })

  it('ignores a second delegation for a run it already recorded', () => {
    const once = appendDelegation(turnCompleted(started(), 'Proposed.', 1002), {
      id: 'd1', at: 1003, runId: 'run-1', assignments: [], degraded: false
    })
    const twice = appendDelegation(once, {
      id: 'd2', at: 1004, runId: 'run-1', assignments: [], degraded: false
    })
    expect(twice).toBe(once)
  })
})

describe('appendSynthesis', () => {
  it('returns the result to the conversation that proposed the run', () => {
    let state = appendDelegation(turnCompleted(started(), 'Proposed.', 1002), {
      id: 'd1', at: 1003, runId: 'run-1', assignments: [], degraded: false
    })
    state = appendSynthesis(state, {
      id: 's1', at: 1010, runId: 'run-1', text: 'Merged.', outputPath: 'C:/out.md'
    })
    expect(state.entries.at(-1))
      .toMatchObject({ kind: 'synthesis', runId: 'run-1', text: 'Merged.' })
  })

  it('ignores a synthesis for a run this conversation never proposed', () => {
    const state = turnCompleted(started(), 'Proposed.', 1002)
    expect(appendSynthesis(state, { id: 's1', at: 1010, runId: 'other', text: 'Merged.' }))
      .toBe(state)
  })
})

describe('appendSnapshot', () => {
  it('records the capture time so a stale answer can be recognised', () => {
    const state = appendSnapshot(turnCompleted(started(), 'ok', 1002), {
      id: 'n1', at: 2000, runId: 'run-1', lifecycle: 'workers', workers: []
    })
    expect(state.entries.at(-1)).toMatchObject({ kind: 'snapshot', at: 2000 })
  })
})

describe('serialization', () => {
  it('round-trips a transcript and reopens it as a restored session', () => {
    const before = appendDelegation(turnCompleted(started(), 'Proposed.', 1002), {
      id: 'd1',
      at: 1003,
      runId: 'run-1',
      assignments: [{ slotId: 'w1', task: 'a' }],
      degraded: false
    })
    const after = restoreConversation(JSON.parse(JSON.stringify(serialize(before))))
    expect(after?.entries).toEqual(before.entries)
    expect(after?.runs).toEqual(before.runs)
    expect(after?.continuity).toBe('restored')
  })

  it('never restores a turn as still live', () => {
    const live = started()
    const after = restoreConversation(serialize(live))
    expect(after?.turn).toBe('failed')
    expect(after?.entries.at(-1)).toMatchObject({ phase: 'failed' })
  })

  it('marks an in-flight reply as failed even if synthesis arrived after it', () => {
    let state = appendDelegation(turnCompleted(started(), 'Proposed.', 1002), {
      id: 'd1',
      at: 1003,
      runId: 'run-1',
      assignments: [{ slotId: 'w1', task: 'Coding' }],
      degraded: false
    })
    state = send(state, { id: 'u2', at: 1004, text: 'status' })
    state = appendSynthesis(state, {
      id: 's1',
      at: 1005,
      runId: 'run-1',
      text: 'Synthesis output'
    })
    const restored = restoreConversation(serialize(state))
    expect(restored?.turn).toBe('failed')
    const reply = restored?.entries.find((e) => e.kind === 'orchestrator' && e.id === 'u2-reply')
    expect(reply).toMatchObject({ phase: 'failed' })
  })

  it('refuses a file it does not understand', () => {
    expect(restoreConversation({ version: 99, state: {} })).toBeUndefined()
    expect(restoreConversation(undefined)).toBeUndefined()
  })
})
