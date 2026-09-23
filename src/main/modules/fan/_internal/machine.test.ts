import { describe, expect, it } from 'vitest'
import { step, enter, release, retry, stop, shutdown, restoreInterrupted } from './machine'
import type {
  FanConfig,
  FanState,
  SlotProgressEvent,
  SlotTerminalEvent
} from '../../../../shared/fan'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cfg(workerCount: 2 | 3 | 4 | 5 = 4): FanConfig {
  const workers = Array.from({ length: workerCount }, (_, i) => ({
    id: `w${i + 1}`,
    role: 'worker' as const,
    vendor: `v${i + 1}`
  }))
  return {
    question: 'What should we do?',
    slots: [
      ...workers,
      { id: 'arch', role: 'orchestrator' as const, vendor: 'va' }
    ]
  }
}

/** A delegation the parser can split across `count` workers. */
function splitFor(count: number): string {
  return Array.from({ length: count }, (_, i) => `### w${i + 1}` + NEWLINE + `Task ${i + 1}.`)
    .join(NEWLINE + NEWLINE)
}

const NEWLINE = String.fromCharCode(10)

/** Wide enough for every config here; headings for absent slots are ignored. */
const SPLIT = splitFor(5)

function terminal(
  runId: string,
  slotId: string,
  kind:
    | 'completed'
    | 'process_crash'
    | 'quota'
    | 'stream_invalid' = 'completed',
  text = 'answer'
): SlotTerminalEvent {
  const outcome =
    kind === 'completed'
      ? { kind: 'completed' as const, text }
      : kind === 'process_crash'
        ? { kind: 'process_crash' as const }
        : kind === 'quota'
          ? { kind: 'quota' as const }
          : { kind: 'stream_invalid' as const }
  return { kind: 'terminal', runId, attempt: 1, slotId, vendor: 'v', outcome }
}

/** A terminal event for a specific launch of a slot, for supersede tests. */
function terminalAttempt(
  runId: string,
  slotId: string,
  attempt: number,
  text = 'answer'
): SlotTerminalEvent {
  return {
    kind: 'terminal',
    runId,
    attempt,
    slotId,
    vendor: 'v',
    outcome: { kind: 'completed', text }
  }
}

// ---------------------------------------------------------------------------
// 1. Criteria fixed before any worker starts
// ---------------------------------------------------------------------------

describe('enter', () => {
  it('launches the delegation turn first and no worker', () => {
    const t = enter(cfg())
    const cmds = t.commands
    expect(cmds).toHaveLength(1)
    expect(cmds[0]?.kind).toBe('launch_delegation')
    expect(t.state.lifecycle).toBe('delegating')
  })

  it('latches — a second enter while the delegation is live is a no-op', () => {
    const t1 = enter(cfg())
    const t2 = enter(cfg(), t1.state)
    expect(t2.commands).toHaveLength(0)
    expect(t2.state.lifecycle).toBe('delegating')
  })
})

// ---------------------------------------------------------------------------
// 2. Workers start simultaneously after criteria are fixed
// ---------------------------------------------------------------------------

describe('delegation terminal → held → workers', () => {
  it('holds without launching workers when the split is written', () => {
    const config = cfg(4)
    const t1 = enter(config)
    const runId = t1.state.runId
    const t2 = step(
      terminal(runId, 'arch', 'completed', SPLIT),
      t1.state
    )
    expect(t2.commands).toHaveLength(0)
    expect(t2.state.lifecycle).toBe('held')

    const released = release(t2.state)
    expect(released.commands).toHaveLength(1)
    const cmd = released.commands[0]
    expect(cmd?.kind).toBe('launch_workers')
    if (cmd?.kind === 'launch_workers') {
      expect(cmd.slots).toHaveLength(4)
    }
    expect(released.state.lifecycle).toBe('workers')
  })

  it('sends each worker the task written for it, not the question', () => {
    const config = cfg(4)
    const t1 = enter(config)
    const t2 = step(
      terminal(t1.state.runId, 'arch', 'completed', SPLIT),
      t1.state
    )
    const cmd = release(t2.state).commands[0]
    if (cmd?.kind === 'launch_workers') {
      expect(cmd.slots.map(s => s.question)).toEqual(['Task 1.', 'Task 2.', 'Task 3.', 'Task 4.'])
    } else {
      expect.fail('Expected launch_workers command')
    }
  })

  it('refuses release from every lifecycle other than held', () => {
    const criteria = enter(cfg())
    expect(release(criteria.state)).toEqual({ state: criteria.state, commands: [] })

    const held = step(
      terminal(criteria.state.runId, 'arch', 'completed', SPLIT),
      criteria.state
    )
    const workers = release(held.state)
    expect(release(workers.state)).toEqual({ state: workers.state, commands: [] })
  })

  it('latches a duplicate enter while held', () => {
    const started = enter(cfg())
    const held = step(
      terminal(started.state.runId, 'arch', 'completed', SPLIT),
      started.state
    )

    const duplicate = enter(cfg(), held.state)
    expect(duplicate).toEqual({ state: held.state, commands: [] })
  })

  it('redoes the split while held and returns to held without releasing workers', () => {
    const started = enter(cfg())
    const held = step(
      terminal(started.state.runId, 'arch', 'completed', SPLIT),
      started.state
    )

    const retried = retry(held.state, 'arch')
    expect(retried.state.lifecycle).toBe('delegating')
    expect(retried.commands).toMatchObject([{ kind: 'launch_delegation', attempt: 2 }])

    const heldAgain = step(
      terminalAttempt(retried.state.runId, 'arch', 2, SPLIT),
      retried.state
    )
    expect(heldAgain.state.lifecycle).toBe('held')
    expect(heldAgain.commands).toEqual([])
  })

  it('refuses to retry a worker while held', () => {
    const started = enter(cfg())
    const held = step(
      terminal(started.state.runId, 'arch', 'completed', SPLIT),
      started.state
    )

    expect(retry(held.state, 'w1')).toEqual({ state: held.state, commands: [] })
  })

  it('refuses to redo the split after workers are released', () => {
    const started = enter(cfg())
    const held = step(
      terminal(started.state.runId, 'arch', 'completed', SPLIT),
      started.state
    )
    const workers = release(held.state)

    expect(retry(workers.state, 'arch')).toEqual({ state: workers.state, commands: [] })
  })

  it('stops a held run without trying to kill a process', () => {
    const started = enter(cfg())
    const held = step(
      terminal(started.state.runId, 'arch', 'completed', SPLIT),
      started.state
    )

    const stopped = stop(held.state)
    expect(stopped.state.lifecycle).toBe('stopped')
    expect(stopped.commands).toEqual([])
  })

  it('keeps a faulted delegation turn retryable without reaching held', () => {
    const started = enter(cfg())
    const faulted = step(terminal(started.state.runId, 'arch', 'quota'), started.state)

    expect(faulted.state.lifecycle).toBe('delegating')
    expect(faulted.commands).toEqual([])
    expect(retry(faulted.state, 'arch').commands[0]).toMatchObject({
      kind: 'launch_delegation',
      attempt: 2
    })
  })
})

// ---------------------------------------------------------------------------
// 3. Two-valid-worker threshold
// ---------------------------------------------------------------------------

function runToWorkers(config: FanConfig = cfg()): FanState {
  const t1 = enter(config)
  const workers = config.slots.filter(slot => slot.role === 'worker').length
  const t2 = step(
    terminal(t1.state.runId, 'arch', 'completed', splitFor(workers)),
    t1.state
  )
  return release(t2.state).state
}

describe('two-valid-worker threshold', () => {
  it('does NOT launch orchestrator when fewer than two workers succeed', () => {
    const state = runToWorkers(cfg(2))
    const runId = state.runId

    // w1 completes, w2 crashes
    const s1 = step(terminal(runId, 'w1', 'completed'), state)
    const s2 = step(terminal(runId, 'w2', 'process_crash'), s1.state)

    // Both are terminal; orchestrator must NOT run
    expect(s2.commands.filter(c => c.kind === 'launch_synthesis')).toHaveLength(0)
    expect(s2.state.lifecycle).not.toBe('orchestrator')
  })

  it('launches orchestrator when exactly two workers succeed (others failed)', () => {
    const state = runToWorkers(cfg(4))
    const runId = state.runId

    const s1 = step(terminal(runId, 'w1', 'completed'), state)
    const s2 = step(terminal(runId, 'w2', 'process_crash'), s1.state)
    const s3 = step(terminal(runId, 'w3', 'quota'), s2.state)
    const s4 = step(terminal(runId, 'w4', 'completed'), s3.state)

    const archCmds = s4.commands.filter(c => c.kind === 'launch_synthesis')
    expect(archCmds).toHaveLength(1)
    expect(s4.state.lifecycle).toBe('synthesis')
  })
})

// ---------------------------------------------------------------------------
// 4. Partial advisory names absent slots
// ---------------------------------------------------------------------------

describe('partial advisory', () => {
  it('names absent slots in the launch_synthesis command', () => {
    const state = runToWorkers(cfg(4))
    const runId = state.runId

    const s1 = step(terminal(runId, 'w1', 'completed'), state)
    const s2 = step(terminal(runId, 'w2', 'process_crash'), s1.state)
    const s3 = step(terminal(runId, 'w3', 'quota'), s2.state)
    const s4 = step(terminal(runId, 'w4', 'completed'), s3.state)

    const archCmd = s4.commands.find(c => c.kind === 'launch_synthesis')
    if (archCmd?.kind === 'launch_synthesis') {
      expect(archCmd.absentSlotIds).toContain('w2')
      expect(archCmd.absentSlotIds).toContain('w3')
      expect(archCmd.absentSlotIds).not.toContain('w1')
      expect(archCmd.absentSlotIds).not.toContain('w4')
    } else {
      expect.fail('No launch_synthesis command')
    }
  })
})

// ---------------------------------------------------------------------------
// 5. Workspace reaches every launch command
// ---------------------------------------------------------------------------

describe('fan workspace', () => {
  it('carries the workspace, fixed at Enter, onto criteria, worker and orchestrator launches', () => {
    const config = { ...cfg(2), workspace: 'C:\\FIles\\some-repo' }

    const t1 = enter(config)
    const criteriaCmd = t1.commands[0]
    expect(criteriaCmd).toMatchObject({ workspace: 'C:\\FIles\\some-repo' })

    const held = step(terminal(t1.state.runId, 'arch', 'completed', SPLIT), t1.state)
    const released = release(held.state)
    const workersCmd = released.commands[0]
    if (workersCmd?.kind === 'launch_workers') {
      expect(workersCmd.slots.every(s => s.workspace === 'C:\\FIles\\some-repo')).toBe(true)
    } else {
      expect.fail('Expected launch_workers command')
    }

    const runId = released.state.runId
    const s1 = step(terminal(runId, 'w1', 'completed', 'one'), released.state)
    const s2 = step(terminal(runId, 'w2', 'completed', 'two'), s1.state)
    const archCmd = s2.commands.find(c => c.kind === 'launch_synthesis')
    expect(archCmd).toMatchObject({ workspace: 'C:\\FIles\\some-repo' })
  })

  it('carries no workspace on any launch when the fan config has none', () => {
    const t1 = enter(cfg(2))
    expect(t1.commands[0]).not.toHaveProperty('workspace')

    const held = step(terminal(t1.state.runId, 'arch', 'completed', SPLIT), t1.state)
    const released = release(held.state)
    const workersCmd = released.commands[0]
    if (workersCmd?.kind === 'launch_workers') {
      expect(workersCmd.slots.every(s => !('workspace' in s))).toBe(true)
    } else {
      expect.fail('Expected launch_workers command')
    }

    const runId = released.state.runId
    const s1 = step(terminal(runId, 'w1', 'completed', 'one'), released.state)
    const s2 = step(terminal(runId, 'w2', 'completed', 'two'), s1.state)
    const archCmd = s2.commands.find(c => c.kind === 'launch_synthesis')
    expect(archCmd).not.toHaveProperty('workspace')
  })
})

// ---------------------------------------------------------------------------
// 6. The orchestrator writes its comparison outside docs/plans/
// ---------------------------------------------------------------------------

describe('orchestrator output path', () => {
  it('writes to a comparisons directory, never into docs/plans/', () => {
    let transition = enter(cfg(2))
    const runId = transition.state.runId
    transition = step(terminal(runId, 'arch', 'completed', SPLIT), transition.state)
    transition = release(transition.state)
    transition = step(terminal(runId, 'w1', 'completed', 'one'), transition.state)
    transition = step(terminal(runId, 'w2', 'completed', 'two'), transition.state)
    transition = step(terminalAttempt(runId, 'arch', 2, 'comparison'), transition.state)

    const write = transition.commands.find(command => command.kind === 'write_synthesis_document')
    expect(write?.kind).toBe('write_synthesis_document')
    if (write?.kind === 'write_synthesis_document') {
      expect(write.outputPath).toMatch(/^docs\/comparisons\//)
      expect(write.outputPath).not.toMatch(/^docs\/plans\//)
    }
    expect(transition.state.orchestrator.outputPath).toMatch(/^docs\/comparisons\//)
  })
})

// ---------------------------------------------------------------------------
// 7. Three fault kinds each reach terminal without hanging
// ---------------------------------------------------------------------------

describe('faults reach terminal', () => {
  it.each([
    ['process_crash', 'process_crash'],
    ['quota', 'quota'],
    ['stream_invalid', 'stream_invalid']
  ] as const)('%s slot becomes terminal, not hanging', (faultKind, expectedPhase) => {
    const config = cfg(2)
    const state = runToWorkers(config)
    const runId = state.runId

    const s1 = step(terminal(runId, 'w1', faultKind), state)
    expect(s1.state.slots['w1']).toMatchObject({ phase: expectedPhase })
  })

  it('machine never waits on a slot that is already terminal', () => {
    const state = runToWorkers(cfg(2))
    const runId = state.runId

    // Both slots go process_crash — lifecycle should NOT stay 'workers'
    const s1 = step(terminal(runId, 'w1', 'process_crash'), state)
    const s2 = step(terminal(runId, 'w2', 'process_crash'), s1.state)

    // With fewer than 2 valid, no orchestrator; lifecycle must not be stuck on 'workers'
    expect(s2.state.lifecycle).not.toBe('workers')
  })
})

// ---------------------------------------------------------------------------
// 6. Retry — never reruns success; never mutates criteria
// ---------------------------------------------------------------------------

function runToAllWorkersFailed(): FanState {
  const config = cfg(2)
  const state = runToWorkers(config)
  const runId = state.runId
  const s1 = step(terminal(runId, 'w1', 'process_crash'), state)
  const s2 = step(terminal(runId, 'w2', 'process_crash'), s1.state)
  return s2.state
}

describe('retry', () => {
  it('retries a failed worker slot', () => {
    const state = runToAllWorkersFailed()
    const t = retry(state, 'w1')
    expect(t.commands).toHaveLength(1)
    const cmd = t.commands[0]
    expect(cmd?.kind).toBe('launch_workers')
    if (cmd?.kind === 'launch_workers') {
      expect(cmd.slots.map(s => s.slotId)).toContain('w1')
    }
  })

  it('does NOT retry a completed worker slot', () => {
    // set up: w1 complete, w2 crash
    const config = cfg(2)
    const state = runToWorkers(config)
    const runId = state.runId
    const s1 = step(terminal(runId, 'w1', 'completed'), state)
    const s2 = step(terminal(runId, 'w2', 'process_crash'), s1.state)

    // Should not rerun w1
    const t = retry(s2.state, 'w1')
    expect(t.commands).toHaveLength(0)
  })

  it('latches — double retry on same slot while it is running is a no-op', () => {
    const state = runToAllWorkersFailed()
    const t1 = retry(state, 'w1')
    const t2 = retry(t1.state, 'w1')
    expect(t2.commands).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 7. Stale run-id events are ignored
// ---------------------------------------------------------------------------

describe('stale run-id rejection', () => {
  it('ignores a slot event that carries an old run id', () => {
    const t1 = enter(cfg())
    const staleRunId = 'old-run-id-that-never-existed'
    const t2 = step(
      terminal(staleRunId, 'arch', 'completed', SPLIT),
      t1.state
    )
    // State must be unchanged — no commands and lifecycle still 'criteria'
    expect(t2.commands).toHaveLength(0)
    expect(t2.state.lifecycle).toBe('delegating')
  })

  it('rejects worker events from the previous run after Stop + Enter', () => {
    const config = cfg(2)
    const t1 = enter(config)
    const oldRunId = t1.state.runId
    const t2 = step(terminal(oldRunId, 'crit', 'completed'), t1.state)
    const t3 = stop(t2.state)
    const t4 = enter(config, t3.state)
    const newRunId = t4.state.runId
    expect(newRunId).not.toBe(oldRunId)

    // old run event must be silently dropped
    const t5 = step(terminal(oldRunId, 'w1', 'completed'), t4.state)
    expect(t5.commands).toHaveLength(0)
    expect(t5.state.lifecycle).toBe('delegating') // fresh run just started criteria
  })
})

// ---------------------------------------------------------------------------
// 8. Stop — no comparison; keeps completed answers
// ---------------------------------------------------------------------------

describe('stop', () => {
  it('kills in-flight slots and does not launch orchestrator', () => {
    const config = cfg(2)
    const state = runToWorkers(config)
    const runId = state.runId

    // w1 completes before stop
    const s1 = step(terminal(runId, 'w1', 'completed'), state)
    const stopT = stop(s1.state)

    expect(stopT.state.lifecycle).toBe('stopped')
    // w2 was in-flight — should receive a kill_slot command
    const kills = stopT.commands.filter(c => c.kind === 'kill_slot')
    expect(kills.length).toBeGreaterThan(0)

    // No orchestrator launched
    expect(stopT.commands.filter(c => c.kind === 'launch_synthesis')).toHaveLength(0)
  })

  it('preserves completed answer after stop', () => {
    const config = cfg(2)
    const state = runToWorkers(config)
    const runId = state.runId
    const s1 = step(terminal(runId, 'w1', 'completed', 'my-answer'), state)
    const stopT = stop(s1.state)
    const w1 = stopT.state.slots['w1']
    expect(w1?.phase).toBe('completed')
    if (w1?.phase === 'completed') {
      expect(w1.text).toBe('my-answer')
    }
  })
})

// ---------------------------------------------------------------------------
// 9. Enter after Stop starts a new run (not a resume)
// ---------------------------------------------------------------------------

describe('enter after stop', () => {
  it('produces a fresh run id', () => {
    const config = cfg(2)
    const t1 = enter(config)
    const stopT = stop(t1.state)
    const t2 = enter(config, stopT.state)
    expect(t2.state.runId).not.toBe(t1.state.runId)
    expect(t2.state.lifecycle).toBe('delegating')
  })
})

// ---------------------------------------------------------------------------
// 9b. Run id identity — a run never overwrites an earlier run's comparison
// (docs/tickets.md:517)
// ---------------------------------------------------------------------------

describe('run id identity', () => {
  it('uses a caller-supplied run id verbatim when one is given', () => {
    const t = enter(cfg(2), undefined, { runId: 'session-a-run-1' })
    expect(t.state.runId).toBe('session-a-run-1')
  })

  it('derives the comparison path from the supplied run id, not a process counter', () => {
    const config = cfg(2)
    let t = enter(config, undefined, { runId: 'session-a-run-1' })
    const runId = t.state.runId
    t = release(step(terminal(runId, 'arch', 'completed', SPLIT), t.state).state)
    t = step(terminal(runId, 'w1', 'completed', 'one'), t.state)
    t = step(terminal(runId, 'w2', 'completed', 'two'), t.state)
    t = step(terminalAttempt(runId, 'arch', 2, 'comparison'), t.state)

    const write = t.commands.find(c => c.kind === 'write_synthesis_document')
    expect(write?.kind === 'write_synthesis_document' && write.outputPath)
      .toBe('docs/comparisons/session-a-run-1-comparison.md')
  })

  it('two supplied ids never collide on a path, independent of call order', () => {
    // Simulates two separate Console Hub sessions, each restarting the process
    // counter to zero — the collision the ticket reports. Supplying the id
    // rather than deriving it from `seq` is what keeps the two apart, and
    // this holds regardless of which enter() call happens first.
    const second = enter(cfg(2), undefined, { runId: 'session-c-run-1' })
    const first = enter(cfg(2), undefined, { runId: 'session-b-run-1' })
    expect(first.state.runId).not.toBe(second.state.runId)
  })

  it('falls back to the process-local counter when no run id is supplied', () => {
    // Existing callers that never pass EnterOptions.runId keep today's shape.
    const t = enter(cfg(2))
    expect(t.state.runId).toMatch(/^fan-run-\d+$/)
  })
})

// ---------------------------------------------------------------------------
// 10. Crash restore opens as INTERRUPTED
// ---------------------------------------------------------------------------

describe('restoreInterrupted', () => {
  it('restores as INTERRUPTED and does not resume', () => {
    const config = cfg(2)
    const completedSlots: Record<string, { phase: 'completed'; text: string }> = {
      w1: { phase: 'completed', text: 'saved answer' }
    }
    const t = restoreInterrupted(config, 'restored-run-id', completedSlots)
    expect(t.state.lifecycle).toBe('interrupted')
    const w1 = t.state.slots['w1']
    expect(w1?.phase).toBe('completed')
    if (w1?.phase === 'completed') {
      expect(w1.text).toBe('saved answer')
    }
    // No commands — machine does not automatically resume
    expect(t.commands).toHaveLength(0)
  })

  it('offers restart as new run from interrupted', () => {
    const config = cfg(2)
    const t = restoreInterrupted(config, 'restored-run-id', {})
    // Enter from interrupted state starts fresh
    const t2 = enter(config, t.state)
    expect(t2.state.runId).not.toBe('restored-run-id')
    expect(t2.state.lifecycle).toBe('delegating')
  })
})

// ---------------------------------------------------------------------------
// 11. Token accumulation
// ---------------------------------------------------------------------------

describe('token accumulation', () => {
  it('accumulates tokens across slots', () => {
    const config = cfg(2)
    const t1 = enter(config)
    const runId = t1.state.runId

    const delegationEvent: SlotTerminalEvent = {
      kind: 'terminal',
      runId,
      attempt: 1,
      slotId: 'arch',
      vendor: 'va',
      outcome: { kind: 'completed', text: SPLIT },
      usage: { inputTokens: 10, outputTokens: 20 }
    }
    const t2 = step(delegationEvent, t1.state)
    expect(t2.state.cumulativeTokens).toBe(20)

    const w1Event: SlotTerminalEvent = {
      kind: 'terminal',
      runId,
      attempt: 1,
      slotId: 'w1',
      vendor: 'v1',
      outcome: { kind: 'completed', text: 'answer' },
      usage: { inputTokens: 5, outputTokens: 15 }
    }
    const t3 = step(w1Event, release(t2.state).state)
    expect(t3.state.cumulativeTokens).toBe(35)
  })
})

// ---------------------------------------------------------------------------
// 12. Orchestrator write command emitted at right moment
// ---------------------------------------------------------------------------

describe('orchestrator write command', () => {
  it('emits write_synthesis_document only after valid completed orchestrator stream', () => {
    const config = cfg(2)
    const state = runToWorkers(config)
    const runId = state.runId

    const s1 = step(terminal(runId, 'w1', 'completed', 'answer1'), state)
    const s2 = step(terminal(runId, 'w2', 'completed', 'answer2'), s1.state)
    // orchestrator runs — no write_synthesis_document yet
    expect(s2.commands.filter(c => c.kind === 'write_synthesis_document')).toHaveLength(0)
    expect(s2.state.lifecycle).toBe('synthesis')

    // orchestrator completes
    const s3 = step(terminalAttempt(runId, 'arch', 2, 'the plan'), s2.state)
    const writes = s3.commands.filter(c => c.kind === 'write_synthesis_document')
    expect(writes).toHaveLength(1)
    expect(s3.state.lifecycle).toBe('done')
  })

  it('does NOT emit write_synthesis_document on orchestrator fault', () => {
    const config = cfg(2)
    const state = runToWorkers(config)
    const runId = state.runId

    const s1 = step(terminal(runId, 'w1', 'completed', 'answer1'), state)
    const s2 = step(terminal(runId, 'w2', 'completed', 'answer2'), s1.state)
    const s3 = step(
      { ...terminal(runId, 'arch', 'process_crash'), attempt: 2 },
      s2.state
    )

    expect(s3.commands.filter(c => c.kind === 'write_synthesis_document')).toHaveLength(0)
    expect(s3.state.orchestrator.phase).toBe('failed')
  })
})

// ---------------------------------------------------------------------------
// 13. Shutdown emits teardown for all in-flight slots
// ---------------------------------------------------------------------------

describe('shutdown', () => {
  it('emits kill_slot for every in-flight slot', () => {
    const config = cfg(2)
    const state = runToWorkers(config)
    const t = shutdown(state)
    const kills = t.commands.filter(c => c.kind === 'kill_slot')
    expect(kills.length).toBe(2) // w1, w2 were running
  })
})

// ---------------------------------------------------------------------------
// 14. Config validation
// ---------------------------------------------------------------------------

describe('enter validation', () => {
  it('rejects a config with duplicate slot names', () => {
    const badConfig: FanConfig = {
      question: 'q',
      slots: [
        { id: 'dup', role: 'worker', vendor: 'vc' },
        { id: 'dup', role: 'worker', vendor: 'v1' },
        { id: 'w2', role: 'worker', vendor: 'v2' },
        { id: 'arch', role: 'orchestrator', vendor: 'va' }
      ]
    }
    expect(() => enter(badConfig)).toThrow(/duplicate/i)
  })

  it('rejects a config with no orchestrator', () => {
    const badConfig: FanConfig = {
      question: 'q',
      slots: [
        { id: 'w1', role: 'worker', vendor: 'v1' },
        { id: 'w2', role: 'worker', vendor: 'v2' }
      ]
    }
    expect(() => enter(badConfig)).toThrow(/orchestrator/i)
  })

  it('rejects fewer than 2 worker slots', () => {
    const badConfig: FanConfig = {
      question: 'q',
      slots: [
        { id: 'w1', role: 'worker', vendor: 'v1' },
        { id: 'arch', role: 'orchestrator', vendor: 'va' }
      ]
    }
    expect(() => enter(badConfig)).toThrow(/2.+5|worker/i)
  })

  it('rejects more than 5 worker slots', () => {
    const slots = [
      ...Array.from({ length: 6 }, (_, i) => ({ id: `w${i + 1}`, role: 'worker' as const, vendor: `v${i + 1}` })),
      { id: 'arch', role: 'orchestrator' as const, vendor: 'va' }
    ]
    expect(() => enter({ question: 'q', slots })).toThrow(/2.+5|worker/i)
  })

  it('accepts a config with no criteria slot', () => {
    const config: FanConfig = {
      question: 'q',
      slots: [
        { id: 'w1', role: 'worker', vendor: 'v1' },
        { id: 'w2', role: 'worker', vendor: 'v2' },
        { id: 'arch', role: 'orchestrator', vendor: 'va' }
      ]
    }
    expect(() => enter(config)).not.toThrow()
  })

  it('reaches unscored, not idle, when fewer than two workers succeed', () => {
    const c = cfg(2)
    let t = enter(c)
    const runId = t.state.runId
    t = release(step(terminal(runId, 'arch', 'completed', SPLIT), t.state).state)
    t = step(terminal(runId, 'w1', 'quota'), t.state)
    t = step(terminal(runId, 'w2', 'quota'), t.state)

    expect(t.state.lifecycle).toBe('unscored')
  })

  it('absorbs a second enter while a retried worker is still live', () => {
    const c = cfg(2)
    let t = enter(c)
    const runId = t.state.runId
    t = release(step(terminal(runId, 'arch', 'completed', SPLIT), t.state).state)
    t = step(terminal(runId, 'w1', 'quota'), t.state)
    t = step(terminal(runId, 'w2', 'quota'), t.state)

    t = retry(t.state, 'w1')
    expect(t.state.slots['w1']?.phase).toBe('running')
    expect(t.state.lifecycle).toBe('workers')

    // The retried process is live, so Enter must not spend a second time.
    const after = enter(c, t.state)
    expect(after.commands).toEqual([])
    expect(after.state.runId).toBe(runId)
  })
})

// ---------------------------------------------------------------------------
// Reviewer-added: a recovered slot supersedes the partial comparison (F2)
// ---------------------------------------------------------------------------

describe('recovered slot supersedes the partial comparison', () => {
  it('emits a second launch_synthesis including the recovered answer', () => {
    const c = cfg(3)
    let t = enter(c)
    const runId = t.state.runId
    t = release(step(terminal(runId, 'arch', 'completed', SPLIT), t.state).state)
    t = step(terminal(runId, 'w1', 'completed', 'a1'), t.state)
    t = step(terminal(runId, 'w2', 'completed', 'a2'), t.state)
    t = step(terminal(runId, 'w3', 'process_crash'), t.state)

    const first = t.commands.find(cmd => cmd.kind === 'launch_synthesis')
    expect(first).toBeDefined()
    expect(first?.kind === 'launch_synthesis' && first.absentSlotIds).toEqual(['w3'])

    // The user retries the crashed worker and it comes back with a real answer.
    // The retry is its second launch, so its event must carry attempt 2.
    t = retry(t.state, 'w3')
    t = step(terminalAttempt(runId, 'w3', 2, 'a3'), t.state)

    // The first orchestrator was still live, so it must be killed before the
    // replacement launches — two comparison processes must never overlap.
    const killIdx = t.commands.findIndex(
      cmd => cmd.kind === 'kill_slot' && cmd.slotId === 'arch'
    )
    const launchIdx = t.commands.findIndex(cmd => cmd.kind === 'launch_synthesis')
    expect(killIdx).toBeGreaterThanOrEqual(0)
    expect(killIdx).toBeLessThan(launchIdx)

    const second = t.commands.find(cmd => cmd.kind === 'launch_synthesis')
    expect(second).toBeDefined()
    if (second?.kind !== 'launch_synthesis') throw new Error('expected launch_synthesis')
    expect(second.absentSlotIds).toEqual([])
    expect(second.answers.map(a => a.slotId).sort()).toEqual(['w1', 'w2', 'w3'])
  })
})

// ---------------------------------------------------------------------------
// Independent-review regressions (F1-F4). Each of these failed before the fix.
// ---------------------------------------------------------------------------

describe('F1 — a superseded orchestrator cannot complete the run', () => {
  it('drops the killed orchestrator event and keeps the replacement live', () => {
    let t = enter(cfg(3))
    const r = t.state.runId
    t = release(step(terminal(r, 'arch', 'completed', SPLIT), t.state).state)
    t = step(terminal(r, 'w1', 'completed', 'a1'), t.state)
    t = step(terminal(r, 'w2', 'completed', 'a2'), t.state)
    t = step(terminal(r, 'w3', 'process_crash'), t.state)
    // First comparison is live, running on two answers with w3 absent.

    t = retry(t.state, 'w3')
    t = step(terminalAttempt(r, 'w3', 2, 'a3'), t.state)
    // Replacement comparison launched; the first was killed.

    // The killed orchestrator now reports back. It must not complete the run.
    // Attempt 1 was the delegation, 2 the killed synthesis, 3 its replacement.
    const late = t.state
    const afterLate = step(terminalAttempt(r, 'arch', 2, 'stale comparison'), late)
    expect(afterLate.commands).toEqual([])
    expect(afterLate.state.lifecycle).toBe('synthesis')
    expect(afterLate.state.orchestrator.phase).toBe('running')

    // The replacement completes normally and writes the full comparison.
    const done = step(terminalAttempt(r, 'arch', 3, 'real comparison'), late)
    const write = done.commands.find(c => c.kind === 'write_synthesis_document')
    expect(write?.kind === 'write_synthesis_document' && write.content).toBe('real comparison')
    expect(done.state.lifecycle).toBe('done')
  })
})

describe('F2 — a closed run is never resumed by retry', () => {
  it('refuses to retry a worker after Stop', () => {
    let t = enter(cfg(2))
    const r = t.state.runId
    t = release(step(terminal(r, 'arch', 'completed', SPLIT), t.state).state)
    t = stop(t.state)
    expect(t.state.lifecycle).toBe('stopped')

    const after = retry(t.state, 'w1')
    expect(after.commands).toEqual([])
    expect(after.state.lifecycle).toBe('stopped')
  })

  it('refuses to retry after restoreInterrupted', () => {
    const t = restoreInterrupted(cfg(2), 'old-run', {
      w1: { phase: 'completed', text: 'kept' }
    })
    expect(t.state.lifecycle).toBe('interrupted')

    const after = retry(t.state, 'w2')
    expect(after.commands).toEqual([])
    expect(after.state.lifecycle).toBe('interrupted')
  })
})

describe('F3 — Enter never deadlocks after a closed run', () => {
  it('starts a fresh run rather than latching on a phantom running slot', () => {
    const c = cfg(2)
    let t = enter(c)
    const r = t.state.runId
    t = release(step(terminal(r, 'arch', 'completed', SPLIT), t.state).state)
    t = step(terminal(r, 'w1', 'completed', 'a1'), t.state)
    t = step(terminal(r, 'w2', 'completed', 'a2'), t.state)
    t = step(terminalAttempt(r, 'arch', 2, 'cmp'), t.state)
    expect(t.state.lifecycle).toBe('done')

    // Retry is refused in a closed run, so no phantom is created.
    const retried = retry(t.state, 'w1')
    expect(retried.commands).toEqual([])

    // Enter still works and produces a genuinely new run.
    const after = enter(c, t.state)
    expect(after.commands.some(cmd => cmd.kind === 'launch_delegation')).toBe(true)
    expect(after.state.runId).not.toBe(r)
  })
})

describe('F4 — a fault message survives into slot status', () => {
  it('keeps the runner message on a quota fault', () => {
    let t = enter(cfg(2))
    const r = t.state.runId
    t = release(step(terminal(r, 'arch', 'completed', SPLIT), t.state).state)
    t = step(
      {
        kind: 'terminal',
        runId: r,
        attempt: 1,
        slotId: 'w1',
        vendor: 'v',
        outcome: { kind: 'quota', message: 'weekly limit reached' }
      },
      t.state
    )

    const w1 = t.state.slots['w1']
    expect(w1?.phase).toBe('quota')
    expect(w1?.phase === 'quota' && w1.message).toBe('weekly limit reached')
  })
})

// ---------------------------------------------------------------------------
// 18. A running slot carries what the stream has measured so far
// ---------------------------------------------------------------------------

describe('progress usage', () => {
  function progress(
    runId: string,
    slotId: string,
    partialText?: string,
    usage?: SlotProgressEvent['usage']
  ): SlotProgressEvent {
    return { kind: 'progress', runId, attempt: 1, slotId, vendor: 'v1', partialText, usage }
  }

  it('exposes the usage a progress event supplies on the running slot', () => {
    const state = runToWorkers(cfg(2))
    const t = step(progress(state.runId, 'w1', 'half an ', { outputTokens: 8, throughput: 41 }), state)
    const status = t.state.slots.w1

    expect(status).toEqual({
      phase: 'running',
      partialText: 'half an ',
      usage: { outputTokens: 8, throughput: 41 }
    })
  })

  it('holds the last usage through a progress event that supplies none', () => {
    const state = runToWorkers(cfg(2))
    const t1 = step(progress(state.runId, 'w1', 'half an ', { outputTokens: 8, throughput: 41 }), state)
    const t2 = step(progress(t1.state.runId, 'w1', 'half an answer'), t1.state)
    const status = t2.state.slots.w1

    expect(status).toEqual({
      phase: 'running',
      partialText: 'half an answer',
      usage: { outputTokens: 8, throughput: 41 }
    })
  })

  it('leaves usage undefined where the stream never supplied any', () => {
    const state = runToWorkers(cfg(2))
    const t = step(progress(state.runId, 'w1', 'text only'), state)
    const status = t.state.slots.w1

    expect(status).toEqual({ phase: 'running', partialText: 'text only', usage: undefined })
  })
})

// ---------------------------------------------------------------------------
// The orchestrated fan (ADR 0019)
// ---------------------------------------------------------------------------

describe('the orchestrated fan', () => {
  /** A two-worker orchestrated config: no criteria slot, and a delegation. */
  function orchestrated(): FanConfig {
    return {
      question: 'Research Belo, the skincare company.',
      delegation: 'Split it: one on the founding story, one on the product range.',
      slots: [
        { id: 'w1', role: 'worker' as const, vendor: 'v1' },
        { id: 'w2', role: 'worker' as const, vendor: 'v2' },
        { id: 'arch', role: 'orchestrator' as const, vendor: 'va' }
      ]
    }
  }

  it('is its own kind, and takes the delegation turn before any worker spends', () => {
    const t = enter(orchestrated())
    expect(t.state.kind).toBe('orchestrated')
    expect(t.state.lifecycle).toBe('delegating')

    expect(t.commands).toHaveLength(1)
    const command = t.commands[0]
    expect(command?.kind).toBe('launch_delegation')
    expect(t.state.slots.w1).toEqual({ phase: 'idle' })
    expect(t.state.slots.w2).toEqual({ phase: 'idle' })
  })

  it('tells the orchestrator which slots it must write a task for', () => {
    const command = enter(orchestrated()).commands[0]
    if (command?.kind !== 'launch_delegation') throw new Error('expected a delegation launch')
    expect(command.workerSlotIds).toEqual(['w1', 'w2'])
    expect(command.question).toBe('Research Belo, the skincare company.')
    expect(command.delegation).toBe('Split it: one on the founding story, one on the product range.')
  })

  it('holds after the delegation so the split is read before the workers spend', () => {
    // ADR 0019 reuses ADR 0015's gate: one cheap turn precedes several
    // expensive ones, and a reworded question is exactly what needs a human eye.
    const t1 = enter(orchestrated())
    const t2 = step(
      terminal(t1.state.runId, 'arch', 'completed', '### w1\nFounding story.\n\n### w2\nProducts.'),
      t1.state
    )

    expect(t2.state.lifecycle).toBe('held')
    expect(t2.commands).toEqual([])
    expect(t2.state.delegation?.degraded).toBe(false)
    expect(t2.state.delegation?.tasks).toEqual({ w1: 'Founding story.', w2: 'Products.' })
  })

  it('sends each worker its own task rather than the question verbatim', () => {
    const t1 = enter(orchestrated())
    const t2 = step(
      terminal(t1.state.runId, 'arch', 'completed', '### w1\nFounding story.\n\n### w2\nProducts.'),
      t1.state
    )
    const t3 = release(t2.state)

    const launch = t3.commands.find((c) => c.kind === 'launch_workers')
    if (launch?.kind !== 'launch_workers') throw new Error('expected a worker launch')
    expect(launch.slots.map((s) => s.question)).toEqual(['Founding story.', 'Products.'])
  })

  it('records a delegation it could not split, rather than pretending it split', () => {
    const t1 = enter(orchestrated())
    const t2 = step(
      terminal(t1.state.runId, 'arch', 'completed', 'Everyone research the company.'),
      t1.state
    )

    expect(t2.state.delegation?.degraded).toBe(true)
    const launch = release(t2.state).commands.find((c) => c.kind === 'launch_workers')
    if (launch?.kind !== 'launch_workers') throw new Error('expected a worker launch')
    expect(launch.slots.map((s) => s.question))
      .toEqual(['Everyone research the company.', 'Everyone research the company.'])
  })

  it('never carries criteria, because an orchestrated run is unscored', () => {
    const t1 = enter(orchestrated())
    const t2 = step(
      terminal(t1.state.runId, 'arch', 'completed', '### w1\nOne.\n\n### w2\nTwo.'),
      t1.state
    )
    const t3 = release(t2.state)
    const w1 = terminal(t3.state.runId, 'w1', 'completed', 'first finding')
    const t4 = step(w1, t3.state)
    const t5 = step(terminal(t3.state.runId, 'w2', 'completed', 'second finding'), t4.state)

    const collect = t5.commands.find((c) => c.kind === 'launch_synthesis')
    if (collect?.kind !== 'launch_synthesis') throw new Error('expected a collecting turn')
    expect(collect.answers.map((a) => a.text)).toEqual(['first finding', 'second finding'])
  })

})
