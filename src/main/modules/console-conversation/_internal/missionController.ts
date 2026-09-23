import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import type { ConsoleAgent } from '../../../../shared/consoles'
import type { MissionAttemptEvidence, MissionState } from '../../../../shared/mission'
import { beginMissionReview, markMissionApplied, markMissionRejected, retryMissionLane, recordMissionIntegration, recordMissionLane, releaseMission, stopMission } from './missionState'
import { parseMissionDraft, type MissionDraftResult } from './missionDraft'
import type { AssignedSession, MissionDependencyEvidence, MissionTerminals } from './missionTerminals'
import type { MissionStore } from './missionStore'

export interface MissionControllerPorts {
  store: MissionStore
  terminals: MissionTerminals
  routePreflight?: (agents: readonly ConsoleAgent[]) => string | undefined
  freshId?: () => string
}

/** The public shape a caller (like `TerminalOrchestrator`) drives - a plain interface, so a test fake never has to be a nominal `MissionController` instance. */
export interface MissionControllerLike {
  current: () => MissionState | undefined
  hold: (text: string, workers: Record<string, ConsoleAgent | undefined>) => Promise<MissionDraftResult>
  runPlan: (workspace: string, assigned: Readonly<Record<string, AssignedSession | undefined>>, queued?: boolean) => Promise<{ error?: string }>
  recordLane: (laneId: string, evidence: MissionAttemptEvidence) => Promise<void>
  retry: (laneId: string) => Promise<void>
  stop: () => Promise<void>
  review: (workspace: string) => Promise<{ error?: string }>
  apply: (workspace: string) => Promise<{ error?: string; destinationChanged?: boolean }>
  reject: (workspace: string) => Promise<{ error?: string }>
  cleanup: (workspace: string) => Promise<Record<string, string>>
}

/**
 * Glues the pure Mission pieces (`missionState`, `missionDraft`,
 * `MissionTerminals`, `MissionStore`) into the one object a caller drives:
 * draft a plan from an Orchestrator conversation, hold it, release it into
 * worker worktrees, record lane evidence, retry, stop, and clean up. One
 * Mission is held at a time; a new draft is refused while the current one
 * is still in flight.
 */
export class MissionController {
  private state?: MissionState
  private workspace?: string
  private readonly collecting = new Set<string>()

  constructor(private readonly ports: MissionControllerPorts) {}

  current(): MissionState | undefined { return this.state ? structuredClone(this.state) : undefined }

  async restore(): Promise<MissionState | undefined> {
    const restored = await this.ports.store.loadLatest()
    if (!restored) return undefined
    this.state = restored
    this.workspace = restored.plan.workspace
    this.collecting.clear()
    this.dispatched.clear()
    this.ports.terminals.restoreWorktrees(restored.worktrees ?? [])
    return this.current()
  }

  async hold(text: string, workers: Record<string, ConsoleAgent | undefined>): Promise<MissionDraftResult> {
    if (this.state && (!['applied', 'rejected'].includes(this.state.phase) || this.state.cleanupError)) {
      return { kind: 'refused', reason: 'Finish, stop, or reject the current Mission before drafting another.' }
    }
    const id = this.ports.freshId?.() ?? randomUUID()
    const result = parseMissionDraft(id, text, workers)
    if (result.kind === 'held') {
      this.state = result.state
      this.workspace = undefined
      this.collecting.clear()
      this.dispatched.clear()
      await this.ports.store.save(this.state)
    }
    return result
  }

  /** Run plan: freezes the workspace, relaunches every lane into its worktree, and starts ready lanes. */
  async runPlan(workspace: string, assigned: Readonly<Record<string, AssignedSession | undefined>>, queued = false): Promise<{ error?: string }> {
    if (!this.state) return { error: 'No held Mission plan to release.' }
    if (this.state.phase !== 'held') return { error: 'Only a held Mission can be released.' }
    if (resolve(workspace).toLowerCase() !== resolve(this.state.plan.workspace).toLowerCase()) return { error: 'Mission workspace must match the accepted plan.' }
    const routeError = this.ports.routePreflight?.(this.state.plan.lanes.map((lane) => lane.agent))
    if (routeError) return { error: routeError }
    try {
      const { snapshot } = await this.ports.terminals.release(this.state.id, workspace, this.state.plan.lanes, assigned, async (snapshot, paths) => {
        this.state!.snapshotPath = snapshot
        this.state!.worktrees = paths
        await this.ports.store.save(this.state!)
      })
      this.workspace = workspace
      releaseMission(this.state, queued, snapshot)
      this.state.worktrees = this.ports.terminals.worktrees()
      await this.dispatchRunningLanes()
      await this.ports.store.save(this.state)
      return {}
    } catch (error) {
      this.state.worktrees = this.ports.terminals.worktrees()
      this.state.error = error instanceof Error ? error.message : String(error)
      if (this.state.worktrees.length) this.state.phase = 'stopped'
      await this.ports.store.save(this.state)
      return { error: this.state.error }
    }
  }

  async recordLane(laneId: string, evidence: MissionAttemptEvidence): Promise<void> {
    if (!this.state) return
    recordMissionLane(this.state, laneId, evidence)
    await this.dispatchRunningLanes()
    await this.ports.store.save(this.state)
    if (this.state.phase === 'ready_review' && this.workspace) await this.review(this.workspace)
  }

  async retry(laneId: string): Promise<void> {
    if (!this.state) return
    retryMissionLane(this.state, laneId)
    await this.dispatchRunningLanes()
    await this.ports.store.save(this.state)
  }

  async stop(): Promise<void> {
    if (!this.state) return
    stopMission(this.state)
    await this.ports.terminals.stop()
    await this.ports.store.save(this.state)
  }

  async review(workspace: string): Promise<{ error?: string }> {
    if (!this.state || this.state.phase !== 'ready_review' || !this.state.snapshotPath) return { error: 'Mission is not ready for review.' }
    workspace = this.workspace ?? this.state.plan.workspace
    beginMissionReview(this.state)
    try {
      const result = await this.ports.terminals.integrate(this.state.id, workspace, this.state.snapshotPath, this.state.lanes)
      this.state.integrationWorktree = result.path
      this.state.worktrees = this.ports.terminals.worktrees()
      this.state.integrationPatchPath = result.diffPath
      this.state.integrationValidationPath = result.validationPath
      recordMissionIntegration(this.state, !result.error, result.error)
      await this.ports.store.save(this.state)
      return result.error ? { error: result.error } : {}
    } catch (error) {
      this.state.worktrees = this.ports.terminals.worktrees()
      recordMissionIntegration(this.state, false, error instanceof Error ? error.message : String(error))
      await this.ports.store.save(this.state)
      return { error: this.state.error }
    }
  }

  async apply(workspace: string): Promise<{ error?: string; destinationChanged?: boolean }> {
    if (this.state?.phase === 'applied' && this.state.cleanupError) {
      try { await this.cleanup(workspace); return {} } catch (error) { return { error: String(error) } }
    }
    if (!this.state || this.state.phase !== 'ready_apply' || !this.state.snapshotPath || !this.state.integrationPatchPath) return { error: 'Mission is not ready to apply.' }
    workspace = this.workspace ?? this.state.plan.workspace
    const result = await this.ports.terminals.apply(workspace, this.state.snapshotPath, this.state.integrationPatchPath, this.state.id)
    if (result.changed) {
      this.state.phase = 'reconciling'; this.state.destinationChanged = true
      this.state.error = 'The destination changed after release. Reconciliation is validating the result against the current destination.'
      await this.ports.store.save(this.state)
      try {
        const reconciled = await this.ports.terminals.reconcile(
          this.state.id, workspace, this.state.integrationPatchPath, this.state.plan.lanes
        )
        this.state.snapshotPath = reconciled.snapshot
        this.state.integrationWorktree = reconciled.path
        this.state.worktrees = this.ports.terminals.worktrees()
        this.state.integrationPatchPath = reconciled.diffPath
        this.state.integrationValidationPath = reconciled.validationPath
        if (reconciled.error) {
          this.state.phase = 'integration_failed'
          this.state.error = `Destination reconciliation failed: ${reconciled.error}`
        } else {
          this.state.phase = 'ready_apply'
          this.state.error = 'Destination changed. The reconciled result passed validation; review it and say apply it again to confirm.'
        }
      } catch (error) {
        this.state.worktrees = this.ports.terminals.worktrees()
        this.state.phase = 'integration_failed'
        this.state.error = `Destination reconciliation failed: ${error instanceof Error ? error.message : String(error)}`
      }
      await this.ports.store.save(this.state)
      return { error: this.state.error, destinationChanged: true }
    }
    markMissionApplied(this.state)
    await this.ports.store.save(this.state)
    try { await this.cleanup(workspace); return {} } catch (error) { return { error: `Applied successfully, but cleanup failed: ${error instanceof Error ? error.message : String(error)}` } }
  }

  async reject(workspace: string): Promise<{ error?: string }> {
    if (!this.state) return { error: 'No Mission to reject.' }
    try { if (this.state.phase !== 'rejected') markMissionRejected(this.state) } catch (error) { return { error: error instanceof Error ? error.message : String(error) } }
    await this.ports.store.save(this.state)
    try { await this.cleanup(workspace); return {} } catch (error) { return { error: `Rejected, but cleanup failed: ${error instanceof Error ? error.message : String(error)}` } }
  }

  async tick(): Promise<void> {
    if (!this.state?.snapshotPath) return
    for (const lane of this.state.lanes) {
      if (lane.phase !== 'running' || this.collecting.has(lane.id)) continue
      this.collecting.add(lane.id)
      try {
        const evidence = await this.ports.terminals.collectEvidence(this.state.id, this.state.snapshotPath, lane, lane.attempt, true)
        if (evidence) await this.recordLane(lane.id, evidence)
      } finally {
        this.collecting.delete(lane.id)
      }
    }
  }

  abort(): void { this.ports.terminals.abort() }

  /** Persist recoverable patches and deletion progress only after Apply or explicit Reject. */
  async cleanup(workspace: string): Promise<Record<string, string>> {
    if (!this.state) return {}
    if (!['applied', 'rejected'].includes(this.state.phase)) throw new Error('Only applied or rejected Missions may delete worktrees.')
    workspace = this.workspace ?? this.state.plan.workspace
    try {
      if (!this.state.snapshotPath && this.ports.terminals.worktrees().length) throw new Error('Snapshot unavailable. Worktrees retained for recovery.')
      await this.ports.store.save(this.state)
      const restored = await this.ports.terminals.cleanup(workspace, this.state.plan.lanes, this.state.snapshotPath ? {
        missionId: this.state.id, snapshot: this.state.snapshotPath,
        record: async (entry) => {
          this.state!.worktrees = [...(this.state!.worktrees ?? []).filter(item => item.path !== entry.path), entry]
          await this.ports.store.save(this.state!)
        }
      } : undefined)
      delete this.state.cleanupError
      await this.ports.store.save(this.state)
      return restored
    } catch (error) {
      this.state.cleanupError = error instanceof Error ? error.message : String(error)
      await this.ports.store.save(this.state)
      throw error
    }
  }

  private readonly dispatched = new Set<string>()

  private async dispatchRunningLanes(): Promise<void> {
    if (!this.state) return
    for (const lane of this.state.lanes) {
      const key = `${lane.id}:${lane.attempt}`
      if (lane.phase !== 'running' || this.dispatched.has(key)) continue
      const dependencyEvidence = (lane.dependsOn ?? []).flatMap<MissionDependencyEvidence>((laneId) => {
        const evidence = this.state?.lanes.find((candidate) => candidate.id === laneId)?.evidence.at(-1)
        if (!evidence) return []
        return [{
          laneId,
          ...(evidence.summary ? { summary: evidence.summary } : {}),
          ...(evidence.artifacts ? { artifacts: evidence.artifacts } : {}),
          ...(evidence.decisions ? { decisions: evidence.decisions } : {}),
          ...(evidence.unresolved ? { unresolved: evidence.unresolved } : {})
        }]
      })
      await this.ports.terminals.dispatch(this.state.id, lane, lane.attempt, dependencyEvidence)
      this.dispatched.add(key)
    }
  }
}
