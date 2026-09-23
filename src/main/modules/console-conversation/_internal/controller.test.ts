import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { ConsoleController } from './controller'
import { OrchestratorConversation } from '../../orchestrator-conversation'
import type { HarnessEvent, HarnessRunOptions } from '../../../../shared/harness'
import type { ConsoleEvent, ConsoleInfo } from '../../../../shared/consoles'

const folders: string[] = []
afterEach(async () => { for (const path of folders.splice(0)) await rm(path, { recursive: true, force: true }) })

async function setup(plan = '### T1 — claude\nResearch\n### T2 — agy — waits on T1\nReview', deliver?: (text: string) => void) {
  const folder = await mkdtemp(join(tmpdir(), 'consoleHub-controller-test-'))
  folders.push(folder)
  let emitHarness: (event: HarnessEvent) => void = () => {}
  const started: HarnessRunOptions[] = []
  const events = new Set<(event: ConsoleEvent) => void>()
  const infos: ConsoleInfo[] = [
    { id: 'c1', shell: 'powershell', cwd: folder, pid: 1, startedAt: 0, agent: { vendor: 'claude', model: 'sonnet' } },
    { id: 'c2', shell: 'powershell', cwd: folder, pid: 2, startedAt: 0, agent: { vendor: 'agy' } }
  ]
  const conversation = new OrchestratorConversation({
    harness: { start: (options) => { started.push(options); return { runId: `h${started.length}` } }, cancel: () => true,
      onEvent: (listener) => { emitHarness = listener; return () => {} } },
    settings: () => ({ vendor: 'claude' }), load: () => undefined, save: () => {},
    promptOverride: (entries) => entries.map((item) => 'text' in item ? item.text : '').join('\n')
  })
  const write = vi.fn(() => true)
  const launch = vi.fn(async () => {})
  const close = vi.fn(() => true)
  const shellTask = vi.fn()
  const controller = new ConsoleController({ conversation, list: () => infos, write, launch, close, shellTask,
    onEvent: (listener) => { events.add(listener); return () => { events.delete(listener) } }, resultsRoot: () => folder, deliver })
  const targets = { T1: 'c1', T2: 'c2' }
  controller.send('Research this', targets)
  emitHarness({ phase: 'completed', vendor: 'claude', runId: 'h1', text: plan, tookMs: 1 })
  const release = () => controller.send('go', targets)
  return { controller, release, write, launch, close, started, events, conversation, infos, shellTask, emitHarness }
}

describe('Console controller integration', () => {
  it('passes real file contents to the terminal without a harness turn, and holds missing evidence', async () => {
    const deliver = vi.fn()
    const s = await setup('### T1\nResearch\n### T2\nReview', deliver)
    s.release()
    await vi.waitFor(() => expect(s.write).toHaveBeenCalledTimes(2))
    const first = s.controller.current()!.assignments[0]!
    await writeFile(first.resultPath, 'Verified source evidence')
    for (const listener of s.events) {
      listener({ type: 'turn-complete', consoleId: 'c1' })
      listener({ type: 'turn-complete', consoleId: 'c2' })
    }
    await vi.waitFor(() => expect(s.controller.current()?.assignments[0]?.phase).toBe('completed'))
    await vi.waitFor(() => expect(s.controller.current()?.phase).toBe('failed'))
    expect((await s.controller.collect()).error).toBeTruthy()
    expect(deliver).not.toHaveBeenCalled()
    expect(await s.controller.collect(true)).toEqual({})
    expect(deliver).toHaveBeenCalledWith(expect.stringContaining('Verified source evidence'))
    expect(deliver).toHaveBeenCalledWith(expect.stringContaining('T2: failed'))
    expect(s.started).toHaveLength(1)
    s.controller.stop()
  })
  it('refuses a plan if its prelaunched agent has exited', async () => {
    const s = await setup()
    delete s.infos[0]!.agent
    expect(s.release().release).toMatchObject({ kind: 'refused', reason: expect.stringContaining('session changed') })
    expect(s.write).not.toHaveBeenCalled()
  })

  it('routes plain-shell tasks through output capture', async () => {
    const s = await setup('### T1\necho one\n### T2\necho two')
    delete s.infos[0]!.agent
    delete s.infos[1]!.agent
    // Re-plan against the new shell identities.
    s.controller.send('Use shells', { T1: 'c1', T2: 'c2' })
    s.emitHarness({ phase: 'completed', vendor: 'claude', runId: 'h2', text: '### T1\necho one\n### T2\necho two', tookMs: 1 })
    s.release()
    await vi.waitFor(() => expect(s.shellTask).toHaveBeenCalledTimes(2))
    expect(s.shellTask).toHaveBeenCalledWith('c1', 'echo one', expect.stringContaining('result-1.txt'), expect.any(String))
  })
  it('uses existing agent sessions without launching twice and freezes the dependency handoff paths', async () => {
    const s = await setup()
    expect(s.release().release?.kind).toBe('released')
    await vi.waitFor(() => expect(s.write).toHaveBeenCalledTimes(1))
    expect(s.launch).not.toHaveBeenCalled()
    const run = s.controller.current()!
    expect(s.write.mock.calls[0]).toEqual(['c1', expect.stringContaining(run.assignments[0]!.resultPath)])
    expect(s.release().release?.kind).toBe('refused')
    s.controller.complete('T1')
    await vi.waitFor(() => expect(s.write).toHaveBeenCalledTimes(2))
    expect(s.write.mock.calls[1]).toEqual(['c2', expect.stringContaining(run.assignments[0]!.resultPath)])
  })

  it('refuses a conflicting agent before writing to any terminal', async () => {
    const s = await setup('### T1 — codex\nResearch\n### T2 — agy\nReview')
    expect(s.release().release?.kind).toBe('refused')
    expect(s.write).not.toHaveBeenCalled()
  })

  it('fails closed on missing results and can collect them once they exist', async () => {
    const s = await setup()
    s.release()
    await vi.waitFor(() => expect(s.write).toHaveBeenCalledTimes(1))
    s.controller.complete('T1')
    await vi.waitFor(() => expect(s.write).toHaveBeenCalledTimes(2))
    s.controller.complete('T2')
    expect((await s.controller.collect()).error).toContain('Could not collect')
    for (const item of s.controller.current()!.assignments) {
      await mkdir(dirname(item.resultPath), { recursive: true })
      await writeFile(item.resultPath, `Verified finding from ${item.targetId}`)
    }
    expect(await s.controller.collect()).toEqual({})
    expect(s.started).toHaveLength(2)
    expect(s.started[1]?.prompt).toContain('Verified finding from T1')
    expect(s.started[1]?.prompt).toContain('Verified finding from T2')
    expect((await s.controller.collect()).error).toContain('already')
  })

  it('does not treat a hook without a result file as completed work', async () => {
    const s = await setup()
    s.release()
    await vi.waitFor(() => expect(s.write).toHaveBeenCalledTimes(1))
    for (const listener of s.events) listener({ type: 'turn-complete', consoleId: 'c1' })
    const resultPath = s.controller.current()!.assignments[0]!.resultPath
    await expect(stat(resultPath)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(s.controller.current()?.assignments[0]?.phase).toBe('dispatched')
    s.controller.stop()
    s.controller.complete('T1')
    expect(s.write).toHaveBeenCalledTimes(1)
    expect(s.close).toHaveBeenCalledTimes(2)
  })

  it('describes prelaunched sessions in the orchestrator context', async () => {
    const s = await setup()
    expect(s.controller.descriptions().join('\n')).toContain('already launched claude')
    expect(s.controller.descriptions().join('\n')).toContain('Omit launch')
  })
})
