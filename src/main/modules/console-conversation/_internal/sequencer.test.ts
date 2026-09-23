import { describe, expect, it } from 'vitest'
import { DependencySequencer } from './sequencer'
import type { TerminalAssignment } from './delegation'

function assignment(targetId: string, dependsOn?: string[]): TerminalAssignment {
  return { targetId, task: `task for ${targetId}`, ...(dependsOn !== undefined ? { dependsOn } : {}) }
}

describe('DependencySequencer', () => {
  it('dispatches every assignment with no dependency immediately', () => {
    const dispatched: string[] = []
    const seq = new DependencySequencer((a) => dispatched.push(a.targetId))
    seq.schedule([assignment('T1'), assignment('T2')])
    expect(dispatched).toEqual(['T1', 'T2'])
  })

  it('holds a dependent assignment until its dependency is marked done', () => {
    const dispatched: string[] = []
    const seq = new DependencySequencer((a) => dispatched.push(a.targetId))
    seq.schedule([assignment('T1'), assignment('T2', ['T1'])])
    expect(dispatched).toEqual(['T1'])
    expect(seq.waitingOn('T2')).toEqual(['T1'])

    seq.markDone('T1')
    expect(dispatched).toEqual(['T1', 'T2'])
    expect(seq.waitingOn('T2')).toBeUndefined()
  })

  it('holds until every dependency is done, not just one of several', () => {
    const dispatched: string[] = []
    const seq = new DependencySequencer((a) => dispatched.push(a.targetId))
    seq.schedule([assignment('T1'), assignment('T2'), assignment('T3', ['T1', 'T2'])])
    expect(dispatched).toEqual(['T1', 'T2'])

    seq.markDone('T1')
    expect(dispatched).toEqual(['T1', 'T2'])
    expect(seq.waitingOn('T3')).toEqual(['T2'])

    seq.markDone('T2')
    expect(dispatched).toEqual(['T1', 'T2', 'T3'])
  })

  it('a target already done before scheduling releases immediately, not held', () => {
    const dispatched: string[] = []
    const seq = new DependencySequencer((a) => dispatched.push(a.targetId))
    seq.markDone('T1')
    seq.schedule([assignment('T2', ['T1'])])
    expect(dispatched).toEqual(['T2'])
  })

  it('marking an already-done target twice does not re-dispatch anything', () => {
    const dispatched: string[] = []
    const seq = new DependencySequencer((a) => dispatched.push(a.targetId))
    seq.schedule([assignment('T1'), assignment('T2', ['T1'])])
    seq.markDone('T1')
    seq.markDone('T1')
    expect(dispatched).toEqual(['T1', 'T2'])
  })

  it('a chain releases in order as each link completes', () => {
    const dispatched: string[] = []
    const seq = new DependencySequencer((a) => dispatched.push(a.targetId))
    seq.schedule([assignment('T1'), assignment('T2', ['T1']), assignment('T3', ['T2'])])
    expect(dispatched).toEqual(['T1'])
    seq.markDone('T1')
    expect(dispatched).toEqual(['T1', 'T2'])
    seq.markDone('T2')
    expect(dispatched).toEqual(['T1', 'T2', 'T3'])
  })

  it('heldTargets lists everything still waiting', () => {
    const seq = new DependencySequencer(() => {})
    seq.schedule([assignment('T1'), assignment('T2', ['T1']), assignment('T3', ['T1'])])
    expect([...seq.heldTargets()].sort()).toEqual(['T2', 'T3'])
    seq.markDone('T1')
    expect(seq.heldTargets()).toEqual([])
  })
})
