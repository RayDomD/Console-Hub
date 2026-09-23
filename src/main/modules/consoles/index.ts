/**
 * Consoles. Shells in a pty, opened and owned by Console Hub.
 */
export {
  openConsole,
  restartConsole,
  setConsoleAgent,
  consoleContext,
  listConsoles,
  writeConsole,
  resizeConsole,
  closeConsole,
  closeAll,
  onConsoleEvent,
  reportConsoleOutput,
  reportTurnComplete
} from './_internal/registry'
export { shellKindOf, type ShellKind } from './_internal/shellInit'
export { agentCommand, configuredAgentBinary } from './_internal/agentCommand'
export { validateMissionPaths } from './_internal/missionPaths'
export { shellTaskCommand, shellScriptCommand, withAgentExit } from './_internal/taskCommands'
export type { ConsoleEvent, ConsoleInfo, ConsoleSpec } from '../../../shared/consoles'
