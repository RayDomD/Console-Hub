/**
 * The skill-running contract, shared by main, preload and renderer.
 *
 * Types only - nothing here executes. It exists because the three sides compile
 * as separate TypeScript projects: without a shared file the renderer would have
 * to import main's source to know the shape of an event, which is exactly the
 * dependency `contextIsolation` exists to prevent.
 */

/**
 * A skill button. Adding one is adding an entry to `skills[]` in
 * `console-hub.config.json` - see docs/recipes/adding-a-skill-button.md.
 */
export type SkillProvider = 'claude' | 'codex'

export interface ExecutorSettings {
  model: string
  effort: string
}

export interface SkillEntry {
  /** Stable key. Used in the runs log and as the output filename stem. */
  id: string
  /** The executor used by the button's one-click path. */
  defaultProvider: SkillProvider
  /** Per-executor defaults shown and edited in the picker. */
  executors: Record<SkillProvider, ExecutorSettings>
  /** What the button says. */
  label: string
  /** Canonical skill name; each executor adds its own invocation prefix. */
  skill: string
  /** Working directory for the run, and the directory the run is granted. */
  cwd: string
  /**
   * Whether the run may edit the target workspace. `false` runs under
   * `--permission-mode plan`; Claude may still write its own plan metadata.
   */
  writes: boolean
  /**
   * Label for an extra text field in the picker, appended to the prompt.
   * `null` keeps the button a single click.
   */
  input: string | null
}

/** Per-run overrides from the picker. Absent fields fall back to the entry's defaults. */
export interface RunOptions {
  /** Overrides the button's one-click executor for this run only. */
  provider?: SkillProvider
  model?: string
  effort?: string
  /** Appended to the prompt for skills whose config names an `input`. */
  text?: string
}

export type RunPhase = 'running' | 'done' | 'failed' | 'blocked' | 'cancelled'

export interface RunEvent {
  runId: string
  skillId: string
  provider: SkillProvider
  phase: RunPhase
  model: string
  effort: string
  /** Wall clock so far, or total once settled. */
  tookMs: number
  /** Present once a run has produced output. */
  outputPath?: string
  /** Present on `failed` and `blocked`. */
  message?: string
  costUsd?: number
  command: string
}
