export interface LaunchSession {
  key: string
  workspace: string
  agent: boolean
  activity: number
}

export function mostRecentAgentSession(sessions: readonly LaunchSession[], workspace: string): string | undefined {
  return sessions.reduce<LaunchSession | undefined>((latest, session) =>
    session.agent && session.workspace.toLowerCase() === workspace.toLowerCase() && (!latest || session.activity >= latest.activity)
      ? session : latest, undefined)?.key
}
