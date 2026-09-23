import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConsoleAgent, ConsoleInfo, ConsoleSpec } from '../../../../shared/consoles'
import { MissionController } from './missionController'
import { MissionTerminals, type MissionTerminalPorts } from './missionTerminals'
import { MissionStore } from './missionStore'

const workers: Record<string, ConsoleAgent | undefined> = { T1: { vendor: 'codex', model: 'gpt-5.6-terra' } }
const draft = (overrides: Partial<Record<string, unknown>> = {}): string => JSON.stringify({
  version: 1, title: 'Build it', workspace: 'C:\\repo', acceptanceCriteria: ['works'], unusedWorkers: [],
  lanes: [{ id: 'L1', workerLabel: 'T1', agent: { vendor: 'codex', model: 'gpt-5.6-terra' }, task: 'types', files: ['a.ts'], validation: ['npm test'] }],
  ...overrides
})

const folders: string[] = []
afterEach(async () => { for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true }) })

async function setup(routePreflight?: (agents: readonly ConsoleAgent[]) => string | undefined) {
  const folder = await mkdtemp(join(tmpdir(), 'consoleHub-mission-controller-')); folders.push(folder)
  const store = new MissionStore(folder)
  let seq = 0
  const terminalPorts: MissionTerminalPorts = {
    restart: async (id: string, spec: ConsoleSpec) => ({ id, shell: spec.shell ?? 'default', cwd: spec.cwd ?? '', pid: ++seq, startedAt: 0, ...(spec.agent ? { agent: spec.agent } : {}) }) satisfies ConsoleInfo,
    run: vi.fn(() => new Promise<never>(() => {})),
    output: () => {},
    loadSkill: async (name) => ({ sourceDirectory: `C:\\skills\\${name}`, instructions: `# ${name}` }),
    close: () => true,
    workspace: {
      freeze: vi.fn(async () => 'snapshot-sha'), createLane: vi.fn(async () => {}), removeLane: vi.fn(async () => {}),
      captureLane: vi.fn(async (_worktree, _snapshot, storage) => {
        await mkdir(storage, { recursive: true })
        await writeFile(join(storage, 'changes.patch'), 'recovery patch')
        return { diffPath: join(storage, 'changes.patch'), validationPath: join(storage, 'validation.txt'), changedFiles: ['a.ts'] }
      }),
      integrate: vi.fn(async (_workspace, _snapshot, _path, _patches, storage) => ({ diffPath: join(storage, 'integration.patch'), validationPath: join(storage, 'validation.txt'), changedFiles: ['a.ts'] })),
      apply: vi.fn(async () => ({ changed: false }))
    }
  }
  const terminals = new MissionTerminals(terminalPorts, (id) => join(folder, id))
  const controller = new MissionController({ store, terminals, routePreflight, freshId: () => 'm1' })
  return { controller, store, terminalPorts, folder }
}

describe('MissionController', () => {
  it('holds the plan before creating worktrees when a controlled route is paid or unknown', async () => {
    const { controller, terminalPorts } = await setup(() => 'Pi account route is not included')
    await controller.hold(draft(), workers)
    expect(await controller.runPlan('C:\\repo', { T1: { consoleId: 'console-original', cwd: 'C:\\repo' } })).toEqual({ error: 'Pi account route is not included' })
    expect(controller.current()?.phase).toBe('held')
    expect(terminalPorts.workspace.freeze).not.toHaveBeenCalled()
  })
  it('restores an interrupted Mission and can reject its retained worktrees after restart', async () => {
    const { controller, store, terminalPorts, folder } = await setup()
    await controller.hold(draft(), workers)
    await controller.runPlan('C:\\repo', { T1: { consoleId: 'console-original', cwd: 'C:\\repo' } })
    const restoredTerminals = new MissionTerminals(terminalPorts, (id) => join(folder, id))
    const restoredController = new MissionController({ store, terminals: restoredTerminals, freshId: () => 'm2' })

    await restoredController.restore()

    expect(restoredController.current()).toMatchObject({ phase: 'interrupted', lanes: [{ phase: 'stopped' }] })
    expect(await restoredController.reject('C:\\repo')).toEqual({})
    expect(terminalPorts.workspace.removeLane).toHaveBeenCalledWith('C:\\repo', expect.stringContaining('lanes\\L1'))
    expect((await store.load('m1'))?.worktrees?.[0]).toMatchObject({ status: 'deleted' })
  })

  it('retains worktrees and records cleanup failure if recovery evidence cannot be saved', async () => {
    const { controller, store, terminalPorts } = await setup()
    await controller.hold(draft(), workers)
    await controller.runPlan('C:\\repo', { T1: { consoleId: 'console-original', cwd: 'C:\\repo' } })
    await controller.stop()
    vi.mocked(terminalPorts.workspace.captureLane).mockRejectedValue(new Error('Disk full'))
    expect(await controller.reject('C:\\repo')).toMatchObject({ error: expect.stringContaining('Disk full') })
    expect(terminalPorts.workspace.removeLane).not.toHaveBeenCalled()
    expect((await store.load('m1'))?.worktrees?.[0]).toMatchObject({ status: 'cleanup_failed', error: 'Disk full' })
  })

  it('writes the recoverable plan record before removing a worktree', async () => {
    const { controller, store, terminalPorts } = await setup()
    await controller.hold(draft(), workers)
    await controller.runPlan('C:\\repo', { T1: { consoleId: 'console-original', cwd: 'C:\\repo' } })
    await controller.stop()
    vi.mocked(terminalPorts.workspace.removeLane).mockImplementation(async () => {
      const saved = await store.load('m1')
      expect(saved?.phase).toBe('rejected')
      expect(saved?.worktrees?.[0]).toMatchObject({ status: 'deleting', evidencePath: expect.stringContaining('changes.patch') })
    })
    expect(await controller.reject('C:\\different-repo')).toEqual({})
    expect(terminalPorts.workspace.removeLane).toHaveBeenCalledWith('C:\\repo', expect.any(String))
  })
  it('holds a drafted plan, persists it, and refuses a second draft while it is in flight', async () => {
    const { controller, store } = await setup()
    const held = await controller.hold(draft(), workers)
    expect(held.kind).toBe('held')
    expect(controller.current()?.phase).toBe('held')
    expect((await store.load('m1'))?.phase).toBe('held')

    const second = await controller.hold(draft(), workers)
    expect(second).toEqual({ kind: 'refused', reason: 'Finish, stop, or reject the current Mission before drafting another.' })
  })

  it('runs the plan by relaunching lanes and dispatching ready ones', async () => {
    const { controller, store } = await setup()
    await controller.hold(draft(), workers)
    const result = await controller.runPlan('C:\\repo', { T1: { consoleId: 'console-original', cwd: 'C:\\repo', agent: { vendor: 'codex' } } })
    expect(result).toEqual({})
    expect(controller.current()?.phase).toBe('running')
    expect(controller.current()?.lanes[0]?.phase).toBe('running')
    expect((await store.load('m1'))?.snapshotPath).toBe('snapshot-sha')
  })

  it('refuses to run a plan that has already been released', async () => {
    const { controller } = await setup()
    await controller.hold(draft(), workers)
    await controller.runPlan('C:\\repo', { T1: { consoleId: 'console-original', cwd: 'C:\\repo', agent: { vendor: 'codex' } } })
    const second = await controller.runPlan('C:\\repo', {})
    expect(second).toEqual({ error: 'Only a held Mission can be released.' })
  })

  it('records the final lane and starts integration review automatically', async () => {
    const { controller, store, terminalPorts } = await setup()
    await controller.hold(draft(), workers)
    await controller.runPlan('C:\\repo', { T1: { consoleId: 'console-original', cwd: 'C:\\repo', agent: { vendor: 'codex' } } })
    await controller.recordLane('L1', { attempt: 1, vendorCompleted: true, resultPath: 'r', diffPath: 'd', validationPath: 'v', changedFiles: ['a.ts'] })
    expect(controller.current()?.phase).toBe('ready_apply')
    expect((await store.load('m1'))?.phase).toBe('ready_apply')
    expect(terminalPorts.workspace.integrate).toHaveBeenCalled()
    expect(terminalPorts.run).toHaveBeenCalled()
  })

  it('aborts active controlled workers synchronously during app shutdown', async () => {
    const { controller, terminalPorts } = await setup()
    await controller.hold(draft(), workers)
    await controller.runPlan('C:\\repo', { T1: { consoleId: 'console-original', cwd: 'C:\\repo', agent: { vendor: 'codex' } } })

    controller.abort()

    expect(vi.mocked(terminalPorts.run).mock.calls[0]?.[0].signal?.aborted).toBe(true)
  })

  it('reports a failed automatic review as an actionable integration failure', async () => {
    const { controller, store, terminalPorts } = await setup()
    vi.mocked(terminalPorts.workspace.integrate).mockResolvedValue({
      diffPath: 'integration.patch', validationPath: 'validation.txt', changedFiles: ['a.ts'], error: 'combined validation failed'
    })
    await controller.hold(draft(), workers)
    await controller.runPlan('C:\\repo', { T1: { consoleId: 'console-original', cwd: 'C:\\repo', agent: { vendor: 'codex' } } })

    await controller.recordLane('L1', { attempt: 1, vendorCompleted: true, resultPath: 'r', diffPath: 'd', validationPath: 'v', changedFiles: ['a.ts'] })

    expect(controller.current()).toMatchObject({ phase: 'integration_failed', error: 'combined validation failed', correctionRounds: 1 })
    expect((await store.load('m1'))?.phase).toBe('integration_failed')
  })

  it('collects a completed worker result and advances the Mission automatically', async () => {
    const { controller, store } = await setup()
    await controller.hold(draft(), workers)
    await controller.runPlan('C:\\repo', { T1: { consoleId: 'console-original', cwd: 'C:\\repo', agent: { vendor: 'codex' } } })
    const resultPath = join(folders.at(-1)!, 'm1', 'evidence', 'L1', 'attempt-1', 'result.json')
    await mkdir(join(resultPath, '..'), { recursive: true })
    await writeFile(resultPath, JSON.stringify({
      summary: 'Implemented it', tests: 'npm test', artifacts: ['http://localhost:58214/'],
      decisions: ['Use restrained motion'], unresolved: ['Exact spring strength']
    }))

    await controller.tick()

    expect(controller.current()?.phase).toBe('ready_apply')
    expect((await store.load('m1'))?.lanes[0]?.evidence[0]).toMatchObject({
      vendorCompleted: true, changedFiles: ['a.ts'], summary: 'Implemented it',
      artifacts: ['http://localhost:58214/'], decisions: ['Use restrained motion'], unresolved: ['Exact spring strength']
    })
  })

  it('passes selected dependency evidence into a newly unblocked writer', async () => {
    const { controller, terminalPorts } = await setup()
    const agents = {
      T1: { vendor: 'codex' as const, model: 'gpt-5.6-terra' },
      T2: { vendor: 'claude' as const, model: 'claude-sonnet-4-6' }
    }
    await controller.hold(draft({ lanes: [
      { id: 'research', workerLabel: 'T1', agent: agents.T1, task: 'inspect', files: [], validation: [], reviewOnly: true },
      { id: 'write', workerLabel: 'T2', agent: agents.T2, task: 'implement', files: ['a.ts'], validation: ['npm test'], dependsOn: ['research'] }
    ] }), agents)
    await controller.runPlan('C:\\repo', {
      T1: { consoleId: 'console-one', cwd: 'C:\\repo', agent: agents.T1 },
      T2: { consoleId: 'console-two', cwd: 'C:\\repo', agent: agents.T2 }
    })

    await controller.recordLane('research', {
      attempt: 1,
      vendorCompleted: true,
      resultPath: 'result.json',
      diffPath: 'changes.patch',
      validationPath: 'validation.txt',
      changedFiles: [],
      summary: 'The stable API is available.',
      artifacts: ['notes/api.md'],
      decisions: ['Use the stable endpoint.'],
      unresolved: []
    })

    const writerPrompt = vi.mocked(terminalPorts.run).mock.calls[1]?.[0].prompt
    expect(writerPrompt).toContain('Selected evidence from completed dependency lanes')
    expect(writerPrompt).toContain('The stable API is available.')
    expect(writerPrompt).toContain('notes/api.md')
  })

  it('integrates a returned lane and applies it only while the destination still matches', async () => {
    const { controller, store, terminalPorts } = await setup()
    await controller.hold(draft(), workers)
    await controller.runPlan('C:\\repo', { T1: { consoleId: 'console-original', cwd: 'C:\\repo', agent: { vendor: 'codex' } } })
    await controller.recordLane('L1', { attempt: 1, vendorCompleted: true, resultPath: 'r', diffPath: 'd', validationPath: 'v', changedFiles: ['a.ts'] })
    expect(controller.current()?.phase).toBe('ready_apply')
    expect(await controller.apply('C:\\repo')).toEqual({})
    expect(controller.current()?.phase).toBe('applied')
    expect((await store.load('m1'))?.phase).toBe('applied')
    expect(terminalPorts.workspace.apply).toHaveBeenCalled()
  })

  it('reconciles destination drift, revalidates, and requires a second Apply confirmation', async () => {
    const { controller, terminalPorts } = await setup()
    await controller.hold(draft(), workers)
    await controller.runPlan('C:\\repo', { T1: { consoleId: 'console-original', cwd: 'C:\\repo', agent: { vendor: 'codex' } } })
    await controller.recordLane('L1', { attempt: 1, vendorCompleted: true, resultPath: 'r', diffPath: 'd', validationPath: 'v', changedFiles: ['a.ts'] })
    vi.mocked(terminalPorts.workspace.freeze).mockResolvedValueOnce('reconciled-snapshot')
    vi.mocked(terminalPorts.workspace.apply).mockResolvedValueOnce({ changed: true }).mockResolvedValueOnce({ changed: false })

    const first = await controller.apply('C:\\repo')

    expect(first).toMatchObject({ destinationChanged: true, error: expect.stringContaining('apply it again') })
    expect(controller.current()).toMatchObject({ phase: 'ready_apply', snapshotPath: 'reconciled-snapshot', destinationChanged: true })
    expect(terminalPorts.workspace.integrate).toHaveBeenCalledTimes(2)
    expect(await controller.apply('C:\\repo')).toEqual({})
    expect(controller.current()?.phase).toBe('applied')
  })

  it('persists a reconciliation worktree when rebuilding the result throws', async () => {
    const { controller, store, terminalPorts } = await setup()
    await controller.hold(draft(), workers)
    await controller.runPlan('C:\\repo', { T1: { consoleId: 'console-original', cwd: 'C:\\repo', agent: { vendor: 'codex' } } })
    await controller.recordLane('L1', { attempt: 1, vendorCompleted: true, resultPath: 'r', diffPath: 'd', validationPath: 'v', changedFiles: ['a.ts'] })
    vi.mocked(terminalPorts.workspace.apply).mockResolvedValueOnce({ changed: true })
    vi.mocked(terminalPorts.workspace.integrate).mockRejectedValueOnce(new Error('patch conflict'))

    const result = await controller.apply('C:\\repo')

    expect(result.error).toContain('patch conflict')
    expect(controller.current()).toMatchObject({ phase: 'integration_failed', worktrees: expect.arrayContaining([
      expect.objectContaining({ laneId: 'reconciliation-1', status: 'retained' })
    ]) })
    expect((await store.load('m1'))?.worktrees).toEqual(expect.arrayContaining([
      expect.objectContaining({ laneId: 'reconciliation-1', status: 'retained' })
    ]))
  })

  it('retains stopped worktrees and deletes only after explicit rejection', async () => {
    const { controller, terminalPorts } = await setup()
    const closed: string[] = []
    ;(terminalPorts as { close: (id: string) => boolean }).close = (id) => { closed.push(id); return true }
    await controller.hold(draft(), workers)
    await controller.runPlan('C:\\repo', { T1: { consoleId: 'console-original', cwd: 'C:\\repo', agent: { vendor: 'codex' } } })
    await controller.stop()
    expect(controller.current()?.phase).toBe('stopped')
    await expect(controller.cleanup('C:\\repo')).rejects.toThrow('applied or rejected')
    expect(terminalPorts.workspace.removeLane).not.toHaveBeenCalled()
    expect(await controller.reject('C:\\repo')).toEqual({})
    expect(controller.current()?.worktrees?.[0]?.status).toBe('deleted')
    expect(closed).toEqual([])
    expect(terminalPorts.workspace.removeLane).toHaveBeenCalledWith('C:\\repo', join(folders.at(-1)!, 'm1', 'lanes', 'L1'))
  })
})
