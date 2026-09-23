import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HarnessEvent } from '../../../../shared/harness'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, rmSync: vi.fn(actual.rmSync) }
})
vi.mock('../../config', () => ({
  loadConfig: () => ({
    claudeBin: 'configured-claude.exe',
    codexBin: 'configured-codex.exe',
    agyBin: 'configured-agy.exe'
  })
}))

class FakeChild extends EventEmitter {
  readonly stdout = new EventEmitter()
  readonly stderr = new EventEmitter()
  readonly pid = 4321
  kill = vi.fn()
}

const spawnMock = vi.mocked(spawn)
const rmSyncMock = vi.mocked(rmSync)

async function loadRunner() {
  vi.resetModules()
  return import('./runner')
}

describe('harness runner', () => {
  beforeEach(() => {
    spawnMock.mockReset()
  })

  /*
   * `startHarness` makes a real directory even when the child is a fake, so a
   * test that never reaches a close handler leaves one behind. Without this the
   * suite grew the same %TEMP% clutter it is here to prevent.
   */
  afterEach(() => {
    for (const call of spawnMock.mock.calls) {
      const cwd = (call[2] as { cwd?: string } | undefined)?.cwd
      if (cwd && basename(cwd).startsWith('consoleHub-harness-')) {
        rmSync(cwd, { recursive: true, force: true })
      }
    }
  })

  it('builds read-only argv when optional run settings are omitted', async () => {
    const { buildInvocation } = await loadRunner()

    expect(buildInvocation({ vendor: 'claude', prompt: 'answer', cwd: 'C:\\work' })).toEqual({
      bin: 'configured-claude.exe',
      configKey: 'claudeBin',
      args: [
        '-p',
        'answer',
        '--disallowedTools',
        'Write,Edit,Bash,PowerShell,NotebookEdit',
        '--restricted',
        '--strict-mcp-config',
        '--disable-slash-commands',
        '--tools',
        'Read,Glob,Grep,WebFetch,WebSearch',
        '--allowedTools',
        'WebSearch,WebFetch',
        '--output-format',
        'stream-json',
        '--verbose'
      ]
    })
    expect(buildInvocation({ vendor: 'codex', prompt: 'answer', cwd: 'C:\\work' })).toEqual({
      bin: 'configured-codex.exe',
      configKey: 'codexBin',
      args: [
        'exec',
        '--sandbox',
        'read-only',
        '-c',
        'approval_policy="never"',
        '--cd',
        'C:\\work',
        '--skip-git-repo-check',
        '--ephemeral',
        '--json',
        '--color',
        'never',
        'answer'
      ]
    })
    expect(buildInvocation({ vendor: 'agy', prompt: 'answer', cwd: 'C:\\work' })).toEqual({
      bin: 'configured-agy.exe',
      configKey: 'agyBin',
      args: [
        '--add-dir',
        'C:\\work',
        '--sandbox',
        '--output-format',
        'stream-json',
        '--print=answer'
      ]
    })
  })

  it.each(['NONE', 'DOCS'] as const)(
    'keeps %s scope read-only for all vendors',
    async (scope) => {
      const { buildInvocation } = await loadRunner()

      const claudeArgs = buildInvocation({
        vendor: 'claude',
        prompt: 'answer',
        cwd: 'C:\\work',
        scope
      }).args
      expect(claudeArgs).toEqual(expect.arrayContaining([
        '--disallowedTools',
        'Write,Edit,Bash,PowerShell,NotebookEdit',
        '--restricted',
        '--strict-mcp-config',
        '--disable-slash-commands',
        '--tools',
        'Read,Glob,Grep,WebFetch,WebSearch',
        '--allowedTools',
        'WebSearch,WebFetch'
      ]))
      expect(claudeArgs).not.toContain('--permission-mode')
      expect(buildInvocation({
        vendor: 'codex',
        prompt: 'answer',
        cwd: 'C:\\work',
        scope
      // The approval policy is part of the restraint, not decoration: without it a
      // sandbox denial is escalated and retried outside the sandbox.
      }).args).toEqual(expect.arrayContaining([
        '--sandbox',
        'read-only',
        '-c',
        'approval_policy="never"'
      ]))
      expect(buildInvocation({
        vendor: 'agy',
        prompt: 'answer',
        cwd: 'C:\\work',
        scope
      }).args).toContain('--sandbox')
    }
  )

  it('names no directory when no working directory is supplied', async () => {
    const { buildInvocation } = await loadRunner()
    const claudeArgs = buildInvocation({ vendor: 'claude', prompt: 'answer' }).args
    const codexArgs = buildInvocation({ vendor: 'codex', prompt: 'answer' }).args
    const agyArgs = buildInvocation({ vendor: 'agy', prompt: 'answer' }).args

    expect(claudeArgs).not.toContain('--cd')
    expect(claudeArgs).not.toContain('C:\\work')
    expect(codexArgs).not.toContain('--cd')
    expect(codexArgs).not.toContain('C:\\work')
    expect(agyArgs).not.toContain('--add-dir')
    expect(agyArgs).not.toContain('C:\\work')
  })

  /**
   * A slot reads its project's conventions because its vendor's CLI discovers
   * them from the directory it runs in — claude and codex from `cwd`, agy from
   * the directory it is given. Nothing is added to the prompt to make that
   * happen: the question reaches every worker verbatim, which is what the plate
   * promises.
   */
  it('hands the workspace to every vendor, so each reads its own conventions file', async () => {
    const { buildInvocation } = await loadRunner()
    const workspace = 'C:\\work'

    // claude discovers CLAUDE.md from the process working directory, which the
    // runner sets to the workspace; it takes no directory flag.
    const claude = buildInvocation({ vendor: 'claude', prompt: 'answer', cwd: workspace })
    expect(claude.args).toContain('answer')
    expect(claude.args.join(' ')).not.toMatch(/CLAUDE\.md/)

    // codex discovers AGENTS.md from the directory named by --cd.
    const codex = buildInvocation({ vendor: 'codex', prompt: 'answer', cwd: workspace })
    expect(codex.args).toContain('--cd')
    expect(codex.args).toContain(workspace)
    expect(codex.args.join(' ')).not.toMatch(/AGENTS\.md/)

    // agy is given the directory explicitly, since it does not inherit one.
    const agy = buildInvocation({ vendor: 'agy', prompt: 'answer', cwd: workspace })
    expect(agy.args).toContain('--add-dir')
    expect(agy.args).toContain(workspace)
  })

  it('never rewrites the question, so every worker is asked the same thing', async () => {
    const { buildInvocation } = await loadRunner()
    const question = 'What is the difference between weather and climate?'

    for (const vendor of ['claude', 'codex', 'agy'] as const) {
      // The prompt rides as one argument, identical whether or not a workspace
      // was given. A conventions instruction prepended here would reach the
      // model as part of the user's own question.
      const carries = (args: readonly string[]): boolean =>
        args.some((arg) => arg === question || arg === `--print=${question}`)

      expect(carries(buildInvocation({ vendor, prompt: question, cwd: 'C:\\work' }).args)).toBe(true)
      expect(carries(buildInvocation({ vendor, prompt: question }).args)).toBe(true)
    }
  })

  it('launches without a workspace from an empty disposable directory', async () => {
    const child = new FakeChild()
    spawnMock.mockReturnValue(child as never)
    const runner = await loadRunner()

    runner.startHarness({ vendor: 'claude', prompt: 'answer' })

    const firstSpawnCall = spawnMock.mock.calls[0]
    expect(firstSpawnCall).toBeDefined()
    if (!firstSpawnCall) throw new Error('expected harness to spawn a process')
    const spawnOptions = firstSpawnCall[2] as { cwd?: string }
    expect(spawnOptions.cwd).not.toBe(process.cwd())
    expect(existsSync(spawnOptions.cwd ?? '')).toBe(true)

    child.emit('close', 1)
    expect(existsSync(spawnOptions.cwd ?? '')).toBe(false)
  })

  /*
   * Windows holds the directory a child was launched in until the OS finishes
   * tearing the process down, which is not always before `close` fires. The
   * removal threw EBUSY out of the close listener, which is an uncaught
   * exception in main: Electron answers that with a modal error dialog, and a
   * modal blocks the main event loop, so the fan froze mid-run with the slot
   * still reading RUNNING. A leaked temp directory is the cheaper failure.
   */
  it('reports the turn even when Windows will not release the disposable directory', async () => {
    const child = new FakeChild()
    spawnMock.mockReturnValue(child as never)
    const runner = await loadRunner()
    const events: HarnessEvent[] = []
    runner.onEvent((event) => events.push(event))

    runner.startHarness({ vendor: 'claude', prompt: 'answer' })
    rmSyncMock.mockImplementationOnce(() => {
      throw Object.assign(new Error('EBUSY: resource busy or locked, rmdir'), { code: 'EBUSY' })
    })

    expect(() => child.emit('close', 1)).not.toThrow()
    expect(events.at(-1)?.phase).toBe('faulted')
  })

  it('passes the selected model with the vendor-specific flag', async () => {
    const { buildInvocation } = await loadRunner()

    expect(buildInvocation({
      vendor: 'claude',
      prompt: 'answer',
      cwd: 'C:\\work',
      model: 'sonnet'
    }).args).toEqual(expect.arrayContaining(['--model', 'sonnet']))
    expect(buildInvocation({
      vendor: 'codex',
      prompt: 'answer',
      cwd: 'C:\\work',
      model: 'gpt-5.6-terra'
    }).args).toEqual(expect.arrayContaining(['-m', 'gpt-5.6-terra']))
    expect(buildInvocation({
      vendor: 'agy',
      prompt: 'answer',
      cwd: 'C:\\work',
      model: 'gemini-3.7-flash-high'
    }).args).toEqual(expect.arrayContaining(['--model', 'gemini-3.7-flash-high']))
  })

  it('passes the selected effort with the vendor-specific flag', async () => {
    const { buildInvocation } = await loadRunner()

    expect(buildInvocation({
      vendor: 'claude',
      prompt: 'answer',
      cwd: 'C:\\work',
      effort: 'medium'
    }).args).toEqual(expect.arrayContaining(['--effort', 'medium']))
    expect(buildInvocation({
      vendor: 'codex',
      prompt: 'answer',
      cwd: 'C:\\work',
      effort: 'medium'
    }).args).toEqual(expect.arrayContaining(['-c', 'model_reasoning_effort=medium']))
    expect(buildInvocation({
      vendor: 'agy',
      prompt: 'answer',
      cwd: 'C:\\work',
      effort: 'medium'
    }).args).toEqual(expect.arrayContaining(['--effort', 'medium']))
  })

  it('omits model and effort flags when their values are empty', async () => {
    const { buildInvocation } = await loadRunner()
    const claudeArgs = buildInvocation({
      vendor: 'claude',
      prompt: 'answer',
      cwd: 'C:\\work',
      model: '',
      effort: ''
    }).args
    const codexArgs = buildInvocation({
      vendor: 'codex',
      prompt: 'answer',
      cwd: 'C:\\work',
      model: '',
      effort: ''
    }).args
    const agyArgs = buildInvocation({
      vendor: 'agy',
      prompt: 'answer',
      cwd: 'C:\\work',
      model: '',
      effort: ''
    }).args

    expect(claudeArgs).not.toContain('--model')
    expect(claudeArgs).not.toContain('--effort')
    expect(codexArgs).not.toContain('-m')
    // `-c` itself always appears now — it carries the approval policy. What an empty
    // effort must not produce is the reasoning-effort override.
    expect(codexArgs.some((arg) => arg.startsWith('model_reasoning_effort='))).toBe(false)
    expect(claudeArgs).not.toContain('')
    expect(codexArgs).not.toContain('')
    expect(agyArgs).not.toContain('--model')
    expect(agyArgs).not.toContain('--effort')
    expect(agyArgs).not.toContain('')
  })

  it('emits completion at the structured turn boundary before process exit', async () => {
    const child = new FakeChild()
    spawnMock.mockReturnValue(child as never)
    const runner = await loadRunner()
    const events: HarnessEvent[] = []
    runner.onEvent((event) => events.push(event))

    runner.startHarness({ vendor: 'codex', prompt: 'answer "this"', cwd: 'C:\\work' })
    child.stdout.emit('data', Buffer.from(
      '{"type":"thread.started","thread_id":"thread-1"}\n' +
      '{"type":"item.completed","item":{"type":"agent_message","text":"answer"}}\n' +
      '{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":2}}\n'
    ))

    expect(events.at(-1)).toMatchObject({
      phase: 'completed',
      vendor: 'codex',
      text: 'answer',
      sessionId: 'thread-1',
      usage: { inputTokens: 10, outputTokens: 2 }
    })
    expect(spawnMock).toHaveBeenCalledWith(
      'configured-codex.exe',
      expect.arrayContaining(['answer "this"']),
      expect.objectContaining({
        cwd: 'C:\\work',
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe']
      })
    )
  })

  it('reads AGY model identifiers from its live roster output', async () => {
    const { parseAgyModels } = await loadRunner()

    expect(parseAgyModels([
      'Fetching available models...',
      'gemini-3.7-flash-high\tGemini 3.7 Flash (High)',
      'claude-sonnet-4-6\tClaude Sonnet 4.6',
      ''
    ].join('\n'))).toEqual(['gemini-3.7-flash-high', 'claude-sonnet-4-6'])
  })

  it('settles AGY from the result status instead of its exit code', async () => {
    const child = new FakeChild()
    spawnMock.mockReturnValue(child as never)
    const runner = await loadRunner()
    const events: HarnessEvent[] = []
    runner.onEvent((event) => events.push(event))

    runner.startHarness({ vendor: 'agy', prompt: 'answer', cwd: 'C:\\work' })
    child.stdout.emit('data', Buffer.from(
      '{"event":"step_update","step_update":{"conversation_id":"agy-1","step_type":"agent_response","text_delta":"answer"}}\n' +
      '{"event":"result","result":{"conversation_id":"agy-1","status":"SUCCESS","response":"answer","duration_seconds":2,"usage":{"output_tokens":4}}}\n'
    ))
    child.emit('close', 0)

    expect(events.at(-1)).toMatchObject({
      phase: 'completed',
      vendor: 'agy',
      text: 'answer',
      sessionId: 'agy-1',
      usage: { outputTokens: 4, tokensPerSecond: 2 }
    })
  })

  it('faults AGY on an error result even when its process exits zero', async () => {
    const child = new FakeChild()
    spawnMock.mockReturnValue(child as never)
    const runner = await loadRunner()
    const events: HarnessEvent[] = []
    runner.onEvent((event) => events.push(event))

    runner.startHarness({ vendor: 'agy', prompt: 'answer', cwd: 'C:\\work' })
    child.stdout.emit('data', Buffer.from(
      '{"event":"result","result":{"status":"ERROR","error":"workspace was not attached"}}\n'
    ))
    child.emit('close', 0)

    expect(events.at(-1)).toMatchObject({
      phase: 'faulted',
      vendor: 'agy',
      fault: { kind: 'process_crash', message: 'workspace was not attached' }
    })
  })

  it('emits observed text as partial before the structured turn boundary', async () => {
    const child = new FakeChild()
    spawnMock.mockReturnValue(child as never)
    const runner = await loadRunner()
    const events: HarnessEvent[] = []
    runner.onEvent((event) => events.push(event))

    runner.startHarness({ vendor: 'codex', prompt: 'answer', cwd: 'C:\\work' })
    child.stdout.emit('data', Buffer.from(
      '{"type":"thread.started","thread_id":"thread-1"}\n' +
      '{"type":"item.completed","item":{"type":"agent_message","text":"answer"}}\n'
    ))

    expect(events).toMatchObject([
      { phase: 'running' },
      { phase: 'partial', text: 'answer', sessionId: 'thread-1' }
    ])
  })

  it('faults when the process exits before a turn boundary', async () => {
    const child = new FakeChild()
    spawnMock.mockReturnValue(child as never)
    const runner = await loadRunner()
    const events: HarnessEvent[] = []
    runner.onEvent((event) => events.push(event))

    runner.startHarness({ vendor: 'claude', prompt: 'answer', cwd: 'C:\\work' })
    child.stdout.emit('data', Buffer.from(
      '{"type":"system","subtype":"init","session_id":"session-1"}\n' +
      '{"type":"assistant","message":{"role":"assistant","content":[],' +
      '"usage":{"input_tokens":7,"output_tokens":3}},"session_id":"session-1"}\n'
    ))
    child.stderr.emit('data', Buffer.from('vendor stopped'))
    child.emit('close', 1)

    expect(events.at(-1)).toMatchObject({
      phase: 'faulted',
      sessionId: 'session-1',
      usage: { inputTokens: 7, outputTokens: 3 },
      fault: {
        kind: 'process_crash',
        diagnosticOutput: expect.stringContaining('vendor stopped')
      }
    })
    expect(events.at(-1)).not.toHaveProperty('text')
  })

  it('settles a vendor error as quota with the vendor message', async () => {
    const child = new FakeChild()
    spawnMock.mockReturnValue(child as never)
    const runner = await loadRunner()
    const events: HarnessEvent[] = []
    runner.onEvent((event) => events.push(event))
    const message = "You've hit your usage limit"

    runner.startHarness({ vendor: 'codex', prompt: 'answer' })
    child.stdout.emit('data', Buffer.from(
      `${JSON.stringify({ type: 'error', message })}\n` +
      `${JSON.stringify({ type: 'turn.failed' })}\n`
    ))
    child.emit('close', 1)

    expect(events.map((event) => event.phase)).toEqual(['running', 'faulted'])
    expect(events.at(-1)).toMatchObject({
      vendor: 'codex',
      fault: { kind: 'quota', message }
    })
    expect(events.at(-1)).not.toHaveProperty('text')
  })

  it('settles a non-quota vendor error as a crash, not as quota', async () => {
    const child = new FakeChild()
    spawnMock.mockReturnValue(child as never)
    const runner = await loadRunner()
    const events: HarnessEvent[] = []
    runner.onEvent((event) => events.push(event))
    const message = 'stream disconnected before completion'

    runner.startHarness({ vendor: 'codex', prompt: 'answer' })
    child.stdout.emit('data', Buffer.from(
      `${JSON.stringify({ type: 'error', message })}
` +
      `${JSON.stringify({ type: 'turn.failed' })}
`
    ))
    child.emit('close', 1)

    expect(events.map((event) => event.phase)).toEqual(['running', 'faulted'])
    expect(events.at(-1)).toMatchObject({
      vendor: 'codex',
      fault: { kind: 'process_crash', message }
    })
  })

  it('preserves UTF-8 text when a code point is split across stdout chunks', async () => {
    const child = new FakeChild()
    spawnMock.mockReturnValue(child as never)
    const runner = await loadRunner()
    const events: HarnessEvent[] = []
    runner.onEvent((event) => events.push(event))
    runner.startHarness({ vendor: 'codex', prompt: 'answer', cwd: 'C:\\work' })
    const stream = Buffer.from(
      '{"type":"item.completed","item":{"type":"agent_message","text":"café"}}\n' +
      '{"type":"turn.completed","usage":{"output_tokens":1}}\n'
    )
    const splitAt = stream.indexOf(Buffer.from('é')) + 1

    child.stdout.emit('data', stream.subarray(0, splitAt))
    child.stdout.emit('data', stream.subarray(splitAt))

    expect(events.at(-1)).toMatchObject({ phase: 'completed', text: 'café' })
  })

  it('ignores stream and close events after cancellation', async () => {
    const child = new FakeChild()
    const taskkill = new FakeChild()
    spawnMock.mockReturnValueOnce(child as never).mockReturnValueOnce(taskkill as never)
    const runner = await loadRunner()
    const events: HarnessEvent[] = []
    runner.onEvent((event) => events.push(event))

    const running = runner.startHarness({ vendor: 'codex', prompt: 'answer', cwd: 'C:\\work' })
    expect(runner.cancelHarness(running.runId)).toBe(true)
    child.stdout.emit('data', Buffer.from(
      '{"type":"item.completed","item":{"type":"agent_message","text":"late"}}\n' +
      '{"type":"turn.completed","usage":{"output_tokens":1}}\n'
    ))
    child.emit('close', 0)

    expect(events.map((event) => event.phase)).toEqual(['running', 'cancelled'])
    if (process.platform === 'win32') {
      expect(spawnMock).toHaveBeenNthCalledWith(
        2,
        'taskkill',
        ['/pid', '4321', '/t', '/f'],
        { windowsHide: true }
      )
    } else {
      expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    }
  })

  it('names the missing binary and config key when spawn reports ENOENT', async () => {
    const child = new FakeChild()
    spawnMock.mockReturnValue(child as never)
    const runner = await loadRunner()
    const events: HarnessEvent[] = []
    runner.onEvent((event) => events.push(event))

    runner.startHarness({ vendor: 'claude', prompt: 'answer', cwd: 'C:\\work' })
    const error = Object.assign(new Error('spawn failed'), { code: 'ENOENT' })
    child.emit('error', error)

    expect(events.at(-1)).toMatchObject({
      phase: 'faulted',
      fault: {
        kind: 'process_crash',
        message: expect.stringContaining('configured-claude.exe not found')
      }
    })
    expect(events.at(-1)).toMatchObject({
      fault: { message: expect.stringContaining('claudeBin') }
    })
  })
})

describe('sweepDisposableCwds', () => {
  /*
   * A directory only leaks when its removal failed, and the run that owned it is
   * long gone by the next launch. Sweeping on start is what keeps a failure that
   * is allowed to happen from accumulating forever.
   */
  it('removes a stale disposable directory and leaves a live one alone', async () => {
    const { sweepDisposableCwds } = await loadRunner()
    const stale = mkdtempSync(join(tmpdir(), 'consoleHub-harness-'))
    const live = mkdtempSync(join(tmpdir(), 'consoleHub-harness-'))
    const longAgo = new Date(Date.now() - 4 * 60 * 60 * 1000)
    utimesSync(stale, longAgo, longAgo)

    try {
      sweepDisposableCwds()
      expect(existsSync(stale)).toBe(false)
      expect(existsSync(live)).toBe(true)
    } finally {
      rmSync(live, { recursive: true, force: true })
      rmSync(stale, { recursive: true, force: true })
    }
  })

  it('leaves directories that are not its own, whatever their age', async () => {
    const { sweepDisposableCwds } = await loadRunner()
    const other = mkdtempSync(join(tmpdir(), 'not-consoleHub-'))
    const longAgo = new Date(Date.now() - 4 * 60 * 60 * 1000)
    utimesSync(other, longAgo, longAgo)

    try {
      sweepDisposableCwds()
      expect(existsSync(other)).toBe(true)
    } finally {
      rmSync(other, { recursive: true, force: true })
    }
  })
})
