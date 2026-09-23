/**
 * Tier-2 turn reporting: a console running `claude` or `codex` interactively
 * can report its own turn finishing back to Console Hub, in real time, without
 * Console Hub inferring it from output. See ADR 0051 and `docs/tickets.md`.
 */
import { reportTurnComplete, shellKindOf, type ShellKind } from '../consoles'
import { writeClaudeSettingsFile, writeCodexNotifierScript } from './_internal/notifier'
import { startTurnSignalServer } from './_internal/server'
import { turnSignalInitCommand, type TurnSignalVendor } from './_internal/initCommand'

export type { TurnSignalVendor } from './_internal/initCommand'
export { checkClaudeSettingsFlag, checkCodexConfigFlag, type FlagCheckResult } from './_internal/flagCheck'
export { stopTurnSignalServer } from './_internal/server'
export { shellKindOf, type ShellKind }

/**
 * The `initCommand` to open a console with, so that typing `claude` or
 * `codex` inside it carries the extra flag and reports its own completion.
 * Starts the local listener on first call; every later call reuses the same
 * port. Wires straight into `consoles.reportTurnComplete`, so a caller only
 * needs this one function to get a working `turn-complete` event later.
 */
export async function turnSignalInitCommandFor(
  vendor: TurnSignalVendor,
  shellBin: string,
  consoleId: string
): Promise<string> {
  const port = await startTurnSignalServer(reportTurnComplete)
  const claudeSettingsPath = vendor === 'claude' ? writeClaudeSettingsFile(port, consoleId) : ''
  const codexNotifierPath = vendor === 'codex' ? writeCodexNotifierScript(port, consoleId) : ''
  return turnSignalInitCommand(vendor, shellKindOf(shellBin), claudeSettingsPath, codexNotifierPath)
}
