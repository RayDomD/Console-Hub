/**
 * The console contract, shared by main, preload and renderer.
 *
 * Types only - nothing here executes. Same reason as `skills.ts`: the three
 * sides compile as separate TypeScript projects, and without a shared file the
 * renderer would have to import main's source to know the shape of an event.
 *
 * A console is a **shell in a pty, not an agent**. Console Hub opens it, so Console Hub
 * knows its folder - that is the whole reason consoles live here rather than in
 * Windows Terminal. Nothing in this file knows what is running inside one.
 */

/** Which configured shell a console runs. The set lives in `console-hub.config.json`. */
export type ShellId = string

export interface ConsoleAgent {
  vendor: 'codex' | 'claude' | 'agy'
  model?: string
  effort?: string
}

export type ConsoleObservedState = 'available' | 'running'

export interface ConsoleFleetEntry {
  label: string
  consoleId?: string
  agent?: ConsoleAgent
}

export interface ConsoleSpec {
  orchestrator?: boolean
  /** Set by main for this Claude process only. */
  claudeContextDirectory?: string
  agent?: ConsoleAgent
  /** Main injects this at process creation so a task cannot race terminal readiness. */
  agentPrompt?: string
  /** Which entry of the config's `shells` map to launch. Omitted uses the default. */
  shell?: ShellId
  /** Where it starts. Omitted uses the config's vault root. */
  cwd?: string
  cols?: number
  rows?: number
  /**
   * A shell command run once, before the shell becomes interactive - scoped to
   * this console only and gone when it closes. This is how a caller who does
   * know what will run inside a console (unlike this module, which never does)
   * can, say, scope a temporary shell function without writing to the user's
   * own shell config. Nothing about what the command does is visible here.
   */
  initCommand?: string
}

/** A live console, as the renderer sees it. */
export interface ConsoleInfo {
  /** Launch configuration, not a claim about settings changed inside the CLI. */
  agent?: ConsoleAgent
  id: string
  shell: ShellId
  /** The directory it was opened in. Live cwd tracking arrives with shell integration. */
  cwd: string
  pid: number
  /** Epoch ms, so it survives the structured clone across the bridge. */
  startedAt: number
  /** Observed input/turn evidence. Omitted for a plain shell. */
  observedState?: ConsoleObservedState
}

/**
 * Console events, pushed rather than polled - the same shape rule the run events
 * follow. `data` is high-frequency; everything else is rare.
 */
export type ConsoleEvent =
  | { type: 'agent-exited'; consoleId: string }
  | { type: 'task-failed'; consoleId: string; runId: string }
  | { type: 'agent-launched'; consoleId: string; agent: ConsoleAgent }
  | { type: 'activity'; consoleId: string; state: ConsoleObservedState }
  | { type: 'opened'; consoleId: string; info: ConsoleInfo }
  | { type: 'data'; consoleId: string; chunk: string }
  | { type: 'exited'; consoleId: string; exitCode: number; signal?: number }
  /**
   * Something running inside this console reported finishing a turn. This
   * module never knows what "a turn" means - it only relays the report, made
   * by whatever wired the console up with `initCommand` in the first place.
   */
  | { type: 'turn-complete'; consoleId: string }
