import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { loadConfig, skillById, skillEntries } from '../../config'
import type { RunEvent, RunPhase, RunOptions, SkillEntry } from '../../../../shared/skills'
import { buildInvocation, commandLine, parseResult, providerFor } from './argv'
import { logLine, writeOutput } from './log'
import { subscriptionEnvironment } from '../../../subscriptionEnvironment'

/**
 * One press, one child process.
 *
 * Claude does not live inside Console Hub. Each run spawns the same `claude` binary
 * the user runs in their terminal, which authenticates as them from ~/.claude,
 * runs to completion and exits. Console Hub never holds a token, never embeds a
 * model, and never keeps a session alive between presses.
 */

export type { RunEvent, RunPhase }

interface ActiveRun {
  child: ChildProcess
  skill: SkillEntry
  startedAt: Date
  timeout: NodeJS.Timeout
  killedAs: RunPhase | null
}

const emitter = new EventEmitter()
const active = new Map<string, ActiveRun>()
let seq = 0

export function onRunEvent(listener: (event: RunEvent) => void): () => void {
  emitter.on('run', listener)
  return () => emitter.off('run', listener)
}

function emit(event: RunEvent): void {
  emitter.emit('run', event)
}

/**
 * Windows' `child.kill()` ends the shim and leaves whatever it started running.
 * A cancel that leaves the work going is a lie, so the tree goes with it.
 */
function killTree(child: ChildProcess): void {
  if (child.pid === undefined) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true })
  } else {
    child.kill('SIGTERM')
  }
}

export function listSkills(): SkillEntry[] {
  return skillEntries()
}

/**
 * The exact command a press would run, for the picker to display. Built by the
 * same functions that build the real one, so what is shown and what runs cannot
 * drift apart - the reason this is not reimplemented in the renderer.
 */
export function previewCommand(skillId: string, opts: RunOptions = {}): string {
  const skill = skillById(skillId)
  if (!skill) return ''
  const invocation = buildInvocation(loadConfig(), skill, opts)
  return commandLine(invocation.bin, invocation.args)
}

export function startRun(skillId: string, opts: RunOptions = {}): RunEvent {
  const skill = skillById(skillId)
  if (!skill) throw new Error(`No skill "${skillId}" in console-hub.config.json`)

  const config = loadConfig()
  const invocation = buildInvocation(config, skill, opts)
  const command = commandLine(invocation.bin, invocation.args)
  const runId = `${skillId}-${++seq}`
  const startedAt = new Date()
  const provider = providerFor(skill, opts)
  const model = opts.model ?? skill.executors[provider].model
  const effort = opts.effort ?? skill.executors[provider].effort

  const base = { runId, skillId, provider, model, effort, command }

  const child = spawn(invocation.bin, invocation.args, {
    cwd: skill.cwd,
    windowsHide: true,
    // No shell: provider bins are real executables, so arguments never touch a parser
    // and a prompt containing quotes cannot become a command.
    shell: false,
    env: subscriptionEnvironment(process.env)
  })

  let stdout = ''
  let stderr = ''
  let spawnFailed = false
  child.stdout?.on('data', (d: Buffer) => (stdout += d.toString()))
  child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()))

  const timeout = setTimeout(() => {
    const run = active.get(runId)
    if (!run) return
    run.killedAs = 'blocked'
    killTree(child)
  }, config.runTimeoutMs)

  active.set(runId, { child, skill, startedAt, timeout, killedAs: null })

  logLine(
    `${skillId}  ${provider}  ${model}/${effort}  ${invocation.permission}  started`
  )

  child.on('error', (err) => {
    spawnFailed = true
    clearTimeout(timeout)
    active.delete(runId)
    const message =
      (err as NodeJS.ErrnoException).code === 'ENOENT'
        ? `${invocation.bin} not found — install ${provider} or set ${provider}Bin in console-hub.config.json`
        : err.message
    logLine(`${skillId}  failed to start — ${message}`)
    emit({ ...base, phase: 'failed', tookMs: Date.now() - startedAt.getTime(), message })
  })

  child.on('close', (code) => {
    if (spawnFailed) return
    const run = active.get(runId)
    clearTimeout(timeout)
    active.delete(runId)
    const tookMs = Date.now() - startedAt.getTime()
    const secs = Math.round(tookMs / 1000)

    if (run?.killedAs === 'cancelled') {
      logLine(`${skillId}  cancelled by hand after ${secs}s`)
      emit({ ...base, phase: 'cancelled', tookMs })
      return
    }
    if (run?.killedAs === 'blocked') {
      const message = `no reply in ${Math.round(config.runTimeoutMs / 1000)}s — killed`
      logLine(`${skillId}  blocked  ${message}`)
      emit({ ...base, phase: 'blocked', tookMs, message })
      return
    }

    const parsed = parseResult(provider, stdout)
    const { text } = parsed
    const body = text || stderr.trim() || '(no output)'
    const outputPath = writeOutput({ skillId, startedAt, command, body })
    const failed = code !== 0 || parsed.isError

    if (failed) {
      logLine(`${skillId}  exit ${code ?? '?'}  ${secs}s  -> ${outputPath}`)
      emit({
        ...base,
        phase: 'failed',
        tookMs,
        outputPath,
        message: parsed.message ?? (stderr.trim().split('\n')[0] || `exit ${code ?? '?'}`)
      })
      return
    }

    const cost = parsed.costUsd
    logLine(
      `${skillId}  ok  ${secs}s${cost === undefined ? '' : `  $${cost.toFixed(3)}`}  -> ${outputPath}`
    )
    emit({ ...base, phase: 'done', tookMs, outputPath, costUsd: cost })
  })

  const event: RunEvent = { ...base, phase: 'running', tookMs: 0 }
  emit(event)
  return event
}

export function cancelRun(runId: string): boolean {
  const run = active.get(runId)
  if (!run) return false
  run.killedAs = 'cancelled'
  killTree(run.child)
  return true
}

/** Nothing may outlive the window. Called on quit. */
export function cancelAll(): void {
  for (const runId of [...active.keys()]) cancelRun(runId)
}
