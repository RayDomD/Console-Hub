import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { MissionPlan } from '../../../../shared/mission'
import { createMissionState, releaseMission } from './missionState'
import { MissionStore } from './missionStore'

const folders: string[] = []
afterEach(async () => { for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true }) })
const plan: MissionPlan = { version: 1, title: 'Test', workspace: 'C:\\repo', acceptanceCriteria: ['green'], unusedWorkers: [], lanes: [
  { id: 'L1', workerLabel: 'T1', agent: { vendor: 'codex' }, task: 'work', files: ['a.ts'], validation: ['npm test'] }
] }

describe('Mission store', () => {
  it('keeps the complete plan and summary after worktree deletion', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'consoleHub-mission-summary-')); folders.push(folder)
    const store = new MissionStore(folder); const state = createMissionState('m1', plan)
    state.phase = 'applied'
    state.snapshotPath = 'snapshot-sha'
    state.worktrees = [{ laneId: 'L1', path: 'C:\\Console Hub\\wt\\m1\\t1', status: 'deleted', evidencePath: 'C:\\records\\changes.patch' }]
    state.lanes[0]!.evidence.push({ attempt: 1, vendorCompleted: true, summary: 'Implemented types', validationPath: 'C:\\records\\validation.txt' })
    await store.save(state)
    const summary = await readFile(join(store.folder('m1'), 'plan.md'), 'utf8')
    expect(summary).toContain('## Summary')
    expect(summary).toContain('snapshot-sha')
    expect(summary).toContain('Implemented types')
    expect(summary).toContain('deleted')
    expect(summary).toContain('changes.patch')
    expect(summary).toContain('validation.txt')
    expect(summary).toContain('"acceptanceCriteria"')
  })
  it('writes atomically and converts an active restored run to interrupted', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'consoleHub-mission-store-')); folders.push(folder)
    const store = new MissionStore(folder); const state = createMissionState('m1', plan)
    releaseMission(state, false, 'snapshot')
    await store.save(state)
    expect(JSON.parse(await readFile(join(store.folder('m1'), 'run.json'), 'utf8')).phase).toBe('running')
    const restored = await store.load('m1')
    expect(restored?.phase).toBe('interrupted')
    expect(restored?.lanes[0]?.phase).toBe('stopped')
  })

  it('allows overlapping durable saves without sharing a temporary filename', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'consoleHub-mission-concurrent-store-')); folders.push(folder)
    const store = new MissionStore(folder)
    const states = Array.from({ length: 20 }, (_, index) => createMissionState('m1', { ...plan, title: `Test ${index}` }, index))

    await expect(Promise.all(states.map((state) => store.save(state)))).resolves.toBeDefined()
    expect(JSON.parse(await readFile(join(store.folder('m1'), 'run.json'), 'utf8')).id).toBe('m1')
  })

  it('restores the newest durable Mission after an app restart', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'consoleHub-mission-latest-')); folders.push(folder)
    const store = new MissionStore(folder)
    const older = createMissionState('older', plan, 100)
    const newest = createMissionState('newest', plan, 200)
    releaseMission(newest, false, 'snapshot')
    await store.save(older)
    await store.save(newest)

    const restored = await store.loadLatest()

    expect(restored?.id).toBe('newest')
    expect(restored?.phase).toBe('interrupted')
    expect(restored?.lanes[0]?.phase).toBe('stopped')
  })
})
