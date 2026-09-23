import type { ConsoleSpec } from './types'
import type { ConsoleAgent } from '../../../../../shared/consoles'

export const CONSOLE_LAUNCHERS = ['shell', 'codex', 'claude', 'agy'] as const
export type ConsoleLauncher = typeof CONSOLE_LAUNCHERS[number]

export function consoleLaunchSpec(launcher: ConsoleLauncher, workspace: string, settings?: Omit<ConsoleAgent, 'vendor'>): ConsoleSpec {
  const cwd = workspace.trim()
  return {
    ...(launcher !== 'shell' ? { agent: { vendor: launcher, ...settings } } : {}),
    ...(cwd.length > 0 ? { cwd } : {})
  }
}

/**
 * The console lineup's own small rules: how many terminals fit, and what a new
 * one is called. Kept as pure functions for the same reason `hubPanes.ts` is -
 * a limit buried in a component cannot be tested without mounting one.
 */

/** Grid readability's limit, not a cost limit - a terminal spends nothing. */
export const CONSOLE_LINEUP_MAX = 6

/** Console opens cleanly; workers exist only after the user launches them. */
const CONSOLE_LINEUP_MIN = 0

export function canAddConsole(count: number): boolean {
  return count < CONSOLE_LINEUP_MAX
}

export function canRemoveConsole(count: number): boolean {
  return count > CONSOLE_LINEUP_MIN
}

/** `T1`, `T2`, ... - a counter that never reuses a number, even after a remove. */
export function nextConsoleLabel(counter: number): string {
  return `T${counter}`
}
