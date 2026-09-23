import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TerminalOrchestrator } from './terminalOrchestrator'
import type { ConsoleRunState } from '../../../../shared/console-run'
import type { MissionState } from '../../../../shared/mission'

const folders: string[] = []
afterEach(async () => { for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true }) })

async function setup(run?: ConsoleRunState) {
  const folder = await mkdtemp(join(tmpdir(), 'consoleHub-orchestrator-'))
  folders.push(folder)
  const write = vi.fn((_id: string, _text: string) => true)
  const release = vi.fn(() => ({ kind: 'released' as const, assignments: [] }))
  const collect = vi.fn(async () => { if (run) run.collected = true; return {} })
  const bridge = new TerminalOrchestrator({ root: () => folder, write, alive: () => true,
    describe: () => ['T1: already launched claude'], release, run: () => run, collect })
  await bridge.attach('orchestrator')
  return { bridge, write, release, collect }
}

function fakeMission() {
  let state: MissionState | undefined
  const hold = vi.fn(async (text: string) => {
    const plan = JSON.parse(text)
    state = { id: 'm1', phase: 'held', plan, createdAt: 0, correctionRounds: 0, destinationChanged: false,
      lanes: plan.lanes.map((lane: MissionState['plan']['lanes'][number]) => ({ ...lane, phase: 'held', attempt: 0, evidence: [] })) }
    return { kind: 'held' as const, state }
  })
  const runPlan = vi.fn(async () => { if (state) state.phase = 'running'; return {} })
  return {
    current: () => state, hold, runPlan, retry: vi.fn(), recordLane: vi.fn(), stop: vi.fn(), cleanup: vi.fn(),
    review: vi.fn(async () => ({})), apply: vi.fn(async () => ({})), reject: vi.fn(async () => { if (state) state.phase = 'rejected'; return {} })
  }
}

const missionPlan = JSON.stringify({
  version: 1, title: 'Build it', workspace: 'C:\\repo', acceptanceCriteria: ['works'], unusedWorkers: [],
  lanes: [{ id: 'L1', workerLabel: 'T1', agent: { vendor: 'claude' }, task: 'types', files: ['a.ts'], validation: ['npm test'] }]
})

describe('terminal Orchestrator', () => {
  it('shows the second confirmation after destination reconciliation returns to ready_apply', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'consoleHub-reconciliation-status-')); folders.push(folder)
    const mission = fakeMission()
    await mission.hold(missionPlan)
    const state = mission.current()!
    state.phase = 'ready_apply'
    const bridge = new TerminalOrchestrator({ root: () => folder, write: () => true, alive: () => true,
      describe: () => [], release: () => ({ kind: 'released' as const, assignments: [] }), run: () => undefined,
      collect: async () => ({}), mission, workspace: () => 'C:\\repo' })
    await bridge.attach('orchestrator')
    await bridge.tick()
    state.destinationChanged = true
    state.error = 'Destination changed. The reconciled result passed validation; review it and say apply it again to confirm.'
    await bridge.tick()
    expect(bridge.current().updates.at(-1)).toContain('apply it again')
  })
  it('requires a task when /delegate is invoked', async () => {
    const s = await setup()
    const folder = await s.bridge.prepareClaudeContext()
    await s.bridge.attach('scoped', folder)

    expect(await s.bridge.send('/delegate', { T1: 'c1' })).toEqual({ error: 'Give /delegate a task for the open workers.' })
    expect(s.write).not.toHaveBeenCalled()
  })
  it('automatically dispatches a saved plan after /delegate is invoked', async () => {
    const s = await setup()
    await s.bridge.send('/delegate Compare the modules', { T1: 'c1' })
    const prompt = s.write.mock.calls.at(-1)![1]
    expect(prompt).toContain('User request:\nCompare the modules')
    expect(prompt).toContain('Console Hub will release')
    await writeFile(s.bridge.planPath!, '### T1\nCompare the modules')
    s.bridge.turnComplete()
    await s.bridge.tick()
    expect(s.release).toHaveBeenCalledWith('### T1\nCompare the modules', { T1: 'c1' })
    expect(s.bridge.current().plan).toBeUndefined()
  })
  it('does not invoke /delegate while a Mission is unresolved', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'consoleHub-delegate-mission-')); folders.push(folder)
    const mission = fakeMission()
    await mission.hold(missionPlan)
    const write = vi.fn(() => true)
    const bridge = new TerminalOrchestrator({ root: () => folder, write, alive: () => true,
      describe: () => ['T1: already launched claude'], release: () => ({ kind: 'released' as const, assignments: [] }),
      run: () => undefined, collect: async () => ({}), mission })
    await bridge.attach('orchestrator')
    expect((await bridge.send('/delegate Inspect the repo', { T1: 'c1' })).error).toContain('Mission')
    expect(write).not.toHaveBeenCalled()
  })
  it('drafts a reviewable Console delegation for the signed-in worker terminals', async () => {
    const s = await setup()
    const context = await s.bridge.prepareClaudeContext()
    await s.bridge.attach('scoped', context)
    await s.bridge.send('Compare the two modules and report findings', { T1: 'c1' })
    const prompt = s.write.mock.calls.at(-1)![1]
    expect(prompt).toContain('### T1')
    expect(prompt).toContain('Save the delegation to this exact plan file:')
    expect(prompt).toContain('Do not release the plan yourself')
    await writeFile(s.bridge.planPath!, '### T1\nInspect the first module')
    s.bridge.turnComplete()
    await s.bridge.tick()
    expect(s.bridge.current().plan).toBe('### T1\nInspect the first module')
    expect(s.release).not.toHaveBeenCalled()
    expect(await s.bridge.release()).toEqual({})
    expect(s.release).toHaveBeenCalledWith('### T1\nInspect the first module', { T1: 'c1' })
  })
  it('does not replace an unresolved Mission or submit a task to a busy worker', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'consoleHub-delegate-gate-')); folders.push(folder)
    const mission = fakeMission()
    await mission.hold(missionPlan)
    const write = vi.fn(() => true)
    const bridge = new TerminalOrchestrator({ root: () => folder, write, alive: () => true,
      describe: () => ['T1: already launched claude'], release: () => ({ kind: 'released' as const, assignments: [] }),
      run: () => undefined, collect: async () => ({}), mission,
      sessions: () => ({ T1: { consoleId: 'c1', cwd: 'C:\\repo', agent: { vendor: 'claude' }, observedState: 'running' } }),
      workspace: () => 'C:\\repo' })
    await bridge.attach('orchestrator')
    expect((await bridge.send('Inspect the repo', { T1: 'c1' })).error).toContain('Mission')
    expect(write).not.toHaveBeenCalled()
    await mission.reject()
    expect((await bridge.send('Inspect the repo', { T1: 'c1' })).error).toContain('running')
    expect(write).not.toHaveBeenCalled()
  })
  it('rechecks worker readiness when a saved delegation is released', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'consoleHub-delegate-release-')); folders.push(folder)
    let observedState: 'available' | 'running' = 'available'
    const release = vi.fn(() => ({ kind: 'released' as const, assignments: [] }))
    const bridge = new TerminalOrchestrator({ root: () => folder, write: () => true, alive: () => true,
      describe: () => ['T1: already launched codex'], release, run: () => undefined, collect: async () => ({}),
      sessions: () => ({ T1: { consoleId: 'c1', cwd: 'C:\\repo', agent: { vendor: 'codex' }, observedState } }) })
    await bridge.attach('orchestrator')
    await bridge.send('Inspect the repo', { T1: 'c1' })
    await writeFile(bridge.planPath!, '### T1\nInspect the repo')
    bridge.turnComplete()
    await bridge.tick()
    observedState = 'running'
    expect((await bridge.release()).error).toContain('running')
    expect(release).not.toHaveBeenCalled()
  })
  it('installs and serves a scoped native /mission skill for the Claude Orchestrator', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'consoleHub-orchestrator-native-mission-')); folders.push(folder)
    const mission = fakeMission()
    const bridge = new TerminalOrchestrator({
      root: () => folder, write: () => true, alive: () => true,
      describe: () => ['T1: already launched claude'],
      release: () => ({ kind: 'released' as const, assignments: [] }), run: () => undefined, collect: async () => ({}),
      mission, sessions: () => ({ T1: { consoleId: 'c1', cwd: 'C:\\repo', agent: { vendor: 'claude' } } }),
      workspace: () => 'C:\\repo'
    })
    const context = await bridge.prepareClaudeContext()
    expect(await readFile(join(context, '.claude/skills/mission/SKILL.md'), 'utf8')).toContain('name: mission')
    await bridge.attach('orchestrator', context)
    bridge.setTargets({ T1: 'c1' })
    await writeFile(join(context, 'mission-request.txt'), 'mission-request-1')
    await bridge.tick()
    const response = JSON.parse(await readFile(join(context, 'mission-response.json'), 'utf8'))
    expect(response.workers).toEqual(['T1: already launched claude'])
    expect(response.planPath).toContain('-mission-plan.json')
    await writeFile(response.planPath, missionPlan)
    await writeFile(response.readyPath, 'ready')
    bridge.turnComplete()
    await bridge.tick()
    expect(mission.hold).toHaveBeenCalledWith(missionPlan, { T1: { vendor: 'claude' } })
  })
  it('keeps a held Mission from being replaced by a native delegation draft', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'consoleHub-orchestrator-protocol-')); folders.push(folder)
    const mission = fakeMission()
    const release = vi.fn(() => ({ kind: 'released' as const, assignments: [] }))
    const bridge = new TerminalOrchestrator({
      root: () => folder, write: () => true, alive: () => true,
      describe: () => ['T1: already launched claude'], release, run: () => undefined, collect: async () => ({}),
      mission, sessions: () => ({ T1: { consoleId: 'c1', cwd: 'C:\\repo', agent: { vendor: 'claude' } } }),
      workspace: () => 'C:\\repo'
    })
    const context = await bridge.prepareClaudeContext()
    await bridge.attach('orchestrator', context)
    bridge.setTargets({ T1: 'c1' })
    await writeFile(join(context, 'mission-request.txt'), 'mission-request-1')
    await bridge.tick()
    const missionResponse = JSON.parse(await readFile(join(context, 'mission-response.json'), 'utf8'))
    await writeFile(missionResponse.planPath, missionPlan)
    await writeFile(missionResponse.readyPath, 'ready')
    await bridge.tick()

    await writeFile(join(context, 'delegate-request.txt'), 'delegate-request-1')
    await bridge.tick()
    const delegateResponse = JSON.parse(await readFile(join(context, 'delegate-response.json'), 'utf8'))

    expect(delegateResponse.error).toBe('Finish or reject the current Mission before delegating.')
    expect(bridge.planPath).toBe(missionResponse.planPath)
  })
  it('returns to the markdown parser when delegating after a refused Mission draft', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'consoleHub-orchestrator-protocol-')); folders.push(folder)
    const release = vi.fn(() => ({ kind: 'released' as const, assignments: [] }))
    const mission = {
      current: () => undefined,
      hold: vi.fn(async () => ({ kind: 'refused' as const, reason: 'Mission plan must be valid JSON.' })),
      runPlan: vi.fn(), retry: vi.fn(), recordLane: vi.fn(), stop: vi.fn(), cleanup: vi.fn(),
      review: vi.fn(), apply: vi.fn(), reject: vi.fn()
    }
    const bridge = new TerminalOrchestrator({
      root: () => folder, write: () => true, alive: () => true,
      describe: () => ['T1: already launched claude'], release, run: () => undefined, collect: async () => ({}),
      mission, sessions: () => ({ T1: { consoleId: 'c1', cwd: 'C:\\repo', agent: { vendor: 'claude' } } }),
      workspace: () => 'C:\\repo'
    })
    const context = await bridge.prepareClaudeContext()
    await bridge.attach('orchestrator', context)
    bridge.setTargets({ T1: 'c1' })
    await writeFile(join(context, 'mission-request.txt'), 'mission-request-1')
    await bridge.tick()
    const missionResponse = JSON.parse(await readFile(join(context, 'mission-response.json'), 'utf8'))
    await writeFile(missionResponse.planPath, 'not json')
    await writeFile(missionResponse.readyPath, 'ready')
    await bridge.tick()

    await writeFile(join(context, 'delegate-request.txt'), 'delegate-request-1')
    await bridge.tick()
    const delegateResponse = JSON.parse(await readFile(join(context, 'delegate-response.json'), 'utf8'))
    await writeFile(delegateResponse.planPath, '### T1\nResearch')
    await writeFile(delegateResponse.readyPath, 'ready')
    await bridge.tick()

    expect(bridge.current().plan).toBe('### T1\nResearch')
    await bridge.release()
    expect(release).toHaveBeenCalledWith('### T1\nResearch', { T1: 'c1' })
  })
  it('refuses a native delegation without workers', async () => {
    const s = await setup()
    const folder = await s.bridge.prepareClaudeContext()
    await s.bridge.attach('scoped', folder)
    await writeFile(join(folder, 'delegate-request.txt'), 'empty')
    await s.bridge.tick()
    expect(JSON.parse(await readFile(join(folder, 'delegate-response.json'), 'utf8')).error).toContain('worker')
    expect(s.bridge.planPath).toBeUndefined()
  })
  it('resumes handoffs after a submitted native turn finishes, but not while typing', async () => {
    const s = await setup()
    s.bridge.pause(true)
    s.bridge.turnComplete()
    expect(s.bridge.canDeliver()).toBe(true)
    s.bridge.pause(true)
    s.bridge.pause(false)
    s.bridge.turnComplete()
    expect(s.bridge.canDeliver()).toBe(false)
  })
  it('writes standing instructions into a unique scoped CLAUDE.md and omits them from prompts', async () => {
    const s = await setup()
    const folder = await s.bridge.prepareClaudeContext()
    const other = await s.bridge.prepareClaudeContext()
    expect(other).not.toBe(folder)
    expect(await readFile(join(folder, 'CLAUDE.md'), 'utf8')).toContain('You are the Orchestrator')
    await s.bridge.attach('scoped-orchestrator', folder)
    await s.bridge.attach('scoped-orchestrator')
    await s.bridge.send('Prepare a delegation', { T1: 'c1' })
    const prompt = s.write.mock.calls.at(-1)![1]
    expect(prompt).not.toContain('You are the Orchestrator')
    expect(prompt).not.toContain('When asked to delegate')
    expect(prompt).toContain('Plan file:')
    expect(prompt).toContain('T1: already launched claude')
  })
  it('automatically collects once when ready, but holds failed runs', async () => {
    const run: ConsoleRunState = { id: 'r1', phase: 'complete', assignments: [], collected: false }
    const s = await setup(run)
    await s.bridge.send('Check progress', { T1: 'c1' })
    await s.bridge.tick()
    expect(s.collect).not.toHaveBeenCalled()
    s.bridge.turnComplete()
    await s.bridge.tick()
    await s.bridge.tick()
    expect(s.collect).toHaveBeenCalledTimes(1)
    run.phase = 'failed'
    run.collected = false
    await s.bridge.tick()
    expect(s.collect).toHaveBeenCalledTimes(1)
  })
  it('routes native slash commands directly and never sends drafts through a model harness', async () => {
    const s = await setup()
    await s.bridge.send('/help', { T1: 'c1' })
    expect(s.write).toHaveBeenLastCalledWith('orchestrator', '/help\r')
    expect(s.release).not.toHaveBeenCalled()
  })
  it('releases a saved plan once, and refuses a stale plan after another prompt', async () => {
    const s = await setup()
    await s.bridge.send('Research', { T1: 'c1' })
    await writeFile(s.bridge.planPath!, '### T1\nResearch')
    s.bridge.turnComplete()
    await s.bridge.tick()
    await Promise.all([s.bridge.release(), s.bridge.release()])
    expect(s.release).toHaveBeenCalledTimes(1)
    await s.bridge.send('New question', { T1: 'c1' })
    expect((await s.bridge.release()).error).toBeTruthy()
  })
  it('refuses /mission when no Mission is wired up', async () => {
    const s = await setup()
    expect(await s.bridge.send('/mission', { T1: 'c1' })).toEqual({ error: 'Mission is not available in this Orchestrator.' })
    expect(s.write).not.toHaveBeenCalled()
  })
  it('pastes vendor-neutral Mission instructions, holds the drafted plan, and releases it on "go"', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'consoleHub-orchestrator-mission-')); folders.push(folder)
    const mission = fakeMission()
    const write = vi.fn((_id: string, _text: string) => true)
    const bridge = new TerminalOrchestrator({
      root: () => folder, write, alive: () => true, describe: () => ['T1: already launched claude'],
      release: () => ({ kind: 'released' as const, assignments: [] }), run: () => undefined, collect: async () => ({}),
      mission, sessions: () => ({ T1: { consoleId: 'c1', cwd: 'C:\\repo', agent: { vendor: 'claude' } } }),
      workspace: () => 'C:\\repo'
    })
    await bridge.attach('orchestrator')
    await bridge.send('/mission build the thing', { T1: 'c1' })
    const pasted = write.mock.calls.at(-1)![1]
    expect(pasted).toContain('draft a Mission plan as JSON')
    expect(pasted).toContain('Additional user direction:\nbuild the thing')
    expect(mission.hold).not.toHaveBeenCalled()

    await writeFile(bridge.planPath!, missionPlan)
    bridge.turnComplete()
    await bridge.tick()
    expect(mission.hold).toHaveBeenCalledWith(missionPlan, { T1: { vendor: 'claude' } })
    expect(bridge.current().updates.at(-1)).toContain('Mission held: "Build it"')
    expect((bridge.current() as ReturnType<typeof bridge.current> & { mission?: MissionState }).mission).toMatchObject({
      phase: 'held',
      plan: { title: 'Build it' }
    })

    const result = await bridge.release()
    expect(result).toEqual({})
    expect(mission.runPlan).toHaveBeenCalledWith('C:\\repo', { T1: { consoleId: 'c1', cwd: 'C:\\repo', agent: { vendor: 'claude' } } })
    expect(bridge.current().updates.at(-1)).toContain('Mission plan released')
  })
  it('refuses to run a Mission outside the workspace selected in Console Hub', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'consoleHub-orchestrator-workspace-')); folders.push(folder)
    const mission = fakeMission()
    const bridge = new TerminalOrchestrator({
      root: () => folder, write: () => true, alive: () => true, describe: () => ['T1: already launched claude'],
      release: () => ({ kind: 'released' as const, assignments: [] }), run: () => undefined, collect: async () => ({}),
      mission, sessions: () => ({ T1: { consoleId: 'c1', cwd: 'C:\\repo', agent: { vendor: 'claude' } } }),
      workspace: () => 'C:\\vault'
    })
    await bridge.attach('orchestrator')
    await mission.hold(missionPlan)

    expect(await bridge.send('/mission run', { T1: 'c1' })).toEqual({
      error: 'Mission workspace "C:\\repo" does not match the workspace selected in Console Hub: "C:\\vault".'
    })
    expect(mission.runPlan).not.toHaveBeenCalled()
  })
  it('refuses to run plan when no Mission is held', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'consoleHub-orchestrator-mission-')); folders.push(folder)
    const mission = fakeMission()
    const write = vi.fn((_id: string, _text: string) => true)
    const bridge = new TerminalOrchestrator({
      root: () => folder, write, alive: () => true, describe: () => ['T1: already launched claude'],
      release: () => ({ kind: 'released' as const, assignments: [] }), run: () => undefined, collect: async () => ({}),
      mission, sessions: () => ({}), workspace: () => 'C:\\repo'
    })
    await bridge.attach('orchestrator')
    await bridge.send('/mission', { T1: 'c1' })
    bridge.turnComplete()
    expect(await bridge.release()).toEqual({ error: 'No held Mission plan to release.' })
  })
  it('waits instead of drafting against workers with observed active turns', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'consoleHub-orchestrator-busy-crew-')); folders.push(folder)
    const write = vi.fn((_id: string, _text: string) => true)
    const bridge = new TerminalOrchestrator({
      root: () => folder, write, alive: () => true, describe: () => ['T1: running codex'],
      release: () => ({ kind: 'released' as const, assignments: [] }), run: () => undefined, collect: async () => ({}),
      mission: fakeMission(), sessions: () => ({ T1: { consoleId: 'c1', cwd: 'C:\\repo', agent: { vendor: 'codex' }, observedState: 'running' } })
    })
    await bridge.attach('orchestrator')

    expect(await bridge.send('/mission build it', { T1: 'c1' })).toEqual({
      error: 'All existing workers are still running. Wait for one to become available or add a worker.'
    })
    expect(write).not.toHaveBeenCalled()
  })
  it('accepts natural review intent and explicit apply through the Orchestrator terminal', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'consoleHub-orchestrator-mission-')); folders.push(folder)
    const mission = fakeMission()
    const bridge = new TerminalOrchestrator({
      root: () => folder, write: () => true, alive: () => true, describe: () => [],
      release: () => ({ kind: 'released' as const, assignments: [] }), run: () => undefined, collect: async () => ({}),
      mission, workspace: () => 'C:\\repo'
    })
    await bridge.attach('orchestrator')
    await bridge.send('yes review', {})
    await bridge.send('/mission apply', {})
    expect(mission.review).toHaveBeenCalledWith('C:\\repo')
    expect(mission.apply).toHaveBeenCalledWith('C:\\repo')
  })
  it('runs, reports, and stops a Mission through explicit terminal controls', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'consoleHub-orchestrator-mission-controls-')); folders.push(folder)
    const mission = fakeMission()
    const bridge = new TerminalOrchestrator({
      root: () => folder, write: () => true, alive: () => true, describe: () => [],
      release: () => ({ kind: 'released' as const, assignments: [] }), run: () => undefined, collect: async () => ({}),
      mission, sessions: () => ({}), workspace: () => 'C:\\repo'
    })
    await bridge.attach('orchestrator')
    await bridge.send('/mission status', {})
    expect(bridge.current().updates.at(-1)).toBe('No Mission is currently held or running.')
    await bridge.send('/mission stop', {})
    expect(mission.stop).toHaveBeenCalled()
    expect(bridge.current().updates.at(-1)).toBe('Mission stopped.')
  })
  it('reports a failed worker before an explicit retry and preserves the retry boundary', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'consoleHub-orchestrator-mission-failure-')); folders.push(folder)
    const mission = fakeMission()
    const held = await mission.hold(missionPlan)
    if (held.kind !== 'held') throw new Error('expected held Mission')
    held.state.phase = 'blocked'
    held.state.lanes[0]!.phase = 'failed'
    held.state.lanes[0]!.evidence.push({
      attempt: 1,
      vendorCompleted: false,
      summary: 'Controlled worker failed.',
      error: 'Worker exited before returning evidence.'
    })
    const write = vi.fn((_id: string, _text: string) => true)
    const bridge = new TerminalOrchestrator({
      root: () => folder, write, alive: () => true, describe: () => [],
      release: () => ({ kind: 'released' as const, assignments: [] }), run: () => undefined, collect: async () => ({}), mission
    })
    await bridge.attach('orchestrator')

    await bridge.tick()
    expect(bridge.current().updates.at(-1)).toContain('T1 failed: Worker exited before returning evidence.')
    expect(write.mock.calls.some(([, text]) => text.includes('Worker exited before returning evidence.') && text.includes('recommend a recovery'))).toBe(true)
    expect(mission.retry).not.toHaveBeenCalled()

    bridge.turnComplete()
    expect(await bridge.send('/mission retry T1', {})).toEqual({})
    expect(mission.retry).toHaveBeenCalledWith('L1')
  })
  it('returns compact worker decisions and artifacts to the Orchestrator context once', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'consoleHub-orchestrator-mission-context-')); folders.push(folder)
    const plan = JSON.parse(missionPlan) as MissionState['plan']
    const missionState: MissionState = {
      id: 'm1', phase: 'ready_review', plan, createdAt: 0, correctionRounds: 0, destinationChanged: false,
      lanes: [{ ...plan.lanes[0]!, phase: 'returned', attempt: 1, evidence: [{
        attempt: 1, vendorCompleted: true, resultPath: 'result.json', validationPath: 'validation.txt',
        changedFiles: ['a.ts'], summary: 'Preview ready', artifacts: ['http://localhost:58214/'],
        decisions: ['Use tethered motion'], unresolved: ['Spring strength']
      }] }]
    }
    const write = vi.fn((_id: string, _text: string) => true)
    const mission = {
      current: () => missionState, hold: vi.fn(), runPlan: vi.fn(), retry: vi.fn(), recordLane: vi.fn(), stop: vi.fn(), cleanup: vi.fn(),
      review: vi.fn(), apply: vi.fn(), reject: vi.fn()
    }
    const bridge = new TerminalOrchestrator({
      root: () => folder, write, alive: () => true, describe: () => [],
      release: () => ({ kind: 'released' as const, assignments: [] }), run: () => undefined, collect: async () => ({}), mission
    })
    await bridge.attach('orchestrator')
    await bridge.tick()
    await bridge.tick()

    expect(write).toHaveBeenCalledTimes(1)
    expect(write.mock.calls[0]?.[1]).toContain('Preview ready')
    expect(write.mock.calls[0]?.[1]).toContain('http://localhost:58214/')
    expect(write.mock.calls[0]?.[1]).toContain('Use tethered motion')
  })
  it('delivers result contents only when idle and not editing native input', async () => {
    const s = await setup()
    await s.bridge.send('Research', { T1: 'c1' })
    expect(() => s.bridge.deliver('Source: T1\nActual file contents')).toThrow()
    s.bridge.turnComplete()
    s.bridge.pause()
    expect(() => s.bridge.deliver('Source: T1\nActual file contents')).toThrow()
    s.bridge.resume()
    s.bridge.deliver('Source: T1\r\nActual file contents\x1b[201~')
    expect(s.write).toHaveBeenLastCalledWith('orchestrator', expect.stringContaining('Actual file contents'))
    const payload = s.write.mock.calls.at(-1)![1]
    expect(payload.match(/\x1b\[201~/g)).toHaveLength(1)
    expect(payload.match(/\r/g)).toHaveLength(1)
    expect(s.bridge.current().busy).toBe(true)
  })
})
