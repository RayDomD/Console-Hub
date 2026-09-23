import { exec, execFile } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { readFileSync } from 'node:fs'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { claudeNotifierPath, resetNotifierCacheForTests, writeClaudeSettingsFile, writeCodexNotifierScript } from './notifier'

const execFileAsync = promisify(execFile)
const execAsync = promisify(exec)

/**
 * These run the actual generated files with `node`, the same way a scoped
 * shell function does - not a parallel reimplementation of their filtering
 * logic, which could drift from what really executes.
 */
describe('notifier scripts', () => {
  let server: Server
  let port: number
  let received: unknown[]

  beforeEach(async () => {
    resetNotifierCacheForTests()
    received = []
    server = createServer((req, res) => {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('end', () => {
        received.push(JSON.parse(body || '{}'))
        res.writeHead(204).end()
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    port = typeof address === 'object' && address !== null ? address.port : 0
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('the claude notifier posts consoleId on the port given', async () => {
    const path = claudeNotifierPath()
    await execFileAsync('node', [path, String(port), 'console-7'])
    expect(received).toEqual([{ consoleId: 'console-7' }])
  })

  it('the codex notifier posts on a real agent-turn-complete payload, port and consoleId baked in', async () => {
    const path = writeCodexNotifierScript(port, 'console-3')
    const payload = JSON.stringify({ type: 'agent-turn-complete', 'input-messages': ['do the thing'] })
    await execFileAsync('node', [path, payload])
    expect(received).toEqual([{ consoleId: 'console-3' }])
  })

  it('the codex notifier stays silent on the internal task-title sub-turn', async () => {
    const path = writeCodexNotifierScript(port, 'console-3')
    const payload = JSON.stringify({
      type: 'agent-turn-complete',
      'input-messages': ['Generate a concise, single-line task title of at most 36 characters...']
    })
    await execFileAsync('node', [path, payload])
    expect(received).toEqual([])
  })

  it('the codex notifier stays silent on any non-turn-complete type', async () => {
    const path = writeCodexNotifierScript(port, 'console-3')
    const payload = JSON.stringify({ type: 'session-start' })
    await execFileAsync('node', [path, payload])
    expect(received).toEqual([])
  })

  it('a fresh codex notifier file is written per call, each carrying its own console id', async () => {
    const pathA = writeCodexNotifierScript(port, 'console-A')
    const pathB = writeCodexNotifierScript(port, 'console-B')
    expect(pathA).not.toBe(pathB)
    const payload = JSON.stringify({ type: 'agent-turn-complete' })
    await execFileAsync('node', [pathA, payload])
    await execFileAsync('node', [pathB, payload])
    expect(received).toEqual([{ consoleId: 'console-A' }, { consoleId: 'console-B' }])
  })

  it('the claude settings file names the notifier script and carries the port and console id', () => {
    const path = writeClaudeSettingsFile(port, 'console-9')
    const settings = JSON.parse(readFileSync(path, 'utf8')) as {
      hooks: { Stop: [{ hooks: [{ type: string; command: string }] }] }
    }
    const command = settings.hooks.Stop[0].hooks[0].command
    expect(settings.hooks.Stop[0].hooks[0].type).toBe('command')
    expect(command).toContain(JSON.stringify(claudeNotifierPath()))
    expect(command).toContain(String(port))
    expect(command).toContain('console-9')
  })

  it('the claude settings file actually drives the notifier when run as claude would run it', async () => {
    const path = writeClaudeSettingsFile(port, 'console-42')
    const settings = JSON.parse(readFileSync(path, 'utf8')) as {
      hooks: { Stop: [{ hooks: [{ command: string }] }] }
    }
    const command = settings.hooks.Stop[0].hooks[0].command
    // Claude runs this exact string through a shell, so this test does too.
    await execAsync(command)
    expect(received).toEqual([{ consoleId: 'console-42' }])
  })
})
