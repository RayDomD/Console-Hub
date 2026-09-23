/**
 * The cooperative completion signal for a producer with no real Tier-2 hook
 * (agy, or a bare-shell command) - ADR 0051. Not guaranteed: it depends on
 * the agent actually printing the line, unlike Claude's `Stop` hook or
 * Codex's `notify`. Kept as an exact literal, never an inferred pattern
 * (cursor shape, prompt position) - the plan doc already rejected that class
 * of heuristic for idle-detection, and the same reasoning applies here.
 */

export function sentinelFor(targetId: string): string {
  return `CONSOLE_DONE:${targetId}`
}

/** Appended to a task so the instruction to signal completion travels with it, not as a separate command. */
export function withSentinelInstruction(task: string, targetId: string): string {
  return `${task}\n\nWhen this task is finished, print exactly this line as your last action: ${sentinelFor(targetId)}`
}

/** True once the exact sentinel line has appeared anywhere in the accumulated output. */
export function sentinelObserved(accumulatedOutput: string, targetId: string): boolean {
  return accumulatedOutput.includes(sentinelFor(targetId))
}
