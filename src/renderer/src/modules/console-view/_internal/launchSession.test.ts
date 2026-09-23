import { describe, expect, it } from 'vitest'
import { mostRecentAgentSession } from './launchSession'

describe('project launch session selection', () => {
  it('focuses the most recently active agent in the accepted Workspace', () => {
    const sessions = [
      { key: 'a', workspace: 'C:\\A', agent: true, activity: 2 },
      { key: 'b', workspace: 'C:\\B', agent: true, activity: 9 },
      { key: 'c', workspace: 'C:\\A', agent: true, activity: 5 },
      { key: 'd', workspace: 'C:\\A', agent: false, activity: 7 }
    ]
    expect(mostRecentAgentSession(sessions, 'C:\\A')).toBe('c')
  })

  it('returns no session when the Workspace has only plain shells', () => {
    expect(mostRecentAgentSession([{ key: 'a', workspace: 'C:\\A', agent: false, activity: 1 }], 'C:\\A')).toBeUndefined()
  })

  it('prefers the newer session when neither has received input or focus', () => {
    expect(mostRecentAgentSession([
      { key: 'old', workspace: 'C:\\A', agent: true, activity: 0 },
      { key: 'new', workspace: 'C:\\A', agent: true, activity: 0 }
    ], 'C:\\A')).toBe('new')
  })
})
