import type { MissionPhase } from '../../../../../shared/mission'
import type { ConversationSettings, ConversationState } from '../../../../../shared/orchestrator-conversation'

/**
 * What the Console Orchestrator terminal reads out of a transcript, as plain
 * functions - the same reason `orchestrator-terminal`'s own model file exists
 * as one. Small enough, and different enough (no Fan lifecycle, no
 * proposal gate), that duplicating `identityLabel`/`stampLabel` here reads
 * better than reaching into that module's `_internal/`.
 */

/** `CLAUDE · SONNET · MEDIUM`, naming only what the settings actually set. */
export function identityLabel(settings: ConversationSettings): string {
  return [settings.vendor, settings.model, settings.effort]
    .filter((part): part is string => part !== undefined && part.length > 0)
    .map((part) => part.toUpperCase())
    .join(' · ')
}

export function stampLabel(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function turnLabel(state: ConversationState): string {
  if (state.turn === 'responding') return '▮▯▯▯ RESPONDING'
  if (state.turn === 'failed') return '▯▮▯▮ REPLY FAILED'
  return '▯▯▯▯ READY'
}

export function composerDisabled(state: ConversationState): boolean {
  return state.turn === 'responding'
}

/**
 * The one status line the Orchestrator plate keeps. Mission progress, blockers,
 * and review outcomes are reported here rather than in a panel, so the newest
 * Mission report wins while a Mission is active - a failure report the user
 * must act on would otherwise be written to a list nothing renders.
 */
export function orchestratorActivity(input: { started: boolean; paused: boolean; busy: boolean; phase?: MissionPhase; runPhase?: string; updates: readonly string[] }): string {
  if (!input.started) return 'No session started'
  const missionActive = input.phase !== undefined && input.phase !== 'applied' && input.phase !== 'rejected'
  if (missionActive) return input.updates.at(-1) ?? `Mission ${input.phase!.replaceAll('_', ' ')}`
  if (input.paused) return 'Handoffs paused for native terminal input'
  if (input.busy) return 'Orchestrator responding · results will wait'
  if (input.runPhase) return input.updates.at(-1) ?? `Run ${input.runPhase}`
  return 'Ready · automatic handoffs enabled'
}

const MISSION_COMMANDS = new Set(['', 'run', 'review', 'apply', 'reject', 'stop', 'status'])

/** App-owned command, so every Orchestrator vendor uses the same delegation path. */
export function delegateCommand(line: string): string | undefined {
  const text = line.trim()
  return /^\/delegate(?:\s|$)/i.test(text) ? text : undefined
}

/**
 * The Mission phases in which a bare natural reply is unambiguous. A reply
 * Console Hub cannot act on is ordinary conversation and must reach the agent, so
 * every intent names the phases that give it one meaning - "yes" only releases
 * a plan the Orchestrator is holding, and never applies a Result.
 */
const MISSION_INTENTS: ReadonlyArray<{ phrases: string[]; command: string; phases: MissionPhase[] }> = [
  { phrases: ['go', 'yes', 'go ahead'], command: '/mission run', phases: ['held'] },
  { phrases: ['stop'], command: '/mission stop', phases: ['queued', 'running', 'blocked'] },
  { phrases: ['apply it'], command: '/mission apply', phases: ['ready_apply'] },
  { phrases: ['reject it'], command: '/mission reject', phases: ['held', 'blocked', 'integration_failed', 'ready_apply', 'reconciling', 'stopped', 'interrupted'] },
  { phrases: ['what is the status?'], command: '/mission status', phases: ['held', 'queued', 'running', 'blocked', 'ready_review', 'reviewing', 'integration_failed', 'ready_apply', 'reconciling', 'stopped', 'interrupted'] }
]

/**
 * Commands Console Hub may consume before they reach an agent CLI. Every
 * `/mission` line always counts - including a free-form draft request - so
 * one never leaks to the CLI's own slash-command parser as "unknown skill".
 * A natural reply counts only where `phase` makes it unambiguous.
 */
export function missionCommand(line: string, phase?: MissionPhase): string | undefined {
  const trimmed = line.trim().replace(/\s+/g, ' ')
  const normalized = trimmed.toLowerCase()
  const match = normalized.match(/^\/mission(?: (.*))?$/)
  if (match) {
    const argument = match[1] ?? ''
    if (MISSION_COMMANDS.has(argument) || /^retry [a-z][a-z0-9-]*$/.test(argument)) return normalized
    return trimmed
  }
  const intent = MISSION_INTENTS.find((entry) => entry.phrases.includes(normalized))
  if (intent) return phase && intent.phases.includes(phase) ? intent.command : undefined
  const retry = /^retry ([a-z][a-z0-9-]*)$/.exec(normalized)
  if (retry && phase === 'blocked') return `/mission retry ${retry[1]}`
  return undefined
}

/**
 * A drafted plan exists (a completed Orchestrator turn with a question behind
 * it) that has not yet been released - no `delegation` entry follows it. This
 * is what makes the composer show the hold hint, and is computed rather than
 * tracked as separate state because a delegation entry is the only durable
 * record of "already released".
 */
export function heldPlan(state: ConversationState): boolean {
  const lastOrchestrator = [...state.entries].reverse().find((e) => e.kind === 'orchestrator')
  if (lastOrchestrator?.kind !== 'orchestrator' || lastOrchestrator.phase !== 'complete') return false
  if (!/^#{1,6}\s+T\d+(?:\s|$)/m.test(lastOrchestrator.text)) return false
  const index = state.entries.indexOf(lastOrchestrator)
  return !state.entries.slice(index + 1).some((e) => e.kind === 'delegation')
}
