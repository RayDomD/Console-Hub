import { describe, expect, it } from 'vitest'
import { buildConsolePrompt } from './prompt'
import type { ConversationEntry } from '../../../../shared/orchestrator-conversation'

describe('buildConsolePrompt', () => {
  it('teaches the heading-and-launch format, never mentions a Fan run', () => {
    const prompt = buildConsolePrompt([], ['T1', 'T2'])
    expect(prompt).toContain('### <label> — <launch>')
    expect(prompt).toContain('T1, T2')
    expect(prompt.toLowerCase()).not.toContain('fan run')
    expect(prompt.toLowerCase()).not.toContain('worker')
  })

  it('teaches the waits-on dependency syntax and the file-handoff requirement', () => {
    const prompt = buildConsolePrompt([], ['T1', 'T2', 'T3'])
    expect(prompt).toContain('waits on')
    expect(prompt).toContain('Console Hub allocates a result file')
    expect(prompt.toLowerCase().replace(/\s+/g, ' ')).toContain('never the producer\'s scrollback')
  })

  it('says plainly when no terminals are open', () => {
    const prompt = buildConsolePrompt([], [])
    expect(prompt).toContain('No terminals are currently open')
  })

  it('renders a user turn and a complete orchestrator turn, skipping a still-responding one', () => {
    const entries: ConversationEntry[] = [
      { kind: 'user', id: 'u1', at: 0, text: 'research it' },
      { kind: 'orchestrator', id: 'o1', at: 1, text: 'partial so far', phase: 'responding' }
    ]
    const prompt = buildConsolePrompt(entries, ['T1'])
    expect(prompt).toContain('User: research it')
    expect(prompt).not.toContain('partial so far')
  })

  it('renders a completed orchestrator turn and notes a released delegation', () => {
    const entries: ConversationEntry[] = [
      { kind: 'orchestrator', id: 'o1', at: 1, text: '### T1 — claude\ndo it', phase: 'complete' },
      { kind: 'delegation', id: 'd1', at: 2, runId: 'r1', assignments: [{ slotId: 'T1', task: 'do it', launch: 'claude' }], degraded: false }
    ]
    const prompt = buildConsolePrompt(entries, ['T1'])
    expect(prompt).toContain('Orchestrator: ### T1 — claude')
    expect(prompt).toContain('[Delegation released to 1 terminal(s)]')
  })
})
