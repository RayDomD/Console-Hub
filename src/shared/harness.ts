/**
 * The harnessed-run contract, shared by main, preload and renderer.
 *
 * Types only - nothing here executes. It exists because the three sides compile
 * as separate TypeScript projects: without a shared file the renderer would have
 * to import main's source to know the shape of an event, which is exactly the
 * dependency `contextIsolation` exists to prevent.
 */

export type HarnessVendor = 'claude' | 'codex' | 'agy'
export type HarnessPhase = 'running' | 'partial' | 'completed' | 'faulted' | 'cancelled'

/**
 * Phase 1 scopes are both read-only at the process level. For DOCS, Console Hub
 * writes the returned text itself, so the agent needs no write tools and
 * Console Hub does not have to verify which paths the agent might touch.
 */
export type HarnessScope = 'NONE' | 'DOCS'

export interface HarnessUsage {
  inputTokens?: number
  cachedInputTokens?: number
  cacheWriteInputTokens?: number
  cacheCreationInputTokens?: number
  cacheReadInputTokens?: number
  outputTokens?: number
  reasoningOutputTokens?: number
  costUsd?: number
  tokensPerSecond?: number
}

export type HarnessFault =
  | {
      kind: 'process_crash'
      message: string
      diagnosticOutput: string
    }
  | {
      kind: 'quota'
      message: string
    }
  | {
      kind: 'stream_invalid'
      message: string
      rawOutput: string
    }

export type HarnessFaultKind = HarnessFault['kind']

interface HarnessEventBase {
  runId: string
  vendor: HarnessVendor
  tookMs: number
}

export interface HarnessRunningEvent extends HarnessEventBase {
  phase: 'running'
}

/** Text observed before the vendor's terminal turn boundary. Diagnostic until completion. */
export interface HarnessPartialEvent extends HarnessEventBase {
  phase: 'partial'
  text: string
  sessionId?: string
  usage?: HarnessUsage
}

export interface HarnessCompletedEvent extends HarnessEventBase {
  phase: 'completed'
  text: string
  sessionId?: string
  usage?: HarnessUsage
}

export interface HarnessFaultedEvent extends HarnessEventBase {
  phase: 'faulted'
  sessionId?: string
  usage?: HarnessUsage
  fault: HarnessFault
}

export interface HarnessCancelledEvent extends HarnessEventBase {
  phase: 'cancelled'
  sessionId?: string
  usage?: HarnessUsage
}

export type HarnessEvent =
  | HarnessRunningEvent
  | HarnessPartialEvent
  | HarnessCompletedEvent
  | HarnessFaultedEvent
  | HarnessCancelledEvent

export interface HarnessRunOptions {
  vendor: HarnessVendor
  prompt: string
  cwd?: string
  scope?: HarnessScope
  model?: string
  effort?: string
}
