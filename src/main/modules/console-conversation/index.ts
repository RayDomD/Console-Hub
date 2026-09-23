/**
 * The Console Recipe's Orchestrator (ADR 0050): a second, independent
 * `OrchestratorConversation` instance that delegates to terminals instead of
 * Fan slots. See `docs/tickets.md`, "The Orchestrator drafts, holds, and
 * releases a delegation into terminals".
 */
import { OrchestratorConversation, type ConversationHarnessPort } from '../orchestrator-conversation'
import type { ConversationSettings } from '../../../shared/orchestrator-conversation'
import { parseConsoleDelegation, type TerminalAssignment } from './_internal/delegation'
import { buildConsolePrompt } from './_internal/prompt'
import { DependencySequencer } from './_internal/sequencer'
export { TerminalOrchestrator } from './_internal/terminalOrchestrator'

export { isReleaseReply, parseGoalCommand } from './_internal/release'
export { sentinelFor, sentinelObserved, withSentinelInstruction } from './_internal/sentinel'
export { DependencySequencer } from './_internal/sequencer'
export type { TerminalAssignment } from './_internal/delegation'
export { ConsoleRun } from './_internal/run'
export { ConsoleController } from './_internal/controller'
export { parseConsoleDelegation } from './_internal/delegation'
export { MISSION_DRAFT_INSTRUCTIONS, parseMissionDraft, type MissionDraftResult } from './_internal/missionDraft'
export { MissionTerminals, type AssignedSession, type MissionTerminalPorts, type MissionWorkspacePort } from './_internal/missionTerminals'
export { MissionController, type MissionControllerLike, type MissionControllerPorts } from './_internal/missionController'
export { MissionStore } from './_internal/missionStore'
export { MissionWorkspace } from './_internal/missionWorkspace'

export interface ConsoleConversationOptions {
  harness: ConversationHarnessPort
  settings: () => ConversationSettings
  load: (key: string) => unknown
  save: (file: unknown, key: string) => void
  /** Read live at the start of every turn, so the Orchestrator's own prompt names what is actually open. */
  openTargetLabels: () => readonly string[]
  targetDescriptions?: () => readonly string[]
  now?: () => number
  freshId?: () => string
}

/**
 * What releasing a plan produced. `sequencer` is live: a caller with a
 * dependent assignment to complete calls `sequencer.markDone(targetId)` once
 * its real or cooperative signal fires (or a person marks it done manually),
 * which dispatches anything that was only waiting on it.
 */
export type ReleaseResult =
  | { kind: 'released'; assignments: readonly TerminalAssignment[]; sequencer: DependencySequencer }
  | { kind: 'refused'; reason: string }

let instance: OrchestratorConversation | undefined

/**
 * The one Console Orchestrator conversation, keyed separately from the Fan's
 * (`../config`'s conversation persistence, keyed `'console'`) so the two
 * transcripts never collide.
 */
export function consoleConversation(options: ConsoleConversationOptions): OrchestratorConversation {
  instance ??= new OrchestratorConversation({
    harness: options.harness,
    settings: options.settings,
    promptOverride: (entries) => buildConsolePrompt(entries, options.openTargetLabels(), options.targetDescriptions?.()),
    load: () => options.load('console'),
    save: (file) => options.save(file, 'console'),
    ...(options.now !== undefined ? { now: options.now } : {}),
    ...(options.freshId !== undefined ? { freshId: options.freshId } : {})
  })
  return instance
}

/**
 * Releases the conversation's currently-proposed plan. Every assignment with
 * no unmet dependency is dispatched immediately; a dependent assignment is
 * held by the returned `sequencer` until the caller marks what it waits on
 * done (ADR 0051) - this function never watches a signal itself, since what
 * "done" means (a real Tier-2 hook, a sentinel line, a manual override) is a
 * main-process concern.
 *
 * `dispatchOne` is called once per assignment, exactly when it is dispatched
 * (immediately, or once its dependencies clear) - never for a held
 * assignment before then. `isWatched` tells the caller whether anything else
 * in this plan depends on the assignment being dispatched, since that is
 * what decides whether it needs to be scoped for a real completion signal
 * (claude/codex) or given a sentinel instruction (agy/bare shell) at all.
 *
 * Refuses rather than guessing when there is nothing to release, no terminal
 * to release into, or the plan could not be split one heading per open
 * terminal (including an unresolvable dependency or a cycle) - a degraded
 * Console plan dispatches nothing, unlike the Fan's whole-text fallback,
 * because typing one unsplit task into every terminal at once is never what
 * "delegate to T1" meant.
 */
export function releaseConsoleDelegation(
  conversation: OrchestratorConversation,
  dispatchOne: (assignment: TerminalAssignment, isWatched: boolean) => void,
  openTargetIds: readonly string[]
): ReleaseResult {
  const task = conversation.proposedTask()
  if (task === undefined) {
    return { kind: 'refused', reason: 'No drafted plan to release yet.' }
  }
  if (openTargetIds.length === 0) {
    return { kind: 'refused', reason: 'No terminals are open to delegate to.' }
  }

  const delegation = parseConsoleDelegation(task.delegation, openTargetIds)
  if (delegation.degraded) {
    return {
      kind: 'refused',
      reason: delegation.reason ??
        'The plan could not be split one heading per open terminal, so nothing was typed into any of them.'
    }
  }

  const { assignments } = delegation
  const watchedIds = new Set(assignments.flatMap((a) => a.dependsOn ?? []))
  const sequencer = new DependencySequencer((a) => dispatchOne(a, watchedIds.has(a.targetId)))
  sequencer.schedule(assignments)

  conversation.noteDelegation({
    runId: `console-${conversation.current().id}-${conversation.current().entries.length}`,
    assignments: assignments.map((a) => ({
      slotId: a.targetId,
      task: a.task,
      ...(a.launch !== undefined ? { launch: a.launch } : {}),
      ...(a.dependsOn !== undefined ? { dependsOn: a.dependsOn } : {})
    })),
    degraded: false
  })
  return { kind: 'released', assignments, sequencer }
}

/** Test-only: forces a fresh singleton next call. */
export function resetConsoleConversationForTests(): void {
  instance = undefined
}
