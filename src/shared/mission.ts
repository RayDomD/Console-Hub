import type { ConsoleAgent } from './consoles'

export type MissionPhase =
  | 'held' | 'queued' | 'running' | 'blocked' | 'ready_review' | 'reviewing'
  | 'integration_failed' | 'ready_apply' | 'reconciling' | 'stopped' | 'interrupted'
  | 'applied' | 'rejected'

export type MissionLanePhase = 'held' | 'running' | 'returned' | 'failed' | 'stopped'

export interface MissionLanePlan {
  id: string
  workerLabel: string
  agent: ConsoleAgent
  task: string
  files: string[]
  validation: string[]
  /** Named capabilities the worker must invoke before doing the lane. */
  skills?: string[]
  /** Small, explicit references selected by the Orchestrator from its wider context. */
  contextRefs?: string[]
  /** Artifacts or decisions the worker must return to the Orchestrator. */
  deliverables?: string[]
  /** Keep the launched agent session open for feedback and delay result.json until settled. */
  interactive?: boolean
  dependsOn?: string[]
  reinforcement?: boolean
  reviewOnly?: boolean
}

export interface MissionPlan {
  version: 1
  title: string
  workspace: string
  acceptanceCriteria: string[]
  lanes: MissionLanePlan[]
  unusedWorkers: Array<{ label: string; reason: string }>
}

export interface MissionAttemptEvidence {
  attempt: number
  vendorCompleted: boolean
  resultPath?: string
  diffPath?: string
  validationPath?: string
  changedFiles?: string[]
  summary?: string
  artifacts?: string[]
  decisions?: string[]
  unresolved?: string[]
  error?: string
  userIntervened?: boolean
}

export interface MissionLaneState extends MissionLanePlan {
  phase: MissionLanePhase
  attempt: number
  worktree?: string
  evidence: MissionAttemptEvidence[]
}

export interface MissionState {
  summaryPath?: string
  worktrees?: MissionWorktreeRecord[]
  cleanupError?: string
  id: string
  phase: MissionPhase
  plan: MissionPlan
  createdAt: number
  releasedAt?: number
  snapshotPath?: string
  integrationWorktree?: string
  integrationPatchPath?: string
  integrationValidationPath?: string
  correctionRounds: number
  destinationChanged: boolean
  lanes: MissionLaneState[]
  error?: string
}

export interface MissionWorktreeRecord {
  laneId: string
  path: string
  status: 'creating' | 'retained' | 'deleting' | 'deleted' | 'cleanup_failed'
  evidencePath?: string
  deletedAt?: number
  error?: string
}
