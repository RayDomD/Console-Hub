export type LaunchRequest =
  | { action: 'open'; workspace?: string }
  | { action: 'project'; workspace: string }

export interface PendingLaunch {
  request: LaunchRequest
  blocked: boolean
}

export interface ActivatedLaunch {
  sequence: number
  request: LaunchRequest
}
