import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig } from '../../config'
import type { ConsoleAgent, ConsoleEvent, ConsoleInfo, ConsoleSpec } from '../../../../shared/consoles'
import { shellKindOf, withInitCommand } from './shellInit'
import { agentCommand, configuredAgentBinary } from './agentCommand'
import { protocolLines, withAgentExit } from './taskCommands'
import { TerminalInput } from './terminalInput'
import { ConsoleObservation } from './consoleObservation'
import { terminalEnvironment } from './terminalEnvironment'
import { subscriptionEnvironment } from '../../../subscriptionEnvironment'

/**
 * The console registry: the single source of truth for what shells are open.
 *
 * A console is a shell in a pty, not an agent - run whatever you want in it.
 * Console Hub opens it, so Console Hub knows its folder, which is the only reason
 * consoles live here rather than in Windows Terminal.
 *
 * Deliberately mirrors `skill-runner`: an EventEmitter, a Map of what is live,
 * and a tree-kill on the way out. Two long-lived child-process registries with
 * two different shapes would be two things to learn instead of one.
 */

/**
 * node-pty is a native addon, so it cannot be a static ESM import in a bundle
 * that also targets type-checking - and `createRequire` is how electron-vite
 * expects natives to be reached. Version 1.1.0 ships N-API prebuilds, verified
 * to load into this Electron's ABI without a rebuild step.
 */
const require = createRequire(import.meta.url)
const pty = require('node-pty') as typeof import('node-pty')

interface LiveConsole {
  input: TerminalInput
  observation: ConsoleObservation
  proc: import('node-pty').IPty
  info: ConsoleInfo
  /** Held so the process can be torn down without waiting on its exit event. */
  disposers: Array<() => void>
}

const emitter = new EventEmitter()
const live = new Map<string, LiveConsole>()
let seq = 0
const MAX_PROTOCOL_BUFFER = 8192

export function onConsoleEvent(listener: (event: ConsoleEvent) => void): () => void {
  emitter.on('console', listener)
  return () => emitter.off('console', listener)
}

export function reportConsoleOutput(consoleId: string, chunk: string): void {
  if (live.has(consoleId)) emit({ type: 'data', consoleId, chunk })
}

function emit(event: ConsoleEvent): void {
  emitter.emit('console', event)
}

/**
 * Windows' `kill()` on a pty ends the shell and can leave whatever it started
 * running. A console that outlives the window is invisible and keeps working,
 * so the whole tree goes. Same reasoning, and same mechanism, as a cancelled run.
 */
function killTree(pid: number): void {
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { windowsHide: true })
  } else {
    process.kill(pid, 'SIGTERM')
  }
}

async function stopTree(pid: number): Promise<void> {
  if (process.platform !== 'win32') { process.kill(pid, 'SIGTERM'); return }
  await new Promise<void>((resolve, reject) => {
    const child = spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { windowsHide: true })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) return resolve()
      try { process.kill(pid, 0); reject(new Error('Worker process did not stop. Worktree retained.')) }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') resolve(); else reject(error) }
    })
  })
}

/**
 * The one file `withInitCommand`'s posix path writes, under a fresh temp
 * directory per console so two consoles never race on the same name. Nothing
 * here is the user's own shell config.
 */
function writeTempRcfile(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'consoleHub-console-'))
  const path = join(dir, 'rc.sh')
  writeFileSync(path, contents)
  return path
}

/**
 * Something running inside a console reported finishing a turn. This module
 * never decides what that means or who is trusted to say so - it only relays
 * the report to the same event stream everything else about a console flows
 * through, the way `writeConsole` relays keystrokes without reading them.
 */
export function reportTurnComplete(consoleId: string): void {
  const console_ = live.get(consoleId)
  if (!console_) return
  console_.observation.observeTurnComplete()
  const state = console_.observation.state()
  if (state) {
    console_.info.observedState = state
    emit({ type: 'activity', consoleId, state })
  }
  emit({ type: 'turn-complete', consoleId })
}

async function startConsole(id: string, spec: ConsoleSpec, prepare?: (id: string, shellBin: string) => Promise<string>): Promise<ConsoleInfo> {
  const config = loadConfig()
  const shell = spec.shell ?? config.defaultShell
  const shellSpec = config.shells[shell]
  if (!shellSpec) throw new Error(`No shell "${shell}" in console-hub.config.json`)

  const cwd = spec.cwd ?? config.vaultRoot
  const prepared = prepare ? await prepare(id, shellSpec.bin) : ''
  const kind = shellKindOf(shellSpec.bin)
  const init = [prepared, spec.agent ? withAgentExit(agentCommand(spec.agent, kind, configuredAgentBinary(spec.agent, config), spec.agentPrompt, spec.claudeContextDirectory), kind, id) : spec.initCommand].filter(Boolean).join('\n')
  const args = init
    ? withInitCommand(shellKindOf(shellSpec.bin), shellSpec.args, init, writeTempRcfile)
    : shellSpec.args

  const proc = pty.spawn(shellSpec.bin, args, {
    name: 'xterm-color',
    cols: spec.cols ?? DEFAULT_COLS,
    rows: spec.rows ?? DEFAULT_ROWS,
    cwd,
    env: { ...(spec.agent ? subscriptionEnvironment(terminalEnvironment(process.env)) : terminalEnvironment(process.env)),
      ...(spec.agent?.vendor === 'claude' && spec.claudeContextDirectory ? { CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1' } : {}) } as Record<string, string>
  })

  const info: ConsoleInfo = {
    ...(spec.agent ? { agent: { ...spec.agent } } : {}),
    id,
    shell,
    cwd,
    pid: proc.pid,
    startedAt: Date.now(),
    ...(spec.agent ? { observedState: 'available' as const } : {})
  }
  const observation = new ConsoleObservation(!!spec.agent)

  const input = new TerminalInput((data) => {
    if (live.get(id)?.proc === proc) proc.write(data)
  })

  let protocolBuffer = ''
  const onData = proc.onData((chunk) => {
    observation.observeOutput(chunk)
    emit({ type: 'data', consoleId: id, chunk })
    protocolBuffer += chunk
    const newline = protocolBuffer.lastIndexOf('\n')
    if (newline < 0) { protocolBuffer = protocolBuffer.slice(-MAX_PROTOCOL_BUFFER); return }
    for (const line of protocolLines(protocolBuffer.slice(0, newline))) {
      if (line === `CONSOLE_HUB_AGENT_EXIT:${id}`) {
        input.cancel()
        delete info.agent
        emit({ type: 'agent-exited', consoleId: id })
      }
      const failed = /^CONSOLE_HUB_TASK_FAILED:([a-zA-Z0-9-]+)$/.exec(line)
      if (failed) emit({ type: 'task-failed', consoleId: id, runId: failed[1]! })
    }
    protocolBuffer = protocolBuffer.slice(newline + 1)
  })
  const onExit = proc.onExit(({ exitCode, signal }) => {
    input.cancel()
    live.delete(id)
    emit({ type: 'exited', consoleId: id, exitCode, signal })
  })

  live.set(id, { proc, info, input, observation, disposers: [() => input.cancel(), () => onData.dispose(), () => onExit.dispose()] })
  emit({ type: 'opened', consoleId: id, info })
  return info
}

export async function openConsole(spec: ConsoleSpec = {}, prepare?: (id: string, shellBin: string) => Promise<string>): Promise<ConsoleInfo> {
  return startConsole(`console-${++seq}`, spec, prepare)
}

/** Changing the id here would orphan the renderer plate and its fleet label. */
export async function restartConsole(id: string, spec: ConsoleSpec, prepare?: (id: string, shellBin: string) => Promise<string>): Promise<ConsoleInfo> {
  const console_ = live.get(id)
  if (!console_) throw new Error('Terminal closed')
  for (const dispose of console_.disposers) dispose()
  await stopTree(console_.info.pid)
  live.delete(id)
  return startConsole(id, { shell: console_.info.shell, ...spec }, prepare)
}

/** The 80x24 default exists only until the renderer measures its own terminal and resizes. */
const DEFAULT_COLS = 80
const DEFAULT_ROWS = 24

export function listConsoles(): ConsoleInfo[] {
  return [...live.values()].map((c) => c.info)
}

export function consoleContext(id: string): string | undefined {
  return live.get(id)?.observation.context()
}

export function setConsoleAgent(id: string, agent: ConsoleAgent): void {
  const console_ = live.get(id)
  if (!console_) return
  console_.info.agent = { ...agent }
  console_.observation.activateAgent()
  const state = console_.observation.state()
  if (state) console_.info.observedState = state
  emit({ type: 'agent-launched', consoleId: id, agent: { ...agent } })
  if (state) emit({ type: 'activity', consoleId: id, state })
}

/** Keystrokes go to the pty verbatim. Console Hub does not interpret what you type. */
export function writeConsole(id: string, data: string): boolean {
  const console_ = live.get(id)
  if (!console_) return false
  const before = console_.observation.state()
  console_.observation.observeInput(data)
  const state = console_.observation.state()
  if (state && state !== before) {
    console_.info.observedState = state
    emit({ type: 'activity', consoleId: id, state })
  }
  console_.input.write(data)
  return true
}

export function resizeConsole(id: string, cols: number, rows: number): boolean {
  const console_ = live.get(id)
  if (!console_) return false
  // A pty rejects a zero dimension, and a hidden or unmounted terminal measures
  // as zero - so a card being put away must not be able to kill its shell.
  if (cols < 1 || rows < 1) return false
  console_.proc.resize(cols, rows)
  return true
}

export function closeConsole(id: string): boolean {
  const console_ = live.get(id)
  if (!console_) return false
  live.delete(id)
  for (const dispose of console_.disposers) dispose()
  killTree(console_.info.pid)
  emit({ type: 'exited', consoleId: id, exitCode: 0 })
  return true
}

/**
 * Every console dies with the app. A shell that outlives the window is a process
 * nobody can see and nobody can stop - the same rule headless runs already follow.
 */
export function closeAll(): void {
  for (const id of [...live.keys()]) closeConsole(id)
}
