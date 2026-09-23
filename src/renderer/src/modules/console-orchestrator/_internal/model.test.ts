import { describe, expect, it } from 'vitest'
import { delegateCommand, heldPlan, identityLabel, missionCommand, orchestratorActivity, turnLabel } from './model'
import type { ConversationEntry, ConversationState } from '../../../../../shared/orchestrator-conversation'

function state(entries: ConversationEntry[], turn: ConversationState['turn'] = 'idle'): ConversationState {
  return {
    id: 's1',
    startedAt: 0,
    settings: { vendor: 'claude', model: 'sonnet', effort: 'medium' },
    settingsLocked: true,
    continuity: 'fresh',
    entries,
    turn,
    runs: []
  }
}

describe('identityLabel', () => {
  it('names only what settings actually set', () => {
    expect(identityLabel({ vendor: 'claude', model: 'sonnet', effort: 'medium' })).toBe('CLAUDE · SONNET · MEDIUM')
    expect(identityLabel({ vendor: 'claude' })).toBe('CLAUDE')
  })
})

describe('turnLabel', () => {
  it('reads responding, failed, or ready', () => {
    expect(turnLabel(state([], 'responding'))).toContain('RESPONDING')
    expect(turnLabel(state([], 'failed'))).toContain('FAILED')
    expect(turnLabel(state([], 'idle'))).toContain('READY')
  })
})

describe('heldPlan', () => {
  it('does not turn a combined answer into another held plan', () => {
    expect(heldPlan(state([{ kind: 'orchestrator', id: 'o1', at: 1, text: 'The combined evidence supports the first option.', phase: 'complete' }]))).toBe(false)
  })
  it('is false with no orchestrator turn yet', () => {
    expect(heldPlan(state([]))).toBe(false)
  })

  it('is true once a plan has landed and nothing has released it', () => {
    const entries: ConversationEntry[] = [
      { kind: 'user', id: 'u1', at: 0, text: 'research it' },
      { kind: 'orchestrator', id: 'o1', at: 1, text: '### T1 — claude\ndo it', phase: 'complete' }
    ]
    expect(heldPlan(state(entries))).toBe(true)
  })

  it('is false once a delegation entry follows the plan', () => {
    const entries: ConversationEntry[] = [
      { kind: 'user', id: 'u1', at: 0, text: 'research it' },
      { kind: 'orchestrator', id: 'o1', at: 1, text: '### T1 — claude\ndo it', phase: 'complete' },
      { kind: 'delegation', id: 'd1', at: 2, runId: 'r1', assignments: [{ slotId: 'T1', task: 'do it' }], degraded: false }
    ]
    expect(heldPlan(state(entries))).toBe(false)
  })

  it('is false while the turn is still responding or failed', () => {
    const responding: ConversationEntry[] = [{ kind: 'orchestrator', id: 'o1', at: 1, text: '', phase: 'responding' }]
    expect(heldPlan(state(responding))).toBe(false)
  })
})

describe('orchestratorActivity', () => {
  it('reports nothing before a session exists', () => {
    expect(orchestratorActivity({ started: false, paused: false, busy: false, updates: [] })).toBe('No session started')
  })

  it('carries the newest Mission report while a Mission is active', () => {
    expect(orchestratorActivity({
      started: true, paused: false, busy: false, phase: 'blocked',
      updates: ['Mission held: "Console header".', 'T1 failed: validation did not pass. Independent workers continue.']
    })).toBe('T1 failed: validation did not pass. Independent workers continue.')
  })

  it('names the phase when a Mission has reported nothing yet', () => {
    expect(orchestratorActivity({ started: true, paused: false, busy: false, phase: 'ready_review', updates: [] })).toBe('Mission ready review')
  })

  it('shows the latest Console worker update while a delegation run exists', () => {
    expect(orchestratorActivity({ started: true, paused: false, busy: false, runPhase: 'failed', updates: [
      'T1: completed', 'T2: failed — Agent session ended without a completed result'
    ] })).toBe('T2: failed — Agent session ended without a completed result')
  })

  it('falls back to terminal state once no Mission is active', () => {
    expect(orchestratorActivity({ started: true, paused: true, busy: false, updates: ['stale'] })).toBe('Handoffs paused for native terminal input')
    expect(orchestratorActivity({ started: true, paused: false, busy: true, updates: [] })).toBe('Orchestrator responding · results will wait')
    expect(orchestratorActivity({ started: true, paused: false, busy: false, phase: 'applied', updates: [] })).toBe('Ready · automatic handoffs enabled')
  })
})

describe('missionCommand', () => {
  it('accepts only Console Hub Mission controls', () => {
    expect(missionCommand('/mission')).toBe('/mission')
    expect(missionCommand('/MISSION run')).toBe('/mission run')
    expect(missionCommand('/mission review')).toBe('/mission review')
    expect(missionCommand('/mission do something')).toBeUndefined()
    expect(missionCommand('explain the mission')).toBeUndefined()
  })

  it('routes unambiguous natural Mission replies to lifecycle controls', () => {
    expect(missionCommand('go ahead', 'held')).toBe('/mission run')
    expect(missionCommand('stop', 'running')).toBe('/mission stop')
    expect(missionCommand('apply it', 'ready_apply')).toBe('/mission apply')
    expect(missionCommand('reject it', 'ready_apply')).toBe('/mission reject')
    expect(missionCommand('what is the status?', 'running')).toBe('/mission status')
    expect(missionCommand('retry T1', 'blocked')).toBe('/mission retry t1')
  })

  it('leaves ambiguous conversational replies for the Orchestrator agent', () => {
    expect(missionCommand('go ahead and explain the tradeoff', 'held')).toBeUndefined()
    expect(missionCommand('stop worrying about that', 'running')).toBeUndefined()
    expect(missionCommand('apply it to the next proposal', 'ready_apply')).toBeUndefined()
  })

  it('leaves a natural reply for the agent when the Mission cannot act on it', () => {
    expect(missionCommand('go ahead')).toBeUndefined()
    expect(missionCommand('yes')).toBeUndefined()
    expect(missionCommand('yes', 'running')).toBeUndefined()
    expect(missionCommand('apply it', 'running')).toBeUndefined()
    expect(missionCommand('stop', 'held')).toBeUndefined()
    expect(missionCommand('retry T1', 'running')).toBeUndefined()
    expect(missionCommand('what is the status?')).toBeUndefined()
  })

  it('keeps the slash-command shortcuts available in every phase', () => {
    expect(missionCommand('/mission run')).toBe('/mission run')
    expect(missionCommand('/mission apply', 'running')).toBe('/mission apply')
    expect(missionCommand('/mission retry t1')).toBe('/mission retry t1')
  })
})

describe('delegateCommand', () => {
  it('intercepts an explicit delegation invocation before it reaches a vendor CLI', () => {
    expect(delegateCommand('/delegate Compare these files')).toBe('/delegate Compare these files')
    expect(delegateCommand('/delegate')).toBe('/delegate')
    expect(delegateCommand('/delegated')).toBeUndefined()
    expect(delegateCommand('delegate the work')).toBeUndefined()
  })
})
