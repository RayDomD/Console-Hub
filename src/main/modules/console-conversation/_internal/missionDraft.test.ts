import { describe, expect, it } from 'vitest'
import type { ConsoleAgent } from '../../../../shared/consoles'
import { parseMissionDraft } from './missionDraft'

const workers: Record<string, ConsoleAgent | undefined> = {
  T1: { vendor: 'codex', model: 'gpt-5.6-terra' },
  T2: { vendor: 'claude', model: 'claude-sonnet-4-6' },
  T3: undefined
}

const draft = (overrides: Partial<Record<string, unknown>> = {}): string => JSON.stringify({
  version: 1,
  title: 'Build it',
  workspace: 'C:\\repo',
  acceptanceCriteria: ['works'],
  unusedWorkers: [{ label: 'T2', reason: 'The task does not split coherently.' }],
  lanes: [
    { id: 'L1', workerLabel: 'T1', agent: { vendor: 'codex', model: 'gpt-5.6-terra' }, task: 'types', files: ['a.ts'], validation: ['npm test'] }
  ],
  ...overrides
})

describe('parseMissionDraft', () => {
  it('holds a valid Mission plan drafted for an already-launched worker', () => {
    const result = parseMissionDraft('m1', draft(), workers)
    expect(result.kind).toBe('held')
    if (result.kind === 'held') {
      expect(result.state.phase).toBe('held')
      expect(result.state.plan.title).toBe('Build it')
    }
  })

  it('refuses invalid JSON rather than throwing', () => {
    expect(parseMissionDraft('m1', 'not json', workers)).toEqual({ kind: 'refused', reason: 'Mission plan must be valid JSON.' })
  })

  it('refuses a lane naming a terminal that is not open Mission crew', () => {
    const result = parseMissionDraft('m1', draft({
      lanes: [{ id: 'L1', workerLabel: 'T9', agent: { vendor: 'codex' }, task: 'types', files: ['a.ts'], validation: ['npm test'] }]
    }), workers)
    expect(result).toEqual({ kind: 'refused', reason: 'T9 is not an open Mission crew terminal.' })
  })

  it('refuses changing an existing worker\'s vendor without marking the lane a reinforcement', () => {
    const result = parseMissionDraft('m1', draft({
      lanes: [{ id: 'L1', workerLabel: 'T1', agent: { vendor: 'claude' }, task: 'types', files: ['a.ts'], validation: ['npm test'] }]
    }), workers)
    expect(result).toEqual({ kind: 'refused', reason: 'T1: select a new agent in fleet configuration before changing vendors.' })
  })

  it('refuses a bare-shell worker lane that is not marked a reinforcement', () => {
    const result = parseMissionDraft('m1', draft({
      lanes: [{ id: 'L1', workerLabel: 'T3', agent: { vendor: 'codex' }, task: 'types', files: ['a.ts'], validation: ['npm test'] }]
    }), workers)
    expect(result).toEqual({ kind: 'refused', reason: 'T3 has no launched agent; mark its lane as a reinforcement.' })
  })

  it('allows a reinforcement lane to propose a new worker and vendor', () => {
    const result = parseMissionDraft('m1', draft({
      lanes: [{ id: 'L1', workerLabel: 'T3', agent: { vendor: 'agy', model: 'gemini-3.7-flash-low' }, task: 'types', files: ['a.ts'], validation: ['npm test'], reinforcement: true }],
      unusedWorkers: [
        { label: 'T1', reason: 'The reinforcement owns this lane.' },
        { label: 'T2', reason: 'The reinforcement owns this lane.' }
      ]
    }), workers)
    expect(result.kind).toBe('held')
  })

  it('preserves the selected model and effort for an existing worker', () => {
    const result = parseMissionDraft('m1', draft({
      lanes: [{ id: 'L1', workerLabel: 'T1', agent: { vendor: 'codex', model: 'different', effort: 'low' }, task: 'types', files: ['a.ts'], validation: ['npm test'] }]
    }), { ...workers, T1: { vendor: 'codex', model: 'gpt-5.6-terra', effort: 'high' } })

    expect(result.kind).toBe('held')
    if (result.kind === 'held') expect(result.state.plan.lanes[0]?.agent).toEqual({
      vendor: 'codex', model: 'gpt-5.6-terra', effort: 'high'
    })
  })

  it('requires every unassigned worker to have one non-empty unused reason', () => {
    expect(parseMissionDraft('m1', draft({ unusedWorkers: [] }), workers)).toEqual({
      kind: 'refused', reason: 'T2 must be assigned a lane or named once in unusedWorkers.'
    })
    expect(parseMissionDraft('m1', draft({ unusedWorkers: [{ label: 'T2', reason: '  ' }] }), workers)).toEqual({
      kind: 'refused', reason: 'Every unused worker requires a non-empty reason.'
    })
    expect(parseMissionDraft('m1', draft({ unusedWorkers: [{ label: 'T1', reason: 'Unused.' }, { label: 'T2', reason: 'Unused.' }] }), workers)).toEqual({
      kind: 'refused', reason: 'T1 cannot be both assigned and unused.'
    })
  })

  it('preserves a worker skill and compact context contract', () => {
    const result = parseMissionDraft('m1', draft({
      lanes: [{
        id: 'L1', workerLabel: 'T1', agent: { vendor: 'codex' }, task: 'explore the design',
        files: ['docs/mockups/explorer.html'], validation: ['npm run build'], skills: ['ui-preview'],
        contextRefs: ['PRODUCT.md', 'DESIGN.md'], deliverables: ['previewUrl', 'artifactPath', 'decisionSummary']
      }]
    }), workers)

    expect(result.kind).toBe('held')
    if (result.kind === 'held') expect(result.state.plan.lanes[0]).toMatchObject({
      skills: ['ui-preview'], contextRefs: ['PRODUCT.md', 'DESIGN.md']
    })
  })

  it('refuses interactive lanes while controlled session continuation is unavailable', () => {
    const result = parseMissionDraft('m1', draft({ lanes: [{
      id: 'L1', workerLabel: 'T1', agent: { vendor: 'codex' }, task: 'explore', files: ['a.ts'],
      validation: ['npm test'], interactive: true
    }] }), workers)
    expect(result).toEqual({ kind: 'refused', reason: 'L1: interactive Mission lanes are not supported yet; use an ordinary Console session.' })
  })

  it('refuses namespaced skill labels that cannot map to a configured skill folder', () => {
    const result = parseMissionDraft('m1', draft({
      lanes: [{ id: 'L1', workerLabel: 'T1', agent: { vendor: 'codex' }, task: 'types', files: ['a.ts'], validation: ['npm test'], skills: ['plugin:skill'] }]
    }), workers)
    expect(result).toEqual({ kind: 'refused', reason: 'L1: skills must be valid skill names.' })
  })

  it('allows AGY to receive a vendor-neutral Console Hub skill packet', () => {
    const result = parseMissionDraft('m1', draft({
      lanes: [{ id: 'L1', workerLabel: 'T1', agent: { vendor: 'agy' }, task: 'preview', files: ['a.ts'], validation: ['npm test'], skills: ['ui-preview'] }],
      unusedWorkers: []
    }), { T1: { vendor: 'agy' } })
    expect(result.kind).toBe('held')
  })

  it('refuses a reinforcement lane with no chosen vendor', () => {
    const result = parseMissionDraft('m1', draft({
      lanes: [{ id: 'L1', workerLabel: 'T3', task: 'types', files: ['a.ts'], validation: ['npm test'], reinforcement: true }]
    }), workers)
    expect(result).toEqual({ kind: 'refused', reason: 'T3\'s reinforcement lane needs a chosen vendor.' })
  })

  it('refuses a reinforcement lane without an explicit model before plan review', () => {
    const result = parseMissionDraft('m1', draft({
      lanes: [{ id: 'L1', workerLabel: 'T3', agent: { vendor: 'agy' }, task: 'types', files: ['a.ts'], validation: ['npm test'], reinforcement: true }]
    }), workers)
    expect(result).toEqual({ kind: 'refused', reason: 'T3\'s reinforcement lane needs an explicit model.' })
  })

  it('delegates lane-count and contract invariants to createMissionState', () => {
    const result = parseMissionDraft('m1', draft({ acceptanceCriteria: [] }), workers)
    expect(result.kind).toBe('refused')
    if (result.kind === 'refused') expect(result.reason).toMatch(/acceptance/)
  })
})
