import { execFile } from 'node:child_process'
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { promisify } from 'node:util'

const execute = promisify(execFile)

async function gitRaw(workspace: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string> {
  const result = await execute('git', ['-C', workspace, ...args], {
    env: { ...process.env, ...env }, windowsHide: true, maxBuffer: 4 * 1024 * 1024
  })
  return result.stdout
}

async function git(workspace: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string> {
  return (await gitRaw(workspace, args, env)).trim()
}

/** Creates ref-less snapshot commits; the user's index and branch are never changed. */
export class MissionWorkspace {
  constructor(private readonly validationCommand?: (cwd: string, storage: string, command: string) => Promise<{ bin: string; args: string[] }>) {}
  async freeze(workspace: string, storage: string): Promise<string> {
    const root = await git(workspace, ['rev-parse', '--show-toplevel'])
    const head = await git(root, ['rev-parse', 'HEAD'])
    const indexName = await git(root, ['rev-parse', '--git-path', 'index'])
    const sourceIndex = isAbsolute(indexName) ? indexName : resolve(root, indexName)
    const temporaryIndex = join(storage, 'snapshot.index')
    await mkdir(dirname(temporaryIndex), { recursive: true })
    await copyFile(sourceIndex, temporaryIndex)
    const snapshotEnv = {
      GIT_INDEX_FILE: temporaryIndex,
      GIT_AUTHOR_NAME: 'Console Hub', GIT_AUTHOR_EMAIL: 'console-hub@local',
      GIT_COMMITTER_NAME: 'Console Hub', GIT_COMMITTER_EMAIL: 'console-hub@local'
    }
    try {
      await git(root, ['add', '-A'], snapshotEnv)
      const tree = await git(root, ['write-tree'], snapshotEnv)
      return await git(root, ['commit-tree', tree, '-p', head, '-m', 'Console Hub Mission Run Snapshot'], snapshotEnv)
    } finally {
      await rm(temporaryIndex, { force: true })
    }
  }

  async createLane(workspace: string, snapshot: string, path: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true })
    await git(workspace, ['worktree', 'add', '--detach', path, snapshot])
  }

  async removeLane(workspace: string, path: string): Promise<void> {
    await git(workspace, ['worktree', 'remove', '--force', path])
  }

  async captureLane(worktree: string, snapshot: string, storage: string, validation: readonly string[]): Promise<{
    diffPath: string
    validationPath: string
    changedFiles: string[]
    error?: string
  }> {
    await mkdir(storage, { recursive: true })
    const indexName = await git(worktree, ['rev-parse', '--git-path', 'index'])
    const sourceIndex = isAbsolute(indexName) ? indexName : resolve(worktree, indexName)
    const temporaryIndex = join(storage, 'capture.index')
    const diffPath = join(storage, 'changes.patch')
    const validationPath = join(storage, 'validation.txt')
    await copyFile(sourceIndex, temporaryIndex)
    try {
      const captureEnv = { GIT_INDEX_FILE: temporaryIndex }
      await git(worktree, ['add', '-A'], captureEnv)
      const names = await gitRaw(worktree, ['diff', '--cached', '--name-only', '-z', snapshot, '--'], captureEnv)
      const changedFiles = names.split('\0').filter(Boolean).map((file) => file.replace(/\\/g, '/')).sort()
      const diff = await gitRaw(worktree, ['diff', '--cached', '--binary', snapshot, '--'], captureEnv)
      await writeFile(diffPath, diff, 'utf8')

      const log: string[] = []
      let error: string | undefined
      for (const command of validation) {
        log.push(`> ${command}`)
        try {
          const invocation = this.validationCommand ? await this.validationCommand(worktree, storage, command)
            : { bin: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', command] }
          const result = await execute(invocation.bin, invocation.args, {
            cwd: worktree, windowsHide: true, maxBuffer: 16 * 1024 * 1024
          })
          if (result.stdout) log.push(result.stdout.trimEnd())
          if (result.stderr) log.push(result.stderr.trimEnd())
          log.push('[exit 0]')
        } catch (caught) {
          const failure = caught as Error & { stdout?: string; stderr?: string; code?: number | string }
          if (failure.stdout) log.push(failure.stdout.trimEnd())
          if (failure.stderr) log.push(failure.stderr.trimEnd())
          log.push(`[exit ${failure.code ?? 1}]`)
          error = `Validation failed: ${command}`
          break
        }
      }
      await writeFile(validationPath, log.join('\n') + '\n', 'utf8')
      return { diffPath, validationPath, changedFiles, ...(error ? { error } : {}) }
    } finally {
      await rm(temporaryIndex, { force: true })
    }
  }

  async integrate(workspace: string, snapshot: string, path: string, patches: readonly string[], storage: string, validation: readonly string[]) {
    await this.createLane(workspace, snapshot, path)
    for (const patch of patches) await git(path, ['apply', '--binary', patch])
    return this.captureLane(path, snapshot, storage, validation)
  }

  async apply(workspace: string, snapshot: string, patchPath: string, storage: string): Promise<{ changed: boolean }> {
    const current = await this.freeze(workspace, storage)
    const [expectedTree, currentTree] = await Promise.all([
      git(workspace, ['rev-parse', `${snapshot}^{tree}`]),
      git(workspace, ['rev-parse', `${current}^{tree}`])
    ])
    if (expectedTree !== currentTree) return { changed: true }
    await git(workspace, ['apply', '--binary', patchPath])
    return { changed: false }
  }
}
