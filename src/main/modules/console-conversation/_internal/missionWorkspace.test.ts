import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { MissionWorkspace } from './missionWorkspace'

const execute = promisify(execFile)
const folders: string[] = []
const MISSION_WORKSPACE_TEST_TIMEOUT_MS = 15_000
const WINDOWS_TEMP_CLEANUP_RETRIES = 5
const WINDOWS_TEMP_CLEANUP_RETRY_DELAY_MS = 100
afterEach(async () => {
  for (const folder of folders.splice(0)) {
    await rm(folder, {
      recursive: true,
      force: true,
      maxRetries: WINDOWS_TEMP_CLEANUP_RETRIES,
      retryDelay: WINDOWS_TEMP_CLEANUP_RETRY_DELAY_MS
    })
  }
}, MISSION_WORKSPACE_TEST_TIMEOUT_MS)
async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await execute('git', ['-C', cwd, ...args], { windowsHide: true })).stdout.trim()
}

describe('Mission workspace', () => {
  it('freezes tracked and untracked changes without changing the source branch or index', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'consoleHub-mission-')); folders.push(folder)
    const repo = join(folder, 'repo'); const storage = join(folder, 'run'); const lane = join(folder, 'lane')
    await mkdir(repo); await git(repo, 'init'); await git(repo, 'config', 'user.name', 'Test'); await git(repo, 'config', 'user.email', 'test@example.com')
    await writeFile(join(repo, 'tracked.txt'), 'base'); await git(repo, 'add', '.'); await git(repo, 'commit', '-m', 'base')
    await writeFile(join(repo, 'tracked.txt'), 'dirty'); await writeFile(join(repo, 'new.txt'), 'untracked')
    const beforeStatus = await git(repo, 'status', '--porcelain'); const beforeHead = await git(repo, 'rev-parse', 'HEAD')
    const workspace = new MissionWorkspace()
    const snapshot = await workspace.freeze(repo, storage)
    expect(snapshot).not.toBe(beforeHead)
    expect(await git(repo, 'status', '--porcelain')).toBe(beforeStatus)
    expect(await git(repo, 'rev-parse', 'HEAD')).toBe(beforeHead)
    await workspace.createLane(repo, snapshot, lane)
    expect(await readFile(join(lane, 'tracked.txt'), 'utf8')).toBe('dirty')
    expect(await readFile(join(lane, 'new.txt'), 'utf8')).toBe('untracked')
    await workspace.removeLane(repo, lane)
  }, MISSION_WORKSPACE_TEST_TIMEOUT_MS)

  it('captures a binary-safe lane patch and independently runs its validation commands', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'consoleHub-mission-evidence-')); folders.push(folder)
    const repo = join(folder, 'repo'); const storage = join(folder, 'run'); const lane = join(folder, 'lane')
    await mkdir(repo); await git(repo, 'init'); await git(repo, 'config', 'user.name', 'Test'); await git(repo, 'config', 'user.email', 'test@example.com')
    await writeFile(join(repo, 'tracked.txt'), 'base'); await git(repo, 'add', '.'); await git(repo, 'commit', '-m', 'base')
    const workspace = new MissionWorkspace()
    const snapshot = await workspace.freeze(repo, storage)
    await workspace.createLane(repo, snapshot, lane)
    await writeFile(join(lane, 'tracked.txt'), 'changed')
    await writeFile(join(lane, 'new.txt'), 'new')

    const evidence = await workspace.captureLane(lane, snapshot, join(storage, 'evidence'), [
      "if ((Get-Content tracked.txt) -ne 'changed') { throw 'wrong contents' }"
    ])

    expect(evidence.changedFiles).toEqual(['new.txt', 'tracked.txt'])
    expect(await readFile(evidence.diffPath, 'utf8')).toContain('changed')
    expect(await readFile(evidence.validationPath, 'utf8')).toContain('[exit 0]')
    expect(evidence.error).toBeUndefined()
    await workspace.removeLane(repo, lane)
  }, MISSION_WORKSPACE_TEST_TIMEOUT_MS)

  it('integrates a captured patch for a new file without corrupting the patch terminator', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'consoleHub-mission-integrate-')); folders.push(folder)
    const repo = join(folder, 'repo'); const storage = join(folder, 'run'); const lane = join(folder, 'lane'); const integration = join(folder, 'integration')
    await mkdir(repo); await git(repo, 'init'); await git(repo, 'config', 'user.name', 'Test'); await git(repo, 'config', 'user.email', 'test@example.com')
    await writeFile(join(repo, 'tracked.txt'), 'base'); await git(repo, 'add', '.'); await git(repo, 'commit', '-m', 'base')
    const workspace = new MissionWorkspace()
    const snapshot = await workspace.freeze(repo, storage)
    await workspace.createLane(repo, snapshot, lane)
    await writeFile(join(lane, 'new.txt'), 'new file\n')

    const evidence = await workspace.captureLane(lane, snapshot, join(storage, 'evidence'), [])
    const combined = await workspace.integrate(repo, snapshot, integration, [evidence.diffPath], join(storage, 'combined'), [])

    expect(combined.changedFiles).toEqual(['new.txt'])
    expect((await readFile(join(integration, 'new.txt'), 'utf8')).replace(/\r\n/g, '\n')).toBe('new file\n')
    await workspace.removeLane(repo, lane)
    await workspace.removeLane(repo, integration)
  }, MISSION_WORKSPACE_TEST_TIMEOUT_MS)
})
