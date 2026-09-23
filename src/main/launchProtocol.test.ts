import { describe, expect, it } from 'vitest'
import { parseLaunchUrl } from './launchProtocol'

const workspace = 'C:\\FIles\\Studybuddy'
const encodedWorkspace = encodeURIComponent(workspace)
const directoryExists = (path: string): boolean => path === workspace

describe('consolehub launch protocol', () => {
  it('accepts a generic launch without an agent', () => {
    expect(parseLaunchUrl('consolehub://launch/v1', directoryExists)).toEqual({ action: 'open' })
  })

  it('accepts an encoded existing Workspace for a project handoff', () => {
    expect(parseLaunchUrl(`consolehub://launch/v1?workspace=${encodedWorkspace}&action=project`, directoryExists))
      .toEqual({ action: 'project', workspace })
  })

  it.each([
    'consolehub://launch/v2',
    'consolehub://other/v1',
    'consolehub://launch/v1?workspace=relative&action=project',
    'consolehub://launch/v1?action=project',
    `consolehub://launch/v1?workspace=${encodedWorkspace}&workspace=${encodedWorkspace}`,
    `consolehub://launch/v1?workspace=${encodedWorkspace}&model=sonnet`,
    `consolehub://launch/v1?workspace=${encodedWorkspace}&action=project#fragment`,
    `consolehub://launch/v1?workspace=C%3A%5Cmissing&action=project`
  ])('rejects unsupported or invalid payload %s', (url) => {
    expect(parseLaunchUrl(url, directoryExists)).toBeUndefined()
  })
})
