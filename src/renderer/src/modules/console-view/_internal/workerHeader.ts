import type { ConsoleAssignmentState } from '../../../../../shared/console-run'
import type { ConsoleObservedState } from '../../../../../shared/consoles'
import type { MissionLaneState } from '../../../../../shared/mission'
import type { ConsoleLauncher } from './lineup'

type MissionAssignment = MissionLaneState | { phase: 'unused'; reason: string }

interface WorkerHeaderInput {
  label: string
  launcher: ConsoleLauncher
  assignment?: ConsoleAssignmentState
  missionAssignment?: MissionAssignment
  observedState?: ConsoleObservedState
  exitCode?: number
}

/**
 * DESIGN.md's state vocabulary: a filled glyph for active or finished work, a
 * hollow one for waiting, and the broken form reserved for failure alone, so a
 * state never rests on its label or its tone by itself.
 */
const GLYPHS: Record<string, string> = {
  Running: '▮▮▮▮', Done: '▮▮▮▮', Failed: '▯▮▯▮', Idle: '▯▯▯▯'
}

/**
 * `state` is omitted rather than guessed. A plain shell reports no observed
 * state, and rendering "Available" for one would be a claim Console Hub cannot
 * back with submitted-input or turn-complete evidence.
 */
export function workerHeader(input: WorkerHeaderInput): { identity: string; assignment?: string; state?: string; glyph?: string } {
  const mission = input.missionAssignment
  const assignment = mission?.phase === 'unused'
    ? `${mission.reason} Live Workspace changes may require reconciliation.`
    : mission ? mission.task : input.assignment?.task
  const phase = mission?.phase ?? input.assignment?.phase
  const observed = input.observedState === 'running' ? 'Running' : input.observedState === 'available' ? 'Idle' : undefined
  const state = input.exitCode !== undefined ? (input.exitCode === 0 ? 'Done' : 'Failed')
    : phase === 'unused' ? 'Idle'
      : phase === 'held' ? 'Idle'
        : phase === 'dispatched' || phase === 'running' ? 'Running'
          : phase === 'returned' || phase === 'completed' ? 'Done'
            : phase === 'failed' ? 'Failed'
              : phase === 'stopped' ? 'Idle'
                : observed
  return {
    identity: `${input.label}${input.launcher === 'shell' ? '' : ` · ${input.launcher.toUpperCase()}`}`,
    ...(assignment ? { assignment: assignment.replace(/\s+/g, ' ').trim() } : {}),
    ...(state ? { state, glyph: GLYPHS[state] } : {})
  }
}
