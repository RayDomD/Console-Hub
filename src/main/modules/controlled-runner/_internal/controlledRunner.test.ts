import { describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ControlledRunner, bundledPiPath, controlledModel, executeControlledProcess, type ControlledRunnerProcess } from './controlledRunner'

function processResult(lines: string[], exitCode = 0, stderr = ''): ControlledRunnerProcess {
  return vi.fn(async (_invocation, onLine) => {
    for (const line of lines) onLine(line)
    return { exitCode, stderr }
  })
}

describe('ControlledRunner', () => {
  it('resolves the installed Pi CLI from the package import entry', () => {
    const packageEntry = join(process.cwd(), 'node_modules', '@earendil-works', 'pi-coding-agent', 'dist', 'index.js')
    const path = bundledPiPath(() => pathToFileURL(packageEntry).href)

    expect(path.replaceAll('\\', '/')).toMatch(/pi-coding-agent\/dist\/bundle\/cli\.js$/)
    expect(existsSync(path)).toBe(true)
  })

  it('resolves Console vendors to explicit Pi providers and refuses an unspecified model', () => {
    expect(controlledModel({ vendor: 'claude', model: 'claude-sonnet-4-6' })).toBe('anthropic/claude-sonnet-4-6')
    expect(controlledModel({ vendor: 'codex', model: 'gpt-5.6-terra' })).toBe('openai/gpt-5.6-terra')
    expect(controlledModel({ vendor: 'agy', model: 'gemini-3.7-flash' })).toBe('google/gemini-3.7-flash')
    expect(controlledModel({ vendor: 'codex', model: 'openai/gpt-5.6-sol' })).toBe('openai/gpt-5.6-sol')
    expect(() => controlledModel({ vendor: 'claude' })).toThrow('Choose an explicit model')
  })

  it('launches research with Fusion Hub read-only tools and returns structured evidence', async () => {
    const execute = processResult([
      JSON.stringify({ type: 'session', id: 'session-1' }),
      JSON.stringify({ type: 'tool_execution_start', toolName: 'read', args: { path: 'PRODUCT.md' } }),
      JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'Verified evidence' }], stopReason: 'stop' } })
    ])
    const runner = new ControlledRunner({ execute, piPath: 'C:\\runtime\\pi.js', nodePath: 'C:\\runtime\\node.exe', timeoutMs: 1_234 })

    const result = await runner.run({ mode: 'research', model: 'openai/model', thinking: 'high', cwd: 'C:\\repo', sessionDir: 'C:\\run', prompt: 'Inspect it' })

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      command: 'C:\\runtime\\node.exe', cwd: 'C:\\repo', timeoutMs: 1_234,
      args: expect.arrayContaining(['C:\\runtime\\pi.js', '--mode', 'json', '--tools', 'read,grep,find,ls'])
    }), expect.any(Function))
    expect(result).toEqual({ ok: true, text: 'Verified evidence', sessionId: 'session-1', tools: [{ name: 'read', argument: 'PRODUCT.md' }] })
  })

  it('grants the Fusion Hub write tool set only to a writing turn', async () => {
    const execute = processResult([
      JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'Implemented' }] } })
    ])
    const runner = new ControlledRunner({ execute, piPath: 'pi.js', nodePath: 'node.exe', timeoutMs: 1_234 })

    await runner.run({ mode: 'write', model: 'anthropic/model', thinking: 'medium', cwd: 'C:\\worktree', sessionDir: 'C:\\run', prompt: 'Build it' })

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ args: expect.arrayContaining(['--tools', 'read,grep,find,ls,bash,edit,write']) }), expect.any(Function))
  })

  it('reports controlled tool activity to the assigned worker plate', async () => {
    const execute = processResult([
      JSON.stringify({ type: 'tool_execution_start', toolName: 'read', args: { path: 'PRODUCT.md' } }),
      JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'Read it' }] } })
    ])
    const progress = vi.fn()
    const runner = new ControlledRunner({ execute, piPath: 'pi.js', nodePath: 'node.exe', timeoutMs: 1_234 })

    await runner.run({ mode: 'research', model: 'openai/model', thinking: 'low', cwd: 'C:\\repo', sessionDir: 'C:\\run', prompt: 'Inspect', onProgress: progress })

    expect(progress).toHaveBeenCalledWith({ type: 'tool', name: 'read', argument: 'PRODUCT.md' })
  })

  it('fails closed on malformed output, process failure, or an empty answer', async () => {
    const execute = processResult(['not-json'], 1, 'provider failed')
    const runner = new ControlledRunner({ execute, piPath: 'pi.js', nodePath: 'node.exe', timeoutMs: 1_234 })

    await expect(runner.run({ mode: 'research', model: 'openai/model', thinking: 'low', cwd: 'C:\\repo', sessionDir: 'C:\\run', prompt: 'Inspect' }))
      .resolves.toEqual({ ok: false, text: '', tools: [], error: 'provider failed' })
  })

  it('kills a worker that exceeds the configured run timeout', async () => {
    const result = await executeControlledProcess({
      command: process.execPath,
      args: ['-e', 'setTimeout(() => {}, 10_000)'],
      cwd: process.cwd(),
      env: process.env,
      timeoutMs: 50
    }, () => {})

    expect(result.exitCode).toBe(124)
    expect(result.stderr).toContain('Runner timed out after 50ms.')
  })

  it.skipIf(process.platform !== 'win32')('kills tool descendants when a worker times out', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'consoleHub-runner-tree-'))
    const marker = join(folder, 'descendant-wrote.txt')
    try {
      const descendant = `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'alive'), 1200)`
      const parent = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { stdio: 'ignore', detached: true }); console.log('spawned'); setTimeout(() => {}, 10000)`
      const lines: string[] = []
      const result = await executeControlledProcess({
        command: process.execPath, args: ['-e', parent], cwd: folder, env: process.env, timeoutMs: 600
      }, (line) => lines.push(line))
      await new Promise((resolve) => setTimeout(resolve, 1400))
      expect(result.exitCode).toBe(124)
      expect(lines).toContain('spawned')
      expect(existsSync(marker)).toBe(false)
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })
})
