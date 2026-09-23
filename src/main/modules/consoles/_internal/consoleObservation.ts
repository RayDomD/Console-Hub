import type { ConsoleObservedState } from '../../../../shared/consoles'

const ANSI_SEQUENCE = /\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g
const CONTROL_CHARACTER = /[\x00-\x08\x0b-\x1f\x7f]/g
const CONTEXT_CHARACTER_MAX = 2_000
const CONTEXT_LINE_MAX = 24

/** Bounded runtime evidence for availability and compact Mission handoff. */
export class ConsoleObservation {
  private observedState?: ConsoleObservedState
  private output = ''

  constructor(agentBacked: boolean) {
    if (agentBacked) this.observedState = 'available'
  }

  activateAgent(): void {
    this.observedState ??= 'available'
  }

  observeInput(data: string): void {
    if (this.observedState && /[\r\n]/.test(data)) this.observedState = 'running'
  }

  observeTurnComplete(): void {
    if (this.observedState) this.observedState = 'available'
  }

  observeOutput(chunk: string): void {
    this.output = (this.output + chunk).slice(-CONTEXT_CHARACTER_MAX * 2)
  }

  state(): ConsoleObservedState | undefined {
    return this.observedState
  }

  context(): string | undefined {
    const text = this.output
      .replace(ANSI_SEQUENCE, '')
      .replace(/\r/g, '')
      .replace(CONTROL_CHARACTER, '')
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.trim().length > 0)
      .slice(-CONTEXT_LINE_MAX)
      .join('\n')
      .slice(-CONTEXT_CHARACTER_MAX)
      .trim()
    return text || undefined
  }
}
