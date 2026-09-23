import type { MissionAttemptEvidence, MissionPlan, MissionState } from '../../../../shared/mission'
import { isFilesystemSkillName } from '../../../../shared/skill-name'

export const MISSION_LANE_MAX = 6

export function createMissionState(id: string, plan: MissionPlan, now = Date.now()): MissionState {
  if (!plan.acceptanceCriteria.length) throw new Error('Mission requires acceptance criteria')
  if (!plan.lanes.length || plan.lanes.length > MISSION_LANE_MAX) throw new Error('Mission requires one to six lanes')
  const ids = new Set(plan.lanes.map((lane) => lane.id))
  if (ids.size !== plan.lanes.length) throw new Error('Mission lane ids must be unique')
  const workers = new Set(plan.lanes.map((lane) => lane.workerLabel))
  if (workers.size !== plan.lanes.length) throw new Error('One Mission worker may own only one lane')
  for (const lane of plan.lanes) {
    if (!lane.files.length && !lane.reviewOnly) throw new Error(`${lane.id} requires an approved file set`)
    if (!lane.validation.length && !lane.reviewOnly) throw new Error(`${lane.id} requires validation commands`)
    if (lane.skills?.some((skill) => !isFilesystemSkillName(skill))) throw new Error(`${lane.id} has an invalid skill name`)
    for (const dependency of lane.dependsOn ?? []) if (!ids.has(dependency) || dependency === lane.id) throw new Error(`${lane.id} has an invalid dependency`)
  }
  const dependencies = new Map(plan.lanes.map((lane) => [lane.id, lane.dependsOn ?? []]))
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error('Mission lane dependency cycle detected')
    if (visited.has(id)) return
    visiting.add(id)
    for (const dependency of dependencies.get(id) ?? []) visit(dependency)
    visiting.delete(id)
    visited.add(id)
  }
  for (const id of ids) visit(id)
  return {
    id, phase: 'held', plan: structuredClone(plan), createdAt: now,
    correctionRounds: 0, destinationChanged: false,
    lanes: plan.lanes.map((lane) => ({ ...structuredClone(lane), phase: 'held', attempt: 0, evidence: [] }))
  }
}

export function releaseMission(state: MissionState, queued: boolean, snapshotPath: string, now = Date.now()): void {
  if (state.phase !== 'held') throw new Error('Only a held Mission can be released')
  state.phase = queued ? 'queued' : 'running'
  state.snapshotPath = snapshotPath
  state.releasedAt = now
  if (!queued) dispatchReadyLanes(state)
}

export function startQueuedMission(state: MissionState): void {
  if (state.phase !== 'queued') throw new Error('Mission is not queued')
  state.phase = 'running'
  dispatchReadyLanes(state)
}

export function recordMissionLane(state: MissionState, laneId: string, evidence: MissionAttemptEvidence): void {
  const lane = state.lanes.find((item) => item.id === laneId)
  if (!lane || lane.phase !== 'running' || evidence.attempt !== lane.attempt) return
  lane.evidence.push(structuredClone(evidence))
  const filesInScope = evidence.changedFiles?.every((file) => lane.files.includes(file)) ?? false
  const returned = evidence.vendorCompleted && !!evidence.resultPath && !!evidence.validationPath &&
    (lane.reviewOnly || (!!evidence.diffPath && !!evidence.changedFiles?.length && filesInScope)) && !evidence.error
  lane.phase = returned ? 'returned' : 'failed'
  if (!returned && !lane.evidence.at(-1)?.error) lane.evidence[lane.evidence.length - 1]!.error = 'Lane evidence is incomplete or outside its approved file set'
  advanceMission(state)
}

export function retryMissionLane(state: MissionState, laneId: string): void {
  const lane = state.lanes.find((item) => item.id === laneId)
  if (!lane || lane.phase !== 'failed') throw new Error('Only a failed Mission lane can be retried')
  lane.phase = 'held'
  state.phase = 'running'
  dispatchReadyLanes(state)
}

export function stopMission(state: MissionState): void {
  if (['applied', 'rejected'].includes(state.phase)) return
  for (const lane of state.lanes) if (lane.phase === 'running' || lane.phase === 'held') lane.phase = 'stopped'
  state.phase = 'stopped'
}

export function interruptMission(state: MissionState): void {
  if (['applied', 'rejected'].includes(state.phase)) return
  for (const lane of state.lanes) if (lane.phase === 'running') lane.phase = 'stopped'
  state.phase = 'interrupted'
}

export function beginMissionReview(state: MissionState): void {
  if (state.phase !== 'ready_review') throw new Error('Mission is not ready for review')
  state.phase = 'reviewing'
}

export function recordMissionIntegration(state: MissionState, passed: boolean, error?: string): void {
  if (state.phase !== 'reviewing') throw new Error('Mission is not being reviewed')
  if (passed) { state.phase = 'ready_apply'; state.error = undefined; return }
  state.correctionRounds += 1
  state.error = error ?? 'Combined Mission validation failed'
  state.phase = 'integration_failed'
}

export function markMissionApplied(state: MissionState): void {
  if (state.phase !== 'ready_apply') throw new Error('Mission is not ready to apply')
  state.phase = 'applied'
}

export function markMissionRejected(state: MissionState): void {
  if (!['held', 'blocked', 'integration_failed', 'ready_apply', 'ready_review', 'reconciling', 'stopped', 'interrupted'].includes(state.phase)) throw new Error('Mission cannot be rejected in its current phase')
  state.phase = 'rejected'
}

function dispatchReadyLanes(state: MissionState): void {
  for (const lane of state.lanes) {
    if (lane.phase !== 'held') continue
    if ((lane.dependsOn ?? []).some((id) => state.lanes.find((item) => item.id === id)?.phase !== 'returned')) continue
    lane.phase = 'running'
    lane.attempt += 1
  }
}

function advanceMission(state: MissionState): void {
  if (state.lanes.some((lane) => lane.phase === 'failed')) { state.phase = 'blocked'; return }
  dispatchReadyLanes(state)
  state.phase = state.lanes.every((lane) => lane.phase === 'returned') ? 'ready_review' : 'running'
}
