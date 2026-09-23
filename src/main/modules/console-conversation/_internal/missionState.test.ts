import { describe, expect, it } from 'vitest'
import type { MissionPlan } from '../../../../shared/mission'
import { beginMissionReview, createMissionState, markMissionRejected, recordMissionIntegration, recordMissionLane, releaseMission, retryMissionLane, startQueuedMission, stopMission } from './missionState'

const plan = (): MissionPlan => ({ version: 1, title: 'Build it', workspace: 'C:\\repo', acceptanceCriteria: ['works'], unusedWorkers: [], lanes: [
  { id: 'L1', workerLabel: 'T1', agent: { vendor: 'codex' }, task: 'types', files: ['a.ts'], validation: ['npm test'] },
  { id: 'L2', workerLabel: 'T2', agent: { vendor: 'claude' }, task: 'consumer', files: ['b.ts'], validation: ['npm test'], dependsOn: ['L1'] }
] })
const good = (attempt: number, file: string) => ({ attempt, vendorCompleted: true, resultPath: 'result.json', diffPath: 'diff.patch', validationPath: 'validation.txt', changedFiles: [file] })

describe('Mission state', () => {
  it('freezes held work, queues it, and dispatches only dependency-ready lanes', () => {
    const state = createMissionState('m1', plan(), 1)
    releaseMission(state, true, 'snapshot', 2)
    expect(state.phase).toBe('queued')
    startQueuedMission(state)
    expect(state.lanes.map((lane) => lane.phase)).toEqual(['running', 'held'])
    recordMissionLane(state, 'L1', good(1, 'a.ts'))
    expect(state.lanes.map((lane) => lane.phase)).toEqual(['returned', 'running'])
    recordMissionLane(state, 'L2', good(1, 'b.ts'))
    expect(state.phase).toBe('ready_review')
  })
  it('fails closed on incomplete or out-of-scope evidence and retries explicitly', () => {
    const state = createMissionState('m1', plan())
    releaseMission(state, false, 'snapshot')
    recordMissionLane(state, 'L1', good(1, 'other.ts'))
    expect(state.phase).toBe('blocked')
    expect(state.lanes[1]!.phase).toBe('held')
    retryMissionLane(state, 'L1')
    expect(state.lanes[0]!.attempt).toBe(2)
    recordMissionLane(state, 'L1', good(2, 'a.ts'))
    expect(state.lanes[1]!.phase).toBe('running')
  })
  it('holds a failed integration review for explicit user direction', () => {
    const state = createMissionState('m1', { ...plan(), lanes: [plan().lanes[0]!] })
    releaseMission(state, false, 'snapshot')
    recordMissionLane(state, 'L1', good(1, 'a.ts'))
    expect(state.phase).toBe('ready_review')
    beginMissionReview(state)
    recordMissionIntegration(state, false, 'first')
    expect(state.phase).toBe('integration_failed')
    expect(state.correctionRounds).toBe(1)
    expect(state.error).toBe('first')
  })
  it('stops without treating partial lanes as returned', () => {
    const state = createMissionState('m1', plan())
    releaseMission(state, false, 'snapshot')
    stopMission(state)
    expect(state.phase).toBe('stopped')
    expect(state.lanes.map((lane) => lane.phase)).toEqual(['stopped', 'stopped'])
  })
  it('allows explicit rejection from every phase where the terminal offers reject', () => {
    for (const phase of ['held', 'blocked', 'integration_failed', 'ready_apply', 'reconciling', 'stopped', 'interrupted'] as const) {
      const state = createMissionState(`mission-${phase}`, plan())
      state.phase = phase
      markMissionRejected(state)
      expect(state.phase).toBe('rejected')
    }
  })
  it('rejects duplicate workers and missing implementation contracts', () => {
    const bad = plan(); bad.lanes[1]!.workerLabel = 'T1'
    expect(() => createMissionState('m', bad)).toThrow('one lane')
    const noCriteria = plan(); noCriteria.acceptanceCriteria = []
    expect(() => createMissionState('m', noCriteria)).toThrow('acceptance')
  })
  it('rejects dependency cycles before a Mission can be held', () => {
    const cyclic = plan()
    cyclic.lanes[0]!.dependsOn = ['L2']
    expect(() => createMissionState('m', cyclic)).toThrow('dependency cycle')
  })
})
