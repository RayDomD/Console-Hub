import { execFile, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { ConsoleAgent } from '../../../../shared/consoles'

const READONLY_TOOLS = 'read,grep,find,ls'
const FULL_TOOLS = 'read,grep,find,ls,bash,edit,write'
const ABORTED_EXIT_CODE = 130
const TIMED_OUT_EXIT_CODE = 124
const PROVIDER_BY_VENDOR: Record<ConsoleAgent['vendor'], string> = {
  claude: 'anthropic',
  codex: 'openai',
  agy: 'google'
}

export function controlledModel(agent: ConsoleAgent): string {
  const model = agent.model?.trim()
  if (!model) throw new Error(`Choose an explicit model for the ${agent.vendor} Mission worker.`)
  return model.includes('/') ? model : `${PROVIDER_BY_VENDOR[agent.vendor]}/${model}`
}

export interface ControlledRunRequest {
  mode: 'research' | 'write'
  model: string
  thinking: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  cwd: string
  sessionDir: string
  prompt: string
  sessionId?: string
  signal?: AbortSignal
  onProgress?: (event: { type: 'tool'; name: string; argument?: string }) => void
}

export interface ControlledRunResult {
  ok: boolean
  text: string
  sessionId?: string
  tools: Array<{ name: string; argument?: string }>
  error?: string
}

export interface ControlledRunnerInvocation {
  command: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
  timeoutMs: number
  signal?: AbortSignal
}

export type ControlledRunnerProcess = (
  invocation: ControlledRunnerInvocation,
  onLine: (line: string) => void
) => Promise<{ exitCode: number; stderr: string }>

export function bundledPiPath(resolvePackage = (specifier: string) => import.meta.resolve(specifier)): string {
  const entry = fileURLToPath(resolvePackage('@earendil-works/pi-coding-agent'))
  return join(dirname(entry), 'bundle', 'cli.js')
}

function argumentOf(args: unknown): string | undefined {
  if (!args || typeof args !== 'object') return undefined
  const record = args as Record<string, unknown>
  const value = record.path ?? record.file_path ?? record.filePath ?? record.pattern ?? record.command
  return typeof value === 'string' ? value : undefined
}

export const executeControlledProcess: ControlledRunnerProcess = (invocation, onLine) => new Promise((resolve) => {
  if (invocation.signal?.aborted) {
    resolve({ exitCode: ABORTED_EXIT_CODE, stderr: 'Runner aborted before launch.' })
    return
  }
  const child = spawn(invocation.command, invocation.args, {
    cwd: invocation.cwd,
    env: invocation.env,
    windowsHide: true,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let stdout = ''
  let stderr = ''
  let timedOut = false
  let termination: Promise<void> | undefined
  const abort = () => {
    if (termination) return
    if (process.platform !== 'win32' || !child.pid) {
      child.kill()
      termination = Promise.resolve()
      return
    }
    termination = new Promise<void>((done) => {
      execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }, (error) => {
        if (error) child.kill()
        done()
      })
    })
  }
  const timeout = setTimeout(() => {
    timedOut = true
    stderr += `${stderr ? '\n' : ''}Runner timed out after ${invocation.timeoutMs}ms.`
    abort()
  }, invocation.timeoutMs)
  invocation.signal?.addEventListener('abort', abort, { once: true })
  child.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString()
    const lines = stdout.split('\n')
    stdout = lines.pop() ?? ''
    for (const line of lines) onLine(line)
  })
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
  child.on('error', (error) => { stderr += `${stderr ? '\n' : ''}${error.message}` })
  child.on('close', async (code) => {
    await termination
    clearTimeout(timeout)
    invocation.signal?.removeEventListener('abort', abort)
    if (stdout.trim()) onLine(stdout)
    resolve({ exitCode: timedOut ? TIMED_OUT_EXIT_CODE : code ?? 1, stderr })
  })
})

export interface ControlledRunnerOptions {
  timeoutMs: number
  execute?: ControlledRunnerProcess
  piPath?: string
  nodePath?: string
}

export class ControlledRunner {
  private readonly execute: ControlledRunnerProcess
  private readonly piPath: string
  private readonly nodePath: string
  private readonly timeoutMs: number

  constructor(options: ControlledRunnerOptions) {
    this.execute = options.execute ?? executeControlledProcess
    this.piPath = options.piPath ?? bundledPiPath()
    this.nodePath = options.nodePath ?? process.execPath
    this.timeoutMs = options.timeoutMs
  }

  async run(request: ControlledRunRequest): Promise<ControlledRunResult> {
    let text = ''
    let sessionId: string | undefined
    let stopReason: string | undefined
    let eventError: string | undefined
    const tools: ControlledRunResult['tools'] = []
    const args = [
      this.piPath,
      '--mode', 'json',
      '--print',
      '--session-dir', request.sessionDir,
      '--no-skills',
      '--no-extensions',
      '--no-context-files',
      '--thinking', request.thinking,
      '--model', request.model,
      '--tools', request.mode === 'research' ? READONLY_TOOLS : FULL_TOOLS
    ]
    if (request.sessionId) args.push('--session-id', request.sessionId)
    args.push('--', request.prompt)

    const processResult = await this.execute({
      command: this.nodePath,
      args,
      cwd: request.cwd,
      timeoutMs: this.timeoutMs,
      env: { ...process.env, PI_OFFLINE: '1', PI_SKIP_VERSION_CHECK: '1', ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}) },
      ...(request.signal ? { signal: request.signal } : {})
    }, (line) => {
      let event: Record<string, unknown>
      try { event = JSON.parse(line) as Record<string, unknown> } catch { return }
      if (event.type === 'session' && typeof event.id === 'string') sessionId = event.id
      if (event.type === 'tool_execution_start' && typeof event.toolName === 'string') {
        const argument = argumentOf(event.args)
        const tool = { name: event.toolName, ...(argument ? { argument } : {}) }
        tools.push(tool)
        request.onProgress?.({ type: 'tool', ...tool })
      }
      if (event.type !== 'message_end' || !event.message || typeof event.message !== 'object') return
      const message = event.message as { role?: unknown; content?: unknown; stopReason?: unknown; errorMessage?: unknown }
      if (message.role !== 'assistant') return
      if (Array.isArray(message.content)) {
        const final = message.content
          .filter((part): part is { type: 'text'; text: string } => !!part && typeof part === 'object' && (part as { type?: unknown }).type === 'text' && typeof (part as { text?: unknown }).text === 'string')
          .map(part => part.text).join('')
        if (final.trim()) text = final
      }
      if (typeof message.stopReason === 'string') stopReason = message.stopReason
      if (typeof message.errorMessage === 'string') eventError = message.errorMessage
    })

    const ok = processResult.exitCode === 0 && stopReason !== 'error' && stopReason !== 'aborted' && text.trim().length > 0
    return {
      ok,
      text,
      ...(sessionId ? { sessionId } : {}),
      tools,
      ...(!ok ? { error: eventError || processResult.stderr.trim() || (text.trim() ? `Runner stopped: ${stopReason ?? `exit ${processResult.exitCode}`}` : 'Runner returned no answer') } : {})
    }
  }
}
