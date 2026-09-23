import type { MissionState } from './mission'

export interface ConsoleAssignmentState {
  targetId: string
  task: string
  launch?: string
  dependsOn?: readonly string[]
  resultPath: string
  phase: 'held' | 'dispatched' | 'completed' | 'failed' | 'stopped'
  completion?: 'hook' | 'manual' | 'file'
  error?: string
  startedAt?: number
  finishedAt?: number
}

export interface ConsoleRunState {
  error?: string
  id: string
  phase: 'dispatch' | 'complete' | 'failed' | 'stopped'
  assignments: ConsoleAssignmentState[]
  collected: boolean
}

export interface ConsoleOrchestratorStatus {
  consoleId?: string
  busy: boolean
  paused: boolean
  plan?: string
  mission?: MissionState
  error?: string
  updates: string[]
}
