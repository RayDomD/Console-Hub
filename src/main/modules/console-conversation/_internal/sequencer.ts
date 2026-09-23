import type { TerminalAssignment } from './delegation'

/**
 * Console Hub-sequenced dependency holding (ADR 0051): a dependent assignment is
 * dispatched only once everything it waits on is marked done - nothing inside
 * a terminal watches another terminal. Pure and IO-free on purpose: what
 * "done" means (a real Tier-2 signal, a sentinel line, or a manual override)
 * is a main-process concern this class never sees.
 */
export class DependencySequencer {
  private readonly pending = new Map<string, { assignment: TerminalAssignment; remaining: Set<string> }>()
  private readonly done = new Set<string>()

  constructor(private readonly dispatch: (assignment: TerminalAssignment) => void) {}

  /** Dispatches every assignment with no unmet dependency immediately; holds the rest. */
  schedule(assignments: readonly TerminalAssignment[]): void {
    for (const assignment of assignments) {
      const remaining = new Set((assignment.dependsOn ?? []).filter((dep) => !this.done.has(dep)))
      if (remaining.size === 0) {
        this.dispatch(assignment)
      } else {
        this.pending.set(assignment.targetId, { assignment, remaining })
      }
    }
  }

  /**
   * Marks a target done - by a real signal, a sentinel, or a manual override,
   * this class does not know or care which - and dispatches anything that was
   * only waiting on it. A repeat call for an already-done target is a no-op,
   * the same way a signal that fires twice must not release something twice.
   */
  markDone(targetId: string): void {
    if (this.done.has(targetId)) return
    this.done.add(targetId)
    for (const [id, entry] of [...this.pending.entries()]) {
      entry.remaining.delete(targetId)
      if (entry.remaining.size === 0) {
        this.pending.delete(id)
        this.dispatch(entry.assignment)
      }
    }
  }

  /** What a held target is still waiting on, or `undefined` if it was never held or already released. */
  waitingOn(targetId: string): readonly string[] | undefined {
    const entry = this.pending.get(targetId)
    return entry === undefined ? undefined : [...entry.remaining]
  }

  /** Every target still held, for a caller that wants to render "waiting" state. */
  heldTargets(): readonly string[] {
    return [...this.pending.keys()]
  }
}
