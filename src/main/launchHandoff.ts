import type { LaunchRequest, PendingLaunch } from '../shared/launch'
export type { PendingLaunch } from '../shared/launch'

export class LaunchHandoff {
  private waiting: LaunchRequest | undefined

  constructor(
    private readonly currentWorkspace: () => string | undefined,
    private readonly missionBlocksSwitch: () => boolean,
    private readonly applyWorkspace: (workspace: string) => void,
    private readonly activate: (request: LaunchRequest) => void
  ) {}

  receive(request: LaunchRequest, warm: boolean): void {
    const incoming = request.workspace
    if (!incoming) {
      this.activate(request)
      return
    }
    if ((warm || this.missionBlocksSwitch()) && this.currentWorkspace() !== incoming) {
      this.waiting = request
      return
    }
    if (this.currentWorkspace() !== incoming) this.applyWorkspace(incoming)
    this.activate(request)
  }

  pending(): PendingLaunch | undefined {
    return this.waiting
      ? { request: this.waiting, blocked: this.missionBlocksSwitch() }
      : undefined
  }

  accept(): boolean {
    if (!this.waiting || this.missionBlocksSwitch()) return false
    const request = this.waiting
    if (request.workspace && this.currentWorkspace() !== request.workspace) {
      this.applyWorkspace(request.workspace)
    }
    this.waiting = undefined
    this.activate(request)
    return true
  }

  reject(): void {
    this.waiting = undefined
  }
}
