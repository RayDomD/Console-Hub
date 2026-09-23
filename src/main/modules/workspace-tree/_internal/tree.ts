import { readdir, realpath, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { PRUNED_DIRECTORIES } from './pruning'
import { fanWorkspace } from '../../config'
import type { WorkspaceTreeEntry, WorkspaceTreeListing } from '../../../../shared/workspace-tree'

export async function listWorkspaceTree(path = ''): Promise<WorkspaceTreeListing> {
  const workspaceRoot = fanWorkspace()
  if (workspaceRoot === undefined) {
    return { path, entries: [], unavailable: 'no-workspace' }
  }

  // Resolve both sides to real paths so symlinks and `..` segments cannot escape the root.
  const realRoot = await realpath(workspaceRoot)
  // The trailing separator ensures a sibling whose name merely starts with the
  // root's name is never mistaken for a child.
  const rootPrefix = realRoot.endsWith(sep) ? realRoot : realRoot + sep

  // join() already normalises `..` segments lexically, letting us detect an
  // escape before touching the filesystem — important when the escaped path does
  // not exist and realpath would throw.
  const abs = join(workspaceRoot, path)
  const rawRootPrefix = workspaceRoot.endsWith(sep) ? workspaceRoot : workspaceRoot + sep
  if (abs !== workspaceRoot && !abs.startsWith(rawRootPrefix)) {
    // Purely lexical escape: `../sibling` with no symlink involved.
    return { path, entries: [], unavailable: 'outside-workspace' }
  }

  let realAbs: string
  try {
    realAbs = await realpath(abs)
  } catch {
    // Path doesn't exist on disk.
    return { path, entries: [], unavailable: 'not-a-directory' }
  }

  // A symlink that resolves outside the root is also an escape.
  if (realAbs !== realRoot && !realAbs.startsWith(rootPrefix)) {
    return { path, entries: [], unavailable: 'outside-workspace' }
  }

  let entries: import('node:fs').Dirent<string>[]
  try {
    entries = await readdir(abs, { withFileTypes: true })
  } catch {
    return { path, entries: [], unavailable: 'not-a-directory' }
  }

  // Confirm the resolved path is actually a directory (readdir can succeed on a
  // junction point that resolves to a file on some platforms; stat is the truth).
  const absStats = await stat(abs)
  if (!absStats.isDirectory()) {
    return { path, entries: [], unavailable: 'not-a-directory' }
  }

  const dirs: WorkspaceTreeEntry[] = []
  const files: WorkspaceTreeEntry[] = []

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (entry.isDirectory() && PRUNED_DIRECTORIES.has(entry.name)) continue

    // Compute relative path using forward slashes on every platform.
    const rel = relative(workspaceRoot, join(abs, entry.name)).replaceAll('\\', '/')
    const item: WorkspaceTreeEntry = { name: entry.name, path: rel, directory: entry.isDirectory() }

    if (entry.isDirectory()) {
      dirs.push(item)
    } else if (entry.isFile()) {
      files.push(item)
    } else if (entry.isSymbolicLink()) {
      // Resolve to know whether the link target is a directory or file.
      try {
        const linked = await stat(join(abs, entry.name))
        const linkedItem: WorkspaceTreeEntry = { name: entry.name, path: rel, directory: linked.isDirectory() }
        if (linked.isDirectory()) dirs.push(linkedItem)
        else files.push(linkedItem)
      } catch {
        // Broken symlink — skip it.
      }
    }
  }

  const byName = (a: WorkspaceTreeEntry, b: WorkspaceTreeEntry) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

  dirs.sort(byName)
  files.sort(byName)

  return { path, entries: [...dirs, ...files] }
}

