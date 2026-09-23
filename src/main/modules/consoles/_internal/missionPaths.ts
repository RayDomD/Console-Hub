import { realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, parse, relative } from 'node:path'

export function overlaps(a: string, b: string): boolean {
  const inside = (root: string, path: string) => {
    const rel = relative(root, path)
    return !rel || (!rel.startsWith('..') && !isAbsolute(rel))
  }
  return inside(a, b) || inside(b, a)
}

/** Resolve existing ancestors as well as the final path, including Windows junctions. */
export async function canonicalPath(path: string): Promise<string> {
  if (!isAbsolute(path)) throw new Error('Mission paths must be absolute.')
  try { return await realpath(path) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    if (dirname(path) === path) throw error
    return join(await canonicalPath(dirname(path)), path.slice(dirname(path).length).replace(/^[/\\]+/, ''))
  }
}

export async function validateMissionPaths(workspace: string, vault: string, worktrees: string, records: string): Promise<void> {
  const [source, protectedRoot, treeRoot, recordRoot] = await Promise.all([
    canonicalPath(workspace), canonicalPath(vault), canonicalPath(worktrees), canonicalPath(records)
  ])
  if (overlaps(source, protectedRoot)) throw new Error('The Vault cannot overlap the Mission workspace.')
  for (const root of [treeRoot, recordRoot]) {
    if (root === parse(root).root || overlaps(root, source) || overlaps(root, protectedRoot)) {
      throw new Error('Mission storage must be outside the source repository and Vault, and cannot be a drive root.')
    }
  }
  if (overlaps(treeRoot, recordRoot)) throw new Error('Worktrees and permanent Mission records must use separate roots.')
}
