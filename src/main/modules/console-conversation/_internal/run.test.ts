import { describe, expect, it } from 'vitest'
import { ConsoleRun } from './run'

describe('Console run', () => {
  it('retries only the failed assignment and preserves completed evidence', () => {
    const dispatched: string[] = []
    const run = new ConsoleRun('retry', [{ targetId: 'T1', task: 'one' }, { targetId: 'T2', task: 'two' }], (id) => id, (item) => dispatched.push(item.targetId))
    run.start()
    run.complete('T1', 'file')
    run.fail('T2', 'No result')
    run.retry('T2')
    expect(dispatched).toEqual(['T1', 'T2', 'T2'])
    expect(run.snapshot().assignments[0]?.phase).toBe('completed')
    expect(run.snapshot().phase).toBe('dispatch')
  })
  it('holds dependencies, records completion and ignores duplicate completion', () => {
    const dispatched: string[] = []
    const run = new ConsoleRun('r1', [
      { targetId: 'T1', task: 'Research' },
      { targetId: 'T2', task: 'Review', dependsOn: ['T1'] }
    ], (id) => `/results/${id}.txt`, (assignment) => dispatched.push(assignment.targetId))
    run.start()
    expect(dispatched).toEqual(['T1'])
    expect(run.snapshot().assignments[1]?.phase).toBe('held')
    run.complete('T1', 'manual')
    run.complete('T1', 'manual')
    expect(dispatched).toEqual(['T1', 'T2'])
    run.complete('T2', 'hook')
    expect(run.snapshot().phase).toBe('complete')
  })
  it('does not release dependencies on failure or stop', () => {
    const dispatched: string[] = []
    const run = new ConsoleRun('r', [
      { targetId: 'T1', task: 'One' }, { targetId: 'T2', task: 'Two', dependsOn: ['T1'] }
    ], (id) => id, (assignment) => dispatched.push(assignment.targetId))
    run.start()
    run.fail('T1', 'Terminal closed')
    run.stop()
    run.complete('T1', 'hook')
    expect(dispatched).toEqual(['T1'])
    expect(run.snapshot().phase).toBe('stopped')
  })
  it('refuses to complete an assignment that has not been dispatched', () => {
    const run = new ConsoleRun('r', [{ targetId: 'T2', task: 'Two', dependsOn: ['T1'] }], (id) => id, () => {})
    run.start()
    run.complete('T2', 'manual')
    expect(run.snapshot().assignments[0]?.phase).toBe('held')
  })
})
