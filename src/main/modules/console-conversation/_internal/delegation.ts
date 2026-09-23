/**
 * Splitting the Console Orchestrator's delegation turn into one launch
 * command, one task, and an optional dependency list per terminal (ADR 0050,
 * ADR 0051).
 *
 * Follows `fan/_internal/delegation.ts`'s proven shape rather than inventing a
 * new one: a strict `### <id>` heading per target, loud degrade instead of a
 * guessed split. A terminal needs two things a Fan slot does not, both
 * carried on the heading line itself: a launch command (`### T1 — claude`,
 * D6) and, optionally, what it waits on (`### T3 — agy — waits on T1, T2`,
 * ADR 0051).
 */

export interface TerminalAssignment {
  targetId: string
  /** What the Orchestrator wants typed in first: `claude`, `codex`, `agy`, or omitted for a bare shell. */
  launch?: string
  task: string
  /** Terminals this one is held until, in the order named. Absent or empty runs immediately on release. */
  dependsOn?: readonly string[]
}

export type ConsoleDelegation =
  | { assignments: TerminalAssignment[]; degraded: false }
  | { assignments: []; degraded: true; reason?: string }

/**
 * `### T1 — claude`, `### T1`, `### T3 — agy — waits on T1, T2`, or
 * `### T3 — waits on T1, T2` (no launch). The launch segment and the "waits
 * on" segment may appear in either order after the id; each is optional.
 */
const HEADING = /^#{1,6}\s+(\S+)(.*)$/
const WAITS_ON = /^waits on\s+(.+)$/i

function parseHeadingSuffix(rest: string): { launch: string | undefined; dependsOn: string[] | undefined } {
  const segments = rest.split(/\s+—\s+/).map((s) => s.trim()).filter((s) => s.length > 0)
  let launch: string | undefined
  let dependsOn: string[] | undefined
  for (const segment of segments) {
    const waits = WAITS_ON.exec(segment)
    if (waits) {
      dependsOn = (waits[1] as string).split(',').map((s) => s.trim()).filter((s) => s.length > 0)
    } else if (launch === undefined) {
      launch = segment
    }
  }
  return { launch, dependsOn }
}

export function parseConsoleDelegation(text: string, targetIds: readonly string[]): ConsoleDelegation {
  const wanted = new Set(targetIds)
  const found: Record<string, { launch: string | undefined; dependsOn: string[] | undefined; lines: string[] }> = {}
  let current: string | undefined

  for (const line of text.split(/\r?\n/)) {
    const heading = HEADING.exec(line)
    if (heading) {
      const id = heading[1] as string
      current = wanted.has(id) ? id : undefined
      if (current !== undefined) found[current] = { ...parseHeadingSuffix((heading[2] as string) ?? ''), lines: [] }
      continue
    }
    if (current !== undefined) found[current]?.lines.push(line)
  }

  const degrade = (reason?: string): ConsoleDelegation => ({ assignments: [], degraded: true, ...(reason !== undefined ? { reason } : {}) })

  if (targetIds.length === 0) return degrade()

  const assignments: TerminalAssignment[] = []
  for (const id of targetIds) {
    const entry = found[id]
    const body = entry?.lines.join('\n').trim()
    if (entry === undefined || body === undefined || body.length === 0) {
      // Unlike the Fan, there is no whole-text fallback: typing an unsplit
      // plan into every terminal at once would run the same task on all of
      // them simultaneously, which is never what "delegate to terminal N"
      // meant. A degraded plan dispatches nothing.
      return degrade()
    }
    assignments.push({
      targetId: id,
      task: body,
      ...(entry.launch !== undefined ? { launch: entry.launch } : {}),
      ...(entry.dependsOn !== undefined && entry.dependsOn.length > 0 ? { dependsOn: entry.dependsOn } : {})
    })
  }

  for (const assignment of assignments) {
    for (const dep of assignment.dependsOn ?? []) {
      if (!wanted.has(dep)) return degrade(`${assignment.targetId} waits on ${dep}, which is not an open terminal.`)
    }
  }
  const cycle = findCycle(assignments)
  if (cycle !== undefined) return degrade(`The plan has a dependency cycle: ${cycle.join(' → ')}.`)

  return { assignments, degraded: false }
}

/** DFS cycle detection over `dependsOn` edges. Returns the cycle's path, or nothing. */
function findCycle(assignments: readonly TerminalAssignment[]): string[] | undefined {
  const edges = new Map(assignments.map((a) => [a.targetId, a.dependsOn ?? []]))
  const state = new Map<string, 'visiting' | 'done'>()
  const path: string[] = []

  function visit(id: string): string[] | undefined {
    const current = state.get(id)
    if (current === 'done') return undefined
    if (current === 'visiting') return [...path.slice(path.indexOf(id)), id]
    state.set(id, 'visiting')
    path.push(id)
    for (const dep of edges.get(id) ?? []) {
      const found = visit(dep)
      if (found !== undefined) return found
    }
    path.pop()
    state.set(id, 'done')
    return undefined
  }

  for (const id of edges.keys()) {
    const found = visit(id)
    if (found !== undefined) return found
  }
  return undefined
}
