import { describe, expect, it } from 'vitest'
import type { MissionLaneState } from '../../../../../shared/mission'
import { workerHeader } from './workerHeader'

const lane: MissionLaneState = {
  id: 'L1', workerLabel: 'T1', agent: { vendor: 'agy' }, task: 'Layout preview', files: ['view.tsx'],
  validation: ['npm test'], phase: 'running', attempt: 1, evidence: []
}

describe('workerHeader', () => {
  it('combines worker, vendor, assignment, and observed Mission state', () => {
    expect(workerHeader({ label: 'T1', launcher: 'agy', missionAssignment: lane })).toEqual({
      identity: 'T1 · AGY', assignment: 'Layout preview', state: 'Running', glyph: '▮▮▮▮'
    })
  })

  it('gives each state a distinct glyph form, keeping the broken one for failure', () => {
    const glyph = (phase: MissionLaneState['phase']): string | undefined =>
      workerHeader({ label: 'T1', launcher: 'agy', missionAssignment: { ...lane, phase } }).glyph
    expect(workerHeader({ label: 'T1', launcher: 'agy', missionAssignment: { ...lane, phase: 'returned' } }).state).toBe('Done')
    expect(glyph('returned')).toBe('▮▮▮▮')
    expect(glyph('failed')).toBe('▯▮▯▮')
    expect(workerHeader({ label: 'T1', launcher: 'agy', missionAssignment: { ...lane, phase: 'held' } }).state).toBe('Idle')
    expect(glyph('held')).toBe('▯▯▯▯')
    expect(glyph('stopped')).toBe('▯▯▯▯')
  })

  it('uses observed terminal activity before a Mission assignment exists', () => {
    expect(workerHeader({ label: 'T2', launcher: 'codex', observedState: 'running' }).state).toBe('Running')
    expect(workerHeader({ label: 'T2', launcher: 'codex', observedState: 'available' }).state).toBe('Idle')
  })

  it('makes no availability claim for a terminal Console Hub does not observe', () => {
    expect(workerHeader({ label: 'T4', launcher: 'shell' })).toEqual({ identity: 'T4', assignment: undefined, state: undefined, glyph: undefined })
    expect(workerHeader({ label: 'T4', launcher: 'shell', exitCode: 0 }).state).toBe('Done')
    expect(workerHeader({ label: 'T4', launcher: 'shell', exitCode: 1 }).state).toBe('Failed')
  })

  it('shows why an unused worker remains live and warns that its workspace can drift', () => {
    expect(workerHeader({ label: 'T3', launcher: 'claude', missionAssignment: { phase: 'unused', reason: 'Work does not split coherently.' } })).toEqual({
      identity: 'T3 · CLAUDE',
      assignment: 'Work does not split coherently. Live Workspace changes may require reconciliation.',
      state: 'Idle', glyph: '▯▯▯▯'
    })
  })
})
