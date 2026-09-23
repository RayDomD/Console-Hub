import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import type {
  HarnessCompletedEvent,
  HarnessEvent,
  HarnessFault,
  HarnessPartialEvent,
  HarnessRunOptions,
  HarnessRunningEvent,
  HarnessScope,
  HarnessUsage
} from '../../../../shared/harness'
import { loadConfig } from '../../config'
import { subscriptionEnvironment } from '../../../subscriptionEnvironment'
import {
  createStreamState,
  flushStream,
  normalizeStreamChunk,
  type CompletedTurn,
  type NormalizedStreamEvent,
  type StreamState
} from './normalizer'

interface ActiveRun {
  child: ChildProcess
  options: HarnessRunOptions
  startedAt: number
  stream: StreamState
  decoder: StringDecoder
  stderr: string
  terminal: boolean
  disposableCwd?: string
}

interface Invocation {
  bin: string
  configKey: 'claudeBin' | 'codexBin' | 'agyBin'
  args: string[]
}

const emitter = new EventEmitter()
const active = new Map<string, ActiveRun>()
let sequence = 0
const DISPOSABLE_CWD_PREFIX = 'consoleHub-harness-'
/* Retries are synchronous, so this is main's event loop: three at 50ms is the
   most a cleanup may block the app before it gives up and leaves the directory. */
const DISPOSABLE_CWD_REMOVE_RETRIES = 3
const DISPOSABLE_CWD_RETRY_DELAY_MS = 50
/* An hour is far longer than any turn's own cleanup takes, so nothing a live run
   still needs can be this old. */
const DISPOSABLE_CWD_STALE_MS = 60 * 60 * 1000

/**
 * Read-only for claude, stated as tool removal rather than as a permission mode.
 * Plan mode framed a question as a code change, which is what made workers refuse
 * one. Both scopes are identical today because Console Hub performs every document
 * write itself; the two entries stay separate so a future CODE scope can differ.
 */
const CLAUDE_READ_ONLY_ARGS: readonly string[] = [
  '--disallowedTools',
  'Write,Edit,Bash,PowerShell,NotebookEdit',
  '--restricted',
  '--strict-mcp-config',
  '--disable-slash-commands',
  '--tools',
  'Read,Glob,Grep,WebFetch,WebSearch',
  '--allowedTools',
  'WebSearch,WebFetch'
]

// AGY documents sandboxed terminal restrictions, but no non-interactive
// read-only mode. Plan mode changes the worker's framing, so it cannot stand in.
const AGY_RESTRICTED_ARGS: readonly string[] = ['--sandbox']

/**
 * `--sandbox read-only` alone does not hold. Codex's default approval policy
 * treats a sandbox denial as a request to escalate, so a rejected write is
 * retried outside the sandbox and succeeds - measured on codex-cli 0.151.0,
 * where the same PowerShell write was denied and then allowed on the immediate
 * retry, and the built-in patch tool wrote without consulting the sandbox at
 * all. Pinning the policy to `never` turns both into a refusal the worker
 * reports rather than routes around.
 */
const CODEX_READ_ONLY_ARGS: readonly string[] = [
  '--sandbox',
  'read-only',
  '-c',
  'approval_policy="never"'
]

const READ_ONLY_ARGS_BY_SCOPE: Record<
  'claude' | 'codex' | 'agy',
  Record<HarnessScope, readonly string[]>
> = {
  claude: {
    NONE: CLAUDE_READ_ONLY_ARGS,
    DOCS: CLAUDE_READ_ONLY_ARGS
  },
  codex: {
    NONE: CODEX_READ_ONLY_ARGS,
    DOCS: CODEX_READ_ONLY_ARGS
  },
  agy: {
    NONE: AGY_RESTRICTED_ARGS,
    DOCS: AGY_RESTRICTED_ARGS
  }
}

export function onEvent(listener: (event: HarnessEvent) => void): () => void {
  emitter.on('event', listener)
  return () => emitter.off('event', listener)
}

export function startHarness(options: HarnessRunOptions): HarnessRunningEvent {
  const invocation = buildInvocation(options)
  const runId = `harness-${options.vendor}-${++sequence}`
  const startedAt = Date.now()
  // Every process needs a cwd. An empty disposable directory gives an absent
  // workspace no project context instead of inheriting Console Hub's own directory.
  const disposableCwd = options.cwd
    ? undefined
    : mkdtempSync(join(tmpdir(), DISPOSABLE_CWD_PREFIX))
  let child: ChildProcess
  try {
    child = spawn(invocation.bin, invocation.args, {
      cwd: options.cwd ?? disposableCwd,
      windowsHide: true,
      // Prompts are argv, never shell text. Quotes in a prompt therefore stay data.
      shell: false,
      env: subscriptionEnvironment(process.env),
      // Codex reads additional prompt text from stdin when it is a pipe. EOF is
      // deliberate here because a harnessed run has no interactive input path.
      stdio: ['ignore', 'pipe', 'pipe']
    })
  } catch (error) {
    removeDisposableCwd(disposableCwd)
    throw error
  }
  const run: ActiveRun = {
    child,
    options,
    startedAt,
    stream: createStreamState(options.vendor),
    decoder: new StringDecoder('utf8'),
    stderr: '',
    terminal: false,
    disposableCwd
  }
  active.set(runId, run)

  child.stdout?.on('data', (chunk: Buffer | string) => {
    if (run.terminal) return
    const decoded = typeof chunk === 'string' ? chunk : run.decoder.write(chunk)
    const result = normalizeStreamChunk(run.stream, decoded)
    run.stream = result.state
    handleNormalized(runId, run, result.events)
  })
  child.stderr?.on('data', (chunk: Buffer | string) => {
    if (!run.terminal) run.stderr += chunk.toString()
  })

  child.on('error', (error: NodeJS.ErrnoException) => {
    if (run.terminal) return
    const message = error.code === 'ENOENT'
      ? `${invocation.bin} not found - install ${options.vendor} or set ${invocation.configKey} in console-hub.config.json`
      : error.message
    settleFault(runId, run, {
      kind: 'process_crash',
      message,
      diagnosticOutput: diagnosticOutput(run)
    })
    active.delete(runId)
    removeDisposableCwd(run.disposableCwd)
  })

  child.on('close', (code) => {
    if (!run.terminal) {
      const trailingText = run.decoder.end()
      if (trailingText) {
        const decoded = normalizeStreamChunk(run.stream, trailingText)
        run.stream = decoded.state
        handleNormalized(runId, run, decoded.events)
      }
    }
    if (!run.terminal) {
      const flushed = flushStream(run.stream)
      run.stream = flushed.state
      handleNormalized(runId, run, flushed.events)
    }
    if (!run.terminal) {
      settleFault(runId, run, {
        kind: 'process_crash',
        message: `process exited ${code ?? '?'} before a valid turn boundary`,
        diagnosticOutput: diagnosticOutput(run)
      })
    }
    active.delete(runId)
    removeDisposableCwd(run.disposableCwd)
  })

  const event: HarnessRunningEvent = {
    runId,
    vendor: options.vendor,
    phase: 'running',
    tookMs: 0
  }
  emit(event)
  return event
}

export function cancelHarness(runId: string): boolean {
  const run = active.get(runId)
  if (!run || run.terminal) return false
  run.terminal = true
  killTree(run.child)
  emit({
    runId,
    vendor: run.options.vendor,
    phase: 'cancelled',
    tookMs: elapsed(run),
    sessionId: run.stream.sessionId,
    usage: run.stream.usage
  })
  return true
}

/** Nothing may outlive the window. Called on quit. */
export function cancelAll(): void {
  for (const [runId, run] of active) {
    if (run.terminal) killTree(run.child)
    else cancelHarness(runId)
  }
}

export function buildInvocation(options: HarnessRunOptions): Invocation {
  const config = loadConfig()
  if (options.vendor === 'claude') {
    const scopeArgs = READ_ONLY_ARGS_BY_SCOPE.claude[options.scope ?? 'NONE']
    return {
      bin: config.claudeBin,
      configKey: 'claudeBin',
      args: [
        '-p',
        options.prompt,
        ...(options.model ? ['--model', options.model] : []),
        ...(options.effort ? ['--effort', options.effort] : []),
        ...scopeArgs,
        '--output-format',
        'stream-json',
        '--verbose'
      ]
    }
  }
  if (options.vendor === 'agy') {
    const scopeArgs = READ_ONLY_ARGS_BY_SCOPE.agy[options.scope ?? 'NONE']
    const workspace = options.cwd === undefined ? undefined : resolve(options.cwd)
    return {
      bin: config.agyBin,
      configKey: 'agyBin',
      args: [
        ...(workspace ? ['--add-dir', workspace] : []),
        ...(options.model ? ['--model', options.model] : []),
        ...(options.effort ? ['--effort', options.effort] : []),
        ...scopeArgs,
        '--output-format',
        'stream-json',
        `--print=${options.prompt}`
      ]
    }
  }
  const scopeArgs = READ_ONLY_ARGS_BY_SCOPE.codex[options.scope ?? 'NONE']
  return {
    bin: config.codexBin,
    configKey: 'codexBin',
    args: [
      'exec',
      ...(options.model ? ['-m', options.model] : []),
      ...(options.effort ? ['-c', `model_reasoning_effort=${options.effort}`] : []),
      ...scopeArgs,
      ...(options.cwd ? ['--cd', options.cwd] : []),
      '--skip-git-repo-check',
      '--ephemeral',
      '--json',
      '--color',
      'never',
      options.prompt
    ]
  }
}

/** AGY owns its roster; a static copy would be stale as soon as it updates. */
export function listAgyModels(): Promise<string[]> {
  const { agyBin } = loadConfig()
  return new Promise((resolveModels, rejectModels) => {
    const child = spawn(agyBin, ['models'], {
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer | string) => { stdout += chunk.toString() })
    child.stderr?.on('data', (chunk: Buffer | string) => { stderr += chunk.toString() })
    child.on('error', rejectModels)
    child.on('close', (code) => {
      if (code === 0) {
        resolveModels(parseAgyModels(stdout))
        return
      }
      rejectModels(new Error(stderr || `agy models exited ${code ?? '?'}`))
    })
  })
}

export function parseAgyModels(output: string): string[] {
  return output
    .split(/\r?\n/u)
    .map((line) => line.split('\t', 1)[0]?.trim() ?? '')
    .filter((model) => model.length > 0 && model !== 'Fetching available models...')
}

function handleNormalized(
  runId: string,
  run: ActiveRun,
  events: NormalizedStreamEvent[]
): void {
  for (const event of events) {
    if (run.terminal) return
    if (event.type === 'stream-invalid') {
      settleFault(runId, run, {
        kind: 'stream_invalid',
        message: `${run.options.vendor} emitted malformed JSON stream data`,
        rawOutput: event.rawOutput
      })
      killTree(run.child)
      return
    }
    if (event.type === 'vendor-error') {
      settleFault(runId, run, vendorErrorFault(event.message, run))
      killTree(run.child)
      return
    }
    if (event.type === 'turn-partial') {
      emitPartial(runId, run, event)
      continue
    }
    settleCompleted(runId, run, event)
  }
}

function emitPartial(runId: string, run: ActiveRun, turn: Extract<NormalizedStreamEvent, { type: 'turn-partial' }>): void {
  const event: HarnessPartialEvent = {
    runId,
    vendor: run.options.vendor,
    phase: 'partial',
    tookMs: elapsed(run),
    text: turn.text,
    sessionId: turn.sessionId,
    usage: turn.usage
  }
  emit(event)
}

function settleCompleted(runId: string, run: ActiveRun, turn: CompletedTurn): void {
  run.terminal = true
  const tookMs = elapsed(run)
  const usage = withThroughput(turn.usage, turn.durationMs ?? tookMs)
  const event: HarnessCompletedEvent = {
    runId,
    vendor: run.options.vendor,
    phase: 'completed',
    tookMs,
    text: turn.text,
    sessionId: turn.sessionId,
    usage
  }
  emit(event)
}

function settleFault(runId: string, run: ActiveRun, fault: HarnessFault): void {
  run.terminal = true
  emit({
    runId,
    vendor: run.options.vendor,
    phase: 'faulted',
    tookMs: elapsed(run),
    sessionId: run.stream.sessionId,
    usage: run.stream.usage,
    fault
  })
}

function withThroughput(
  usage: HarnessUsage | undefined,
  observedDurationMs: number
): HarnessUsage | undefined {
  if (!usage || usage.outputTokens === undefined || observedDurationMs <= 0) return usage
  return {
    ...usage,
    tokensPerSecond: usage.outputTokens / (observedDurationMs / 1000)
  }
}

function diagnosticOutput(run: ActiveRun): string {
  return run.stream.rawOutput + run.stderr
}

function elapsed(run: ActiveRun): number {
  return Date.now() - run.startedAt
}

function emit(event: HarnessEvent): void {
  emitter.emit('event', event)
}

/**
 * A vendor error event says the run failed; it does not say why. Only an
 * exhausted quota gets the QUOTA reading, because that is the one fault the user
 * recovers from by waiting rather than by retrying. Everything else the vendor
 * reports is a crash carrying its own message, which is what the card shows.
 *
 * The message is the only signal available - the event carries a type and a
 * message and nothing else - so the match is deliberately narrow. A miss costs a
 * crash reading on a quota fault, which is the behaviour before this existed. A
 * loose match would cost the opposite, and label every failure QUOTA.
 */
const QUOTA_MESSAGE = /usage limit|rate limit|quota/i

function vendorErrorFault(message: string, run: ActiveRun): HarnessFault {
  if (QUOTA_MESSAGE.test(message)) return { kind: 'quota', message }
  return { kind: 'process_crash', message, diagnosticOutput: diagnosticOutput(run) }
}

function removeDisposableCwd(directory: string | undefined): void {
  if (!directory) return
  const resolvedDirectory = resolve(directory)
  const resolvedTempRoot = resolve(tmpdir()) + sep
  if (!resolvedDirectory.startsWith(resolvedTempRoot)) return
  if (!basename(resolvedDirectory).startsWith(DISPOSABLE_CWD_PREFIX)) return
  try {
    // Windows keeps a handle on the directory a child was launched in until the
    // OS finishes tearing the process down, which is not reliably before `close`
    // fires. The retries cover that gap; the catch covers the rest of it.
    rmSync(resolvedDirectory, {
      recursive: true,
      force: true,
      maxRetries: DISPOSABLE_CWD_REMOVE_RETRIES,
      retryDelay: DISPOSABLE_CWD_RETRY_DELAY_MS
    })
  } catch {
    // Deliberately swallowed. This runs inside a child process listener, so a
    // throw here is an uncaught exception in main - Electron answers that with a
    // modal dialog, and a modal blocks the main event loop, which froze a live
    // fan with its slot still reading RUNNING. An empty directory left in %TEMP%
    // is the far cheaper failure.
  }
}

/**
 * Drop disposable directories an earlier session could not remove.
 *
 * Cleanup is allowed to fail - it runs inside a child's `close` listener, where
 * throwing froze the whole app - so the directories it gives up on have to be
 * collected somewhere. Start-up is the only moment their owning runs are all
 * certainly gone. Age is the guard: a live run's directory is minutes old at
 * most, so the hour cutoff cannot reach one.
 */
export function sweepDisposableCwds(now: number = Date.now()): number {
  const root = resolve(tmpdir())
  let entries: string[]
  try {
    entries = readdirSync(root)
  } catch {
    return 0
  }

  let removed = 0
  for (const entry of entries) {
    if (!entry.startsWith(DISPOSABLE_CWD_PREFIX)) continue
    const path = join(root, entry)
    try {
      if (now - statSync(path).mtimeMs < DISPOSABLE_CWD_STALE_MS) continue
      rmSync(path, { recursive: true, force: true })
      removed += 1
    } catch {
      // Still held, or gone already. Either way the next launch sees it again.
    }
  }
  return removed
}

/** Windows shims can survive child.kill(), so cancellation owns the whole tree. */
function killTree(child: ChildProcess): void {
  if (child.pid === undefined) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true })
  } else {
    child.kill('SIGTERM')
  }
}
