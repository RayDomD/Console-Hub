import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateMissionPaths } from './missionPaths'

describe('Mission paths', () => {
  it('refuses the Vault as a workspace or worktree destination', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mission-boundary-'))
    try {
      await expect(validateMissionPaths(join(root, 'vault'), join(root, 'vault'), join(root, 'wt'), join(root, 'records'))).rejects.toThrow('Vault')
      await expect(validateMissionPaths(join(root, 'repo'), join(root, 'vault'), join(root, 'vault', 'wt'), join(root, 'records'))).rejects.toThrow('outside')
      await expect(validateMissionPaths(join(root, 'repo'), join(root, 'vault'), join(root, 'wt'), join(root, 'records'))).resolves.toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  })
})
