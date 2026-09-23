/**
 * The seam between the pure fan machine and the real world.
 *
 * The machine decides *what* must happen and emits commands; the harness knows
 * how to run a vendor CLI. Neither knows the other exists — deliberately, so the
 * machine stays testable without a process and the harness stays reusable
 * outside a fan. This module is the only place that knows both.
 *
 * Its one real job is identity. A harness run has its own id; a fan slot has a
 * slot id and an attempt. Mapping between them is what lets a superseded
 * process's late event be recognised and dropped instead of completing the run
 * that replaced it.
 */

import { EventEmitter } from 'node:events'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  enter,
  release,
  step,
  retry,
  stop,
  shutdown as shutdownFan
} from '../../fan'
import type { EnterOptions } from '../../fan'
import type {
  FanCommand,
  FanConfig,
  FanState,
  FanTransition,
  SlotEvent,
  SlotFault,
  SlotScope,
  SlotUsage
} from '../../../../shared/fan'
import type {
  HarnessEvent,
  HarnessFault,
  HarnessRunOptions,
  HarnessScope,
  HarnessUsage,
  HarnessVendor
} from '../../../../shared/harness'

/** What the runtime needs from the harness. Injected so tests spawn nothing. */
export interface HarnessPort {
  start(options: HarnessRunOptions): { runId: string }
  cancel(runId: string): boolean
  onEvent(listener: (event: HarnessEvent) => void): () => void
}

/** What the runtime needs to publish the orchestrator's document. */
export type DocumentWriter = (path: string, content: string) => Promise<void>

export interface RuntimeOptions {
  harness: HarnessPort
  writeDocument?: DocumentWriter
  /**
   * Per-vendor defaults and acceptable model lists, resolved when a run starts
   * rather than held here.
   *
   * The machine refuses to read config, so somebody has to supply this. It is a
   * function rather than a value because the config is editable while Console Hub is
   * running: reading it once at construction would pin the roster to whatever it
   * was when the window opened.
   */
  enterOptions?: () => EnterOptions
}

/** The phases after which no further event can arrive for a harness run. */
const TERMINAL_PHASES = new Set<HarnessEvent['phase']>(['completed', 'faulted', 'cancelled'])

/** Which slot launch a harness run belongs to. */
interface SlotBinding {
  fanRunId: string
  slotId: string
  attempt: number
}

// ---------------------------------------------------------------------------
// Translation
// ---------------------------------------------------------------------------

/**
 * The fan contract types a vendor as an open string so the machine never has to
 * know the executor roster; the harness only launches the named executors.
 * Narrowing is this module's job, and it fails loudly rather than defaulting:
 * silently launching the wrong vendor would score a comparison against an answer
 * nobody asked for.
 */
export function toHarnessVendor(vendor: string): HarnessVendor {
  if (vendor === 'claude' || vendor === 'codex' || vendor === 'agy') return vendor
  throw new Error(`Slot vendor '${vendor}' is not a harnessable executor`)
}

/** Usage crosses over as the subset the fan actually accumulates. */
export function toSlotUsage(usage: HarnessUsage | undefined): SlotUsage | undefined {
  if (!usage) return undefined
  return {
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens ?? usage.cacheReadInputTokens,
    outputTokens: usage.outputTokens,
    throughput: usage.tokensPerSecond
  }
}

/** What a launch command carries about how the slot should be run. */
export interface SlotLaunchSettings {
  model?: string
  effort?: string
  scope?: SlotScope
  /** The fan's workspace, carried on every launch command the machine emits. */
  workspace?: string
}

/**
 * Per-slot settings become harness options.
 *
 * `SlotScope` and `HarnessScope` share their members deliberately, so the scope
 * passes straight through. Each field is omitted rather than set to undefined,
 * because the harness treats an absent value as "pass no flag" and an empty
 * string would reach the CLI as a real, wrong argument.
 */
export function toHarnessSettings(settings: SlotLaunchSettings): {
  model?: string
  effort?: string
  scope?: HarnessScope
  cwd?: string
} {
  return {
    ...(settings.model ? { model: settings.model } : {}),
    ...(settings.effort ? { effort: settings.effort } : {}),
    ...(settings.scope ? { scope: settings.scope } : {}),
    // The fan's workspace is the slot's working directory, and the only one it
    // gets. With none, the harness gives the process an empty directory rather
    // than Console Hub's own, so an answer never quietly comes from this checkout.
    ...(settings.workspace ? { cwd: settings.workspace } : {})
  }
}

/** The fault shapes were aligned deliberately, so this is a field copy. */
export function toSlotFault(fault: HarnessFault): SlotFault {
  switch (fault.kind) {
    case 'process_crash':
      return {
        kind: 'process_crash',
        message: fault.message,
        diagnosticOutput: fault.diagnosticOutput
      }
    case 'quota':
      return { kind: 'quota', message: fault.message }
    case 'stream_invalid':
      return { kind: 'stream_invalid', message: fault.message, rawOutput: fault.rawOutput }
  }
}

/**
 * A harness event becomes a slot event, or nothing.
 *
 * A cancelled run yields nothing on purpose: cancellation is always something
 * the fan asked for, and `stop` has already recorded the slot as stopped. Feeding
 * it back would be the machine reacting to its own command.
 */
export function toSlotEvent(event: HarnessEvent, binding: SlotBinding): SlotEvent | undefined {
  const base = {
    runId: binding.fanRunId,
    attempt: binding.attempt,
    slotId: binding.slotId,
    vendor: event.vendor
  }

  switch (event.phase) {
    case 'running':
      return { kind: 'progress', ...base }
    case 'partial':
      return {
        kind: 'progress',
        ...base,
        partialText: event.text,
        usage: toSlotUsage(event.usage)
      }
    case 'completed':
      return {
        kind: 'terminal',
        ...base,
        outcome: {
          kind: 'completed',
          text: event.text,
          sessionId: event.sessionId,
          usage: toSlotUsage(event.usage)
        },
        usage: toSlotUsage(event.usage)
      }
    case 'faulted':
      return {
        kind: 'terminal',
        ...base,
        outcome: toSlotFault(event.fault),
        usage: toSlotUsage(event.usage)
      }
    case 'cancelled':
      return undefined
  }
}

// ---------------------------------------------------------------------------
// Atomic document write
// ---------------------------------------------------------------------------

/**
 * Write via a temporary file and rename.
 *
 * The machine promises the orchestrator's output path before the comparison runs,
 * so the path is visible while nothing is there yet. A partial file at a
 * promised path reads as a finished document, which is worse than no file: a
 * rename is atomic, a half-finished write is not.
 */
export async function writeDocumentAtomically(path: string, content: string): Promise<void> {
  const directory = dirname(path)
  await mkdir(directory, { recursive: true })
  const temporary = join(directory, `.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`)
  await writeFile(temporary, content, 'utf8')
  await rename(temporary, path)
}

// ---------------------------------------------------------------------------
// The orchestrator's two turns (ADR 0019)
// ---------------------------------------------------------------------------

/**
 * Turn one. The orchestrator is not asked to answer anything - it is asked to
 * split the work the user described into one task per slot.
 *
 * The heading format is stated exactly because `parseDelegation` is strict:
 * anything short of a heading per slot degrades the run to every slot reading
 * the whole delegation. Naming the slots and the format is the cheapest way to
 * keep that from happening.
 */
const NEWLINE = String.fromCharCode(10)

export function delegationPrompt(
  question: string,
  delegation: string,
  workerSlotIds: readonly string[]
): string {
  const headings = workerSlotIds.map(id => `### ${id}`).join('\n')
  return `You are delegating work to several agents running in parallel. Do not research or answer anything yourself. Write one task per agent.

## The question

${question}

## How the user wants it split

${delegation}

## Format

Write a task under each of these headings exactly, in this order, and add no others. Every heading must have a task under it. Each task must stand alone: the agent reading it sees only its own task, not the others.

${headings}
`
}

/**
 * Turn two. The orchestrator reads back what its agents found and synthesises.
 *
 * It is given its own turn-one output verbatim because the harness never
 * resumes a session (ADR 0016), so this turn does not remember writing the
 * delegation and must be shown it. Nothing here asks for a score: an
 * orchestrated run is unscored by construction, and agents given deliberately
 * different tasks cannot be ranked against each other.
 */
export function synthesisPrompt(
  question: string,
  delegationText: string,
  findings: Array<{ slotId: string; text: string }>,
  absentSlotIds: readonly string[] = []
): string {
  const sections = findings
    .map(f => `## Findings from ${f.slotId}

${f.text}`)
    .join('\n\n')
  const advisory = absentSlotIds.length > 0
    ? `PARTIAL ADVISORY: ${absentSlotIds.join(', ')} reported nothing. Say plainly that their part of the work is missing rather than filling the gap.` + NEWLINE + NEWLINE
    : ''
  return `Your agents have reported back. Write one synthesis of what they collectively found, in answer to the original question. Attribute anything only one agent reports. Say plainly where they disagree and where a task went unanswered. Do not rate the agents against each other - they were given different tasks.

## The question

${question}

## The delegation you wrote

${delegationText}

${advisory}${sections}
`
}

// ---------------------------------------------------------------------------
// The runtime
// ---------------------------------------------------------------------------

export class FanRuntime {
  private readonly harness: HarnessPort
  private readonly writeDocument: DocumentWriter
  private readonly enterOptions?: () => EnterOptions
  private readonly emitter = new EventEmitter()
  /** harness run id -> which slot launch it is. */
  private readonly bindings = new Map<string, SlotBinding>()
  /** slot id -> the harness run currently backing it. */
  private readonly liveBySlot = new Map<string, string>()
  private state?: FanState
  private readonly detach: () => void

  constructor(options: RuntimeOptions) {
    this.harness = options.harness
    this.writeDocument = options.writeDocument ?? writeDocumentAtomically
    this.enterOptions = options.enterOptions
    this.detach = this.harness.onEvent(event => {
      // Nothing awaits this, so an unhandled rejection here would be the only
      // trace of a run that stopped progressing. Reported rather than swallowed.
      void this.ingest(event).catch((error: unknown) => {
        console.error('fan runtime failed to ingest a harness event', error)
      })
    })
  }

  current(): FanState | undefined {
    return this.state
  }

  onTransition(listener: (state: FanState) => void): () => void {
    this.emitter.on('transition', listener)
    return () => this.emitter.off('transition', listener)
  }

  /** Start a run, or absorb the call if the machine latches it. */
  async start(config: FanConfig): Promise<FanState> {
    return this.apply(enter(config, this.state, this.enterOptions?.()))
  }

  async retrySlot(slotId: string): Promise<FanState | undefined> {
    if (!this.state) return undefined
    return this.apply(retry(this.state, slotId))
  }

  async release(): Promise<FanState | undefined> {
    if (!this.state) return undefined
    return this.apply(release(this.state))
  }

  async stop(): Promise<FanState | undefined> {
    if (!this.state) return undefined
    return this.apply(stop(this.state))
  }

  async shutdown(): Promise<void> {
    if (this.state) await this.apply(shutdownFan(this.state))
    this.detach()
  }

  private async ingest(event: HarnessEvent): Promise<void> {
    const binding = this.bindings.get(event.runId)
    // An unbound run is not ours; another caller may share the harness emitter.
    if (!binding || !this.state) return
    if (binding.fanRunId !== this.state.runId) return

    // Only a terminal phase releases the binding. `partial` is progress, not an
    // ending: dropping the binding on it loses the `completed` that follows, and
    // the fan waits forever on a slot whose process has already exited.
    if (TERMINAL_PHASES.has(event.phase)) {
      this.bindings.delete(event.runId)
      if (this.liveBySlot.get(binding.slotId) === event.runId) {
        this.liveBySlot.delete(binding.slotId)
      }
    }

    const slotEvent = toSlotEvent(event, binding)
    if (!slotEvent) return

    await this.apply(step(slotEvent, this.state))
  }

  /** Adopt the new state, then perform every command it asked for. */
  private async apply(transition: FanTransition): Promise<FanState> {
    this.state = transition.state
    try {
      for (const command of transition.commands) {
        await this.perform(command)
      }
    } finally {
      // In a `finally`, because the state has already moved by the time any
      // command runs. Emitting only on the happy path meant one throwing command
      // left the renderer on the state it last heard - a slot reading RUNNING for
      // a process that had finished - with nothing on screen to say so. The error
      // still propagates; it just no longer takes the UI's view of the run with it.
      this.emitter.emit('transition', this.state)
    }
    return this.state
  }

  private async perform(command: FanCommand): Promise<void> {
    const state = this.state
    if (!state) return

    switch (command.kind) {
      case 'launch_workers':
        for (const slot of command.slots) {
          this.launch(state.runId, slot.slotId, slot.attempt, slot.vendor, slot.question, slot)
        }
        return
      case 'launch_delegation':
        this.launch(
          state.runId,
          command.slotId,
          command.attempt,
          command.vendor,
          delegationPrompt(command.question, command.delegation, command.workerSlotIds),
          command
        )
        return
      case 'launch_synthesis':
        this.launch(
          state.runId,
          command.slotId,
          command.attempt,
          command.vendor,
          synthesisPrompt(
            state.config.question,
            state.delegation?.text ?? '',
            command.answers,
            command.absentSlotIds
          ),
          command
        )
        return
      case 'kill_slot': {
        const runId = this.liveBySlot.get(command.slotId)
        if (!runId) return
        this.harness.cancel(runId)
        this.bindings.delete(runId)
        this.liveBySlot.delete(command.slotId)
        return
      }
      case 'write_synthesis_document':
        await this.writeDocument(command.outputPath, command.content)
        return
    }
  }

  private launch(
    fanRunId: string,
    slotId: string,
    attempt: number,
    vendor: string,
    prompt: string,
    settings: SlotLaunchSettings
  ): void {
    const { runId } = this.harness.start({
      vendor: toHarnessVendor(vendor),
      prompt,
      ...toHarnessSettings(settings)
    })
    this.bindings.set(runId, { fanRunId, slotId, attempt })
    this.liveBySlot.set(slotId, runId)
  }
}
