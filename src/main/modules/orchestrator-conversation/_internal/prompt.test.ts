import { describe, expect, it } from 'vitest'
import { buildPrompt } from './prompt'
import type { ConversationEntry } from '../../../../shared/orchestrator-conversation'

describe('buildPrompt', () => {
  it('replays the transcript in order and ends on the live message', () => {
    const entries: ConversationEntry[] = [
      { kind: 'user', id: 'u1', at: 1, text: 'Split the research.' },
      { kind: 'orchestrator', id: 'r1', at: 2, text: 'Three angles.', phase: 'complete' },
      { kind: 'user', id: 'u2', at: 3, text: 'Status?' },
      { kind: 'orchestrator', id: 'r2', at: 4, text: '', phase: 'responding' }
    ]
    const prompt = buildPrompt(entries)
    expect(prompt).toContain('Split the research.')
    expect(prompt).toContain('Three angles.')
    expect(prompt.trimEnd().endsWith('Status?')).toBe(true)
  })

  it('says a session is new rather than resumed', () => {
    const prompt = buildPrompt([{ kind: 'user', id: 'u1', at: 1, text: 'Hello' }])
    expect(prompt).toContain('new session')
  })

  it('instructs the orchestrator about worker slots and proposing delegation', () => {
    const prompt = buildPrompt([{ kind: 'user', id: 'u1', at: 1, text: 'Let us delegate' }])
    expect(prompt).toContain('parallel worker agents')
    expect(prompt).toContain('propose a clear delegation plan')
    expect(prompt).toMatch(/never claim that you lack workers|cannot delegate/i)
  })

  it('names available worker slots when provided in options', () => {
    const prompt = buildPrompt(
      [{ kind: 'user', id: 'u1', at: 1, text: 'Split this' }],
      {
        workers: [
          { id: 'w1', vendor: 'agy', model: 'gemini-3.8-flash-medium' },
          { id: 'w4', vendor: 'agy', model: 'gemini-3.8-flash-medium' }
        ]
      }
    )
    expect(prompt).toContain('Available worker slots: w1 · agy · gemini-3.8-flash-medium, w4 · agy · gemini-3.8-flash-medium.')
  })

  it('labels a run-status snapshot with its capture time and never as live', () => {
    const prompt = buildPrompt([
      {
        kind: 'snapshot',
        id: 'n1',
        at: Date.parse('2026-09-02T10:47:00Z'),
        runId: 'run-1',
        lifecycle: 'workers',
        workers: [
          { slotId: 'w1', phase: 'running', elapsedMs: 138_000, excerpt: 'drafting', outputTokens: 9839 }
        ]
      },
      { kind: 'user', id: 'u1', at: 1, text: 'How is it going?' }
    ])
    expect(prompt).toContain('RUN-STATUS SNAPSHOT')
    expect(prompt).toContain('w1')
    expect(prompt).toContain('2m 18s')
    expect(prompt).toContain('9,839')
    expect(prompt).toMatch(/point in time|snapshot taken/i)
  })

  it('carries an accepted delegation as the fixed assignment it is', () => {
    const prompt = buildPrompt([
      {
        kind: 'delegation',
        id: 'd1',
        at: 1,
        runId: 'run-1',
        assignments: [{ slotId: 'w1', task: 'Coding benchmarks' }],
        degraded: false
      }
    ])
    expect(prompt).toContain('DELEGATION ACCEPTED')
    expect(prompt).toContain('w1: Coding benchmarks')
  })

  it('says so when a delegation could not be split', () => {
    const prompt = buildPrompt([
      { kind: 'delegation', id: 'd1', at: 1, runId: 'run-1', assignments: [], degraded: true }
    ])
    expect(prompt).toMatch(/not a split/i)
  })

  it('includes the synthesis so a follow-up can build on it', () => {
    const prompt = buildPrompt([
      { kind: 'synthesis', id: 's1', at: 1, runId: 'run-1', text: 'Merged answer.' }
    ])
    expect(prompt).toContain('Merged answer.')
  })

  it('names the absent slots on a partial synthesis', () => {
    const prompt = buildPrompt([
      {
        kind: 'synthesis',
        id: 's1',
        at: 1,
        runId: 'run-1',
        text: 'Merged answer.',
        absentSlotIds: ['w2']
      }
    ])
    expect(prompt).toContain('PARTIAL')
    expect(prompt).toContain('w2')
  })

  it('drops the empty live reply rather than replaying a blank turn', () => {
    const prompt = buildPrompt([
      { kind: 'orchestrator', id: 'r1', at: 1, text: '', phase: 'responding' }
    ])
    expect(prompt).not.toContain('ORCHESTRATOR:')
  })
})
