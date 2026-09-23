import type { ConsoleRunState, ConsoleAssignmentState } from '../../../../shared/console-run'
import type { TerminalAssignment } from './delegation'

export class ConsoleRun {
  private readonly state: ConsoleRunState

  constructor(id: string, assignments: readonly TerminalAssignment[], resultPath: (target: string) => string,
    private readonly dispatch: (assignment: ConsoleAssignmentState) => void) {
    this.state = { id, phase: 'dispatch', collected: false, assignments: assignments.map((assignment) => ({
      ...assignment, resultPath: resultPath(assignment.targetId), phase: 'held'
    })) }
  }

  snapshot(): ConsoleRunState { return structuredClone(this.state) }
  start(): void { this.advance() }
  collected(): void { this.state.collected = true }

  retry(targetId: string): void {
    if (this.state.phase === 'stopped') return
    const item = this.state.assignments.find((item) => item.targetId === targetId)
    if (item?.phase !== 'failed') return
    item.phase = 'held'
    item.error = undefined
    item.finishedAt = undefined
    this.state.collected = false
    this.state.phase = this.state.assignments.some((entry) => entry.phase === 'failed') ? 'failed' : 'dispatch'
    this.advance()
  }

  complete(targetId: string, completion: 'manual' | 'hook' | 'file'): void {
    if (this.state.phase === 'stopped') return
    const item = this.state.assignments.find((item) => item.targetId === targetId)
    if (item?.phase !== 'dispatched') return
    item.phase = 'completed'
    item.completion = completion
    item.finishedAt = Date.now()
    this.advance()
  }

  fail(targetId: string, error: string): void {
    const item = this.state.assignments.find((item) => item.targetId === targetId)
    if (!item || !['held', 'dispatched'].includes(item.phase)) return
    item.phase = 'failed'
    item.error = error
    item.finishedAt = Date.now()
    this.state.phase = 'failed'
  }

  stop(): void {
    this.state.phase = 'stopped'
    for (const item of this.state.assignments) {
      if (['held', 'dispatched'].includes(item.phase)) item.phase = 'stopped'
    }
  }

  private advance(): void {
    if (this.state.phase === 'stopped') return
    for (const item of this.state.assignments) {
      if (item.phase !== 'held' || (item.dependsOn ?? []).some((id) =>
        this.state.assignments.find((other) => other.targetId === id)?.phase !== 'completed')) continue
      item.phase = 'dispatched'
      item.startedAt = Date.now()
      try { this.dispatch({ ...item }) } catch (error) { this.fail(item.targetId, String(error)) }
    }
    if (this.state.assignments.every((item) => item.phase === 'completed')) this.state.phase = 'complete'
  }
}
