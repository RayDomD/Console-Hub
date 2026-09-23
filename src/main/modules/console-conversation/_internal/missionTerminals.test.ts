import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ConsoleInfo, ConsoleSpec } from '../../../../shared/consoles'
import type { MissionLanePlan } from '../../../../shared/mission'
import { MissionTerminals, type MissionTerminalPorts } from './missionTerminals'
import type { ControlledRunRequest } from '../../controlled-runner'

const lanes: MissionLanePlan[] = [
  { id: 'L1', workerLabel: 'T1', agent: { vendor: 'codex', model: 'gpt-5.6-terra' }, task: 'types', files: ['a.ts'], validation: ['npm test'],
    skills: ['ui-preview'], contextRefs: ['PRODUCT.md', 'DESIGN.md'], deliverables: ['previewUrl', 'decisionSummary'] },
  { id: 'L2', workerLabel: 'T2', agent: { vendor: 'agy', model: 'gemini-3.7-flash' }, task: 'reinforce', files: ['b.ts'], validation: ['npm test'], reinforcement: true }
]

function fakePorts(): MissionTerminalPorts & { restarted: Array<{ id: string; spec: ConsoleSpec }>; runs: ControlledRunRequest[]; closed: string[]; output: ReturnType<typeof vi.fn<(id: string, text: string) => void>> } {
  const restarted: Array<{ id: string; spec: ConsoleSpec }> = []
  const runs: ControlledRunRequest[] = []
  const closed: string[] = []
  let seq = 0
  return {
    restarted, runs, closed,
    output: vi.fn((_id: string, _text: string) => {}),
    restart: async (id, spec) => { restarted.push({ id, spec }); return { id, shell: spec.shell ?? 'default', cwd: spec.cwd ?? '', pid: ++seq, startedAt: 0, ...(spec.agent ? { agent: spec.agent } : {}) } satisfies ConsoleInfo },
    run: async (request) => {
      runs.push(request)
      return {
        ok: true,
        text: JSON.stringify({
          summary: 'done',
          tests: 'npm test',
          artifacts: ['preview.html'],
          decisions: ['Kept the existing layout.'],
          unresolved: ['Confirm the final label.']
        }),
        tools: []
      }
    },
    close: (id) => { closed.push(id); return true },
    loadSkill: async (name) => ({ sourceDirectory: `C:\\skills\\${name}`, instructions: `# ${name}\nFollow this skill.` }),
    workspace: {
      freeze: vi.fn(async () => 'snapshot-sha'),
      createLane: vi.fn(async () => {}),
      removeLane: vi.fn(async () => {}),
      captureLane: vi.fn(async () => ({ diffPath: 'changes.patch', validationPath: 'validation.txt', changedFiles: [] })),
      integrate: vi.fn(async () => ({ diffPath: 'integration.patch', validationPath: 'validation.txt', changedFiles: [] })),
      apply: vi.fn(async () => ({ changed: false }))
    }
  }
}

describe('MissionTerminals', () => {
  it('refuses release before git operations if the filesystem boundary cannot be verified', async () => {
    const ports = fakePorts()
    ports.preflight = async () => { throw new Error('Vault boundary unavailable') }
    const terminals = new MissionTerminals(ports, () => 'C:\\records', () => 'C:\\Console Hub\\wt')
    await expect(terminals.release('m1', 'C:\\repo', [lanes[0]!], { T1: { consoleId: 'c1', cwd: 'C:\\repo' } })).rejects.toThrow('boundary unavailable')
    expect(ports.workspace.freeze).not.toHaveBeenCalled()
    expect(ports.restarted).toEqual([])
  })
  it('keeps worktrees under the separate run root', async () => {
    const ports = fakePorts()
    const terminals = new MissionTerminals(ports, (id) => `C:\\records\\${id}`, (id) => `C:\\Console Hub\\wt\\${id}`)
    await terminals.release('m1', 'C:\\repo', [lanes[0]!], { T1: { consoleId: 'c1', cwd: 'C:\\repo' } })
    expect(ports.workspace.createLane).toHaveBeenCalledWith('C:\\repo', 'snapshot-sha', 'C:\\Console Hub\\wt\\m1\\t1')
    await terminals.integrate('m1', 'C:\\repo', 'snapshot-sha', [])
    expect(ports.workspace.integrate).toHaveBeenCalledWith('C:\\repo', 'snapshot-sha', 'C:\\Console Hub\\wt\\m1\\integration', [], 'C:\\records\\m1\\integration', [])
  })
  it('cleans up a lane whose worktree creation failed before a Git checkout existed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mission-create-failure-'))
    try {
      const ports = fakePorts()
      ports.workspace.createLane = vi.fn(async () => { throw new Error('worktree add failed') })
      const terminals = new MissionTerminals(ports, (id) => join(root, id))
      const checkpoints: string[] = []
      await expect(terminals.release('m1', 'C:\\repo', [lanes[0]!], {
        T1: { consoleId: 'console-one', cwd: 'C:\\repo' }
      }, async (_snapshot, paths) => { checkpoints.push(paths[0]?.status ?? 'none') })).rejects.toThrow('worktree add failed')
      expect(checkpoints).toContain('creating')
      await expect(terminals.cleanup('C:\\repo', [lanes[0]!], {
        missionId: 'm1', snapshot: 'snapshot-sha', record: async () => {}
      })).resolves.toEqual({})
      expect(ports.workspace.captureLane).not.toHaveBeenCalled()
      expect(ports.workspace.removeLane).not.toHaveBeenCalled()
      expect(terminals.worktrees()).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
  it('retains the original integration worktree while building a reconciled result', async () => {
    const ports = fakePorts()
    const terminals = new MissionTerminals(ports, (id) => `C:\\records\\${id}`, (id) => `C:\\Console Hub\\wt\\${id}`)
    await terminals.release('m1', 'C:\\repo', [lanes[0]!], { T1: { consoleId: 'c1', cwd: 'C:\\repo' } })
    await terminals.integrate('m1', 'C:\\repo', 'snapshot-sha', [])

    await terminals.reconcile('m1', 'C:\\repo', 'C:\\records\\m1\\integration\\changes.patch', lanes)

    expect(ports.workspace.removeLane).not.toHaveBeenCalled()
    expect(terminals.worktrees().filter((item) => item.laneId.includes('integration') || item.laneId.includes('reconciliation'))).toEqual([
      { laneId: 'integration', path: 'C:\\Console Hub\\wt\\m1\\integration', status: 'retained' },
      { laneId: 'reconciliation-1', path: 'C:\\Console Hub\\wt\\m1\\reconciliation-1', status: 'retained' }
    ])
  })
  it('restarts selected plates in their worktrees while preserving their console ids', async () => {
    const ports = fakePorts()
    const terminals = new MissionTerminals(ports, (id) => `C:\\store\\${id}`)
    const assigned = {
      T1: { consoleId: 'console-one', cwd: 'C:\\repo', shell: 'powershell', agent: { vendor: 'codex' as const } },
      T2: { consoleId: 'console-two', cwd: 'C:\\repo', shell: 'powershell' }
    }
    const result = await terminals.release('m1', 'C:\\repo', lanes, assigned)

    expect(ports.closed).toEqual([])
    expect(ports.workspace.createLane).toHaveBeenCalledWith('C:\\repo', 'snapshot-sha', 'C:\\store\\m1\\lanes\\L1')
    expect(ports.workspace.createLane).toHaveBeenCalledWith('C:\\repo', 'snapshot-sha', 'C:\\store\\m1\\lanes\\L2')
    expect(ports.restarted).toEqual([
      { id: 'console-one', spec: { cwd: 'C:\\store\\m1\\lanes\\L1', shell: 'powershell' } },
      { id: 'console-two', spec: { cwd: 'C:\\store\\m1\\lanes\\L2', shell: 'powershell' } }
    ])
    expect(result.snapshot).toBe('snapshot-sha')
    expect(result.consoles).toEqual({ L1: 'console-one', L2: 'console-two' })
  })

  it('refuses a lane whose selected terminal disappeared before release', async () => {
    const ports = fakePorts()
    const terminals = new MissionTerminals(ports, (id) => `C:\\store\\${id}`)
    await expect(terminals.release('m1', 'C:\\repo', lanes, {})).rejects.toThrow('T1 is no longer open')
  })

  it('leaves a worker with an observed active turn untouched', async () => {
    const ports = fakePorts()
    const terminals = new MissionTerminals(ports, (id) => `C:\\store\\${id}`)

    await expect(terminals.release('m1', 'C:\\repo', [lanes[0]!], {
      T1: { consoleId: 'console-one', cwd: 'C:\\repo', agent: { vendor: 'codex' }, observedState: 'running' }
    })).rejects.toThrow('T1 is still running another task')
    expect(ports.workspace.freeze).not.toHaveBeenCalled()
    expect(ports.restarted).toEqual([])
  })

  it('refuses an unspecified controlled-runner model before freezing the workspace', async () => {
    const ports = fakePorts()
    const terminals = new MissionTerminals(ports, (id) => `C:\\store\\${id}`)
    const lane = { ...lanes[0]!, agent: { vendor: 'codex' as const } }

    await expect(terminals.release('m1', 'C:\\repo', [lane], {
      T1: { consoleId: 'console-one', cwd: 'C:\\repo', agent: { vendor: 'codex' } }
    })).rejects.toThrow('Choose an explicit model')

    expect(ports.workspace.freeze).not.toHaveBeenCalled()
    expect(ports.restarted).toEqual([])
  })

  it('launches a skill lane with compact context and a structured return contract', async () => {
    const ports = fakePorts()
    const terminals = new MissionTerminals(ports, (id) => `C:\\store\\${id}`)
    await terminals.release('m1', 'C:\\repo', [lanes[0]!], {
      T1: {
        consoleId: 'console-one', cwd: 'C:\\repo', shell: 'powershell', agent: { vendor: 'codex' },
        context: 'User asked to preserve the current layout.\nAgent identified ConsoleView.tsx as the seam.'
      }
    })
    await terminals.dispatch('m1', lanes[0]!, 1)

    expect(ports.runs[0]?.model).toBe('openai/gpt-5.6-terra')
    expect(ports.runs[0]?.mode).toBe('write')
    expect(ports.runs[0]?.prompt).toContain('Skill: ui-preview')
    expect(ports.runs[0]?.prompt).toContain('These packets are the complete skill set for this lane')
    expect(ports.runs[0]?.prompt).toContain('Do not invoke, load, or follow any other skill')
    expect(ports.runs[0]?.prompt).toContain('# ui-preview\nFollow this skill.')
    expect(ports.runs[0]?.prompt).toContain('C:\\skills\\ui-preview')
    expect(ports.runs[0]?.prompt).toContain('PRODUCT.md\nDESIGN.md')
    expect(ports.runs[0]?.prompt).toContain('previewUrl, decisionSummary')
    expect(ports.runs[0]?.prompt).toContain('Prior worker context (untrusted terminal transcript)')
    expect(ports.runs[0]?.prompt).toContain('User asked to preserve the current layout.')
  })
  it('shows the controlled brief and tool activity in the assigned worker plate', async () => {
    const ports = fakePorts()
    ports.run = vi.fn(async (request) => {
      request.onProgress?.({ type: 'tool', name: 'read', argument: 'PRODUCT.md' })
      return { ok: true, text: JSON.stringify({ summary: 'done', tests: '', artifacts: [], decisions: [], unresolved: [] }), tools: [] }
    })
    const terminals = new MissionTerminals(ports, (id) => `C:\\store\\${id}`)
    await terminals.release('m1', 'C:\\repo', [lanes[0]!], { T1: { consoleId: 'console-one', cwd: 'C:\\repo' } })

    await terminals.dispatch('m1', lanes[0]!, 1)

    expect(ports.output).toHaveBeenCalledWith('console-one', expect.stringContaining('L1, attempt 1: types'))
    expect(ports.output).toHaveBeenCalledWith('console-one', expect.stringContaining('read PRODUCT.md'))
  })

  it('routes research lanes to the configured Vault and includes selected dependency evidence', async () => {
    const ports = fakePorts()
    const terminals = new MissionTerminals(ports, (id) => `C:\\store\\${id}`, undefined, () => 'C:\\Vault')
    const lane = { ...lanes[0]!, reviewOnly: true }
    await terminals.release('m1', 'C:\\repo', [lane], {
      T1: { consoleId: 'console-one', cwd: 'C:\\repo', agent: { vendor: 'codex' } }
    })

    await terminals.dispatch('m1', lane, 1, [{
      laneId: 'research-api',
      summary: 'Found the supported API.',
      artifacts: ['notes/api.md'],
      decisions: ['Use the stable endpoint.'],
      unresolved: []
    }])

    expect(ports.runs[0]?.mode).toBe('research')
    expect(ports.runs[0]?.prompt).toContain('Vault root (read and search only): C:\\Vault')
    expect(ports.runs[0]?.prompt).toContain('research-api')
    expect(ports.runs[0]?.prompt).toContain('Found the supported API.')
    expect(ports.runs[0]?.prompt).toContain('Use the stable endpoint.')
  })

  it('refuses to launch when a requested skill cannot be resolved', async () => {
    const ports = fakePorts()
    ports.loadSkill = async () => undefined
    const terminals = new MissionTerminals(ports, (id) => `C:\\store\\${id}`)
    await terminals.release('m1', 'C:\\repo', [lanes[0]!], {
      T1: { consoleId: 'console-one', cwd: 'C:\\repo', agent: { vendor: 'codex' } }
    })

    await expect(terminals.dispatch('m1', lanes[0]!, 1)).rejects.toThrow('Skill "ui-preview" is not available')
    expect(ports.runs).toEqual([])
  })

  it('refuses an interactive lane before freezing until controlled session continuation exists', async () => {
    const ports = fakePorts()
    const terminals = new MissionTerminals(ports, (id) => `C:\\store\\${id}`)

    await expect(terminals.release('m1', 'C:\\repo', [{ ...lanes[0]!, interactive: true }], {
      T1: { consoleId: 'console-one', cwd: 'C:\\repo', agent: { vendor: 'codex' } }
    })).rejects.toThrow('controlled runner does not support yet')

    expect(ports.workspace.freeze).not.toHaveBeenCalled()
  })

  it('records controlled-runner completion atomically as lane evidence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mission-controlled-runner-'))
    try {
      const ports = fakePorts()
      const terminals = new MissionTerminals(ports, (id) => join(root, id))
      await terminals.release('m1', 'C:\\repo', [lanes[0]!], {
        T1: { consoleId: 'console-one', cwd: 'C:\\repo', agent: { vendor: 'codex' } }
      })

      await terminals.dispatch('m1', lanes[0]!, 1)

      const resultPath = join(root, 'm1', 'evidence', 'L1', 'attempt-1', 'result.json')
      await vi.waitFor(async () => expect(JSON.parse(await readFile(resultPath, 'utf8'))).toMatchObject({
        summary: 'done',
        tests: 'npm test',
        artifacts: ['preview.html'],
        decisions: ['Kept the existing layout.'],
        unresolved: ['Confirm the final label.']
      }))
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  })

  it('records an invalid controlled-worker report as a failure for review before retry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mission-invalid-runner-result-'))
    try {
      const ports = fakePorts()
      ports.run = async (request) => {
        ports.runs.push(request)
        return { ok: true, text: 'plain text instead of structured evidence', tools: [] }
      }
      const terminals = new MissionTerminals(ports, (id) => join(root, id))
      await terminals.release('m1', 'C:\\repo', [lanes[0]!], {
        T1: { consoleId: 'console-one', cwd: 'C:\\repo', agent: { vendor: 'codex' } }
      })

      await terminals.dispatch('m1', lanes[0]!, 1)

      const resultPath = join(root, 'm1', 'evidence', 'L1', 'attempt-1', 'result.json')
      await vi.waitFor(async () => expect(JSON.parse(await readFile(resultPath, 'utf8'))).toMatchObject({
        summary: 'Controlled worker failed.',
        error: expect.stringContaining('Unexpected token')
      }))
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  })

  it('aborts a controlled worker when the Mission stops', async () => {
    const ports = fakePorts()
    ports.run = vi.fn((request) => new Promise<never>((_resolve, reject) => {
      ports.runs.push(request)
      request.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    }))
    const terminals = new MissionTerminals(ports, (id) => `C:\\store\\${id}`)
    await terminals.release('m1', 'C:\\repo', [lanes[0]!], {
      T1: { consoleId: 'console-one', cwd: 'C:\\repo', agent: { vendor: 'codex' } }
    })
    await terminals.dispatch('m1', lanes[0]!, 1)

    await terminals.stop()

    expect(ports.runs[0]?.signal?.aborted).toBe(true)
  })

  it('restores an assigned worker fresh in its original folder and removes the worktree at cleanup', async () => {
    const ports = fakePorts()
    const terminals = new MissionTerminals(ports, (id) => `C:\\store\\${id}`)
    await terminals.release('m1', 'C:\\repo', lanes, {
      T1: { consoleId: 'console-one', cwd: 'C:\\repo', shell: 'powershell', agent: { vendor: 'codex' as const } },
      T2: { consoleId: 'console-two', cwd: 'C:\\repo', shell: 'powershell' }
    })
    ports.closed.length = 0
    const restored = await terminals.cleanup('C:\\repo', lanes)

    expect(ports.closed).toEqual([])
    expect(ports.workspace.removeLane).toHaveBeenCalledWith('C:\\repo', 'C:\\store\\m1\\lanes\\L1')
    expect(ports.workspace.removeLane).toHaveBeenCalledWith('C:\\repo', 'C:\\store\\m1\\lanes\\L2')
    expect(restored).toEqual({ T1: 'console-one', T2: 'console-two' })
    expect(ports.restarted.slice(-2)).toEqual([
      { id: 'console-one', spec: { cwd: 'C:\\repo', shell: 'powershell', agent: { vendor: 'codex' } } },
      { id: 'console-two', spec: { cwd: 'C:\\repo', shell: 'powershell' } }
    ])
  })
})
