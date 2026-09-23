import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('../../config', () => ({ fanWorkspace: vi.fn() }))

import { fanWorkspace } from '../../config'
import { listWorkspaceTree } from './tree'

const sandboxes: string[] = []

function sandbox(): string {
  const path = mkdtempSync(join(tmpdir(), 'consoleHub-tree-'))
  sandboxes.push(path)
  return path
}

afterEach(() => {
  for (const path of sandboxes.splice(0)) rmSync(path, { recursive: true, force: true })
  vi.mocked(fanWorkspace).mockReset()
})

describe('listWorkspaceTree', () => {
  it('lists one level and omits contents of nested directories', async () => {
    const root = sandbox()
    mkdirSync(join(root, 'Docs'))
    mkdirSync(join(root, 'Docs', 'nested'))
    writeFileSync(join(root, 'readme.md'), '')
    vi.mocked(fanWorkspace).mockReturnValue(root)

    const result = await listWorkspaceTree('')

    expect(result.unavailable).toBeUndefined()
    const names = result.entries.map((e) => e.name)
    expect(names).toContain('Docs')
    expect(names).toContain('readme.md')
    // nested directory's child must not appear
    expect(names).not.toContain('nested')
  })

  it('directories sort before files, each group sorted by name case-insensitively', async () => {
    const root = sandbox()
    mkdirSync(join(root, 'zebra'))
    mkdirSync(join(root, 'Apple'))
    writeFileSync(join(root, 'mango.md'), '')
    writeFileSync(join(root, 'Banana.md'), '')
    vi.mocked(fanWorkspace).mockReturnValue(root)

    const result = await listWorkspaceTree('')

    const names = result.entries.map((e) => e.name)
    expect(names.indexOf('Apple')).toBeLessThan(names.indexOf('zebra'))
    expect(names.indexOf('zebra')).toBeLessThan(names.indexOf('Banana.md'))
    expect(names.indexOf('Banana.md')).toBeLessThan(names.indexOf('mango.md'))
  })

  it('pruned directories do not appear in the listing', async () => {
    const root = sandbox()
    mkdirSync(join(root, 'node_modules'))
    mkdirSync(join(root, 'Notes'))
    vi.mocked(fanWorkspace).mockReturnValue(root)

    const result = await listWorkspaceTree('')

    const names = result.entries.map((e) => e.name)
    expect(names).not.toContain('node_modules')
    expect(names).toContain('Notes')
  })

  it('returns outside-workspace for a path with .. that escapes the root', async () => {
    const root = sandbox()
    vi.mocked(fanWorkspace).mockReturnValue(root)

    const result = await listWorkspaceTree('../escape')

    expect(result.unavailable).toBe('outside-workspace')
    expect(result.entries).toHaveLength(0)
  })

  it('returns not-a-directory for a file path', async () => {
    const root = sandbox()
    writeFileSync(join(root, 'note.md'), '')
    vi.mocked(fanWorkspace).mockReturnValue(root)

    const result = await listWorkspaceTree('note.md')

    expect(result.unavailable).toBe('not-a-directory')
    expect(result.entries).toHaveLength(0)
  })

  it('returns no-workspace when no workspace is configured', async () => {
    vi.mocked(fanWorkspace).mockReturnValue(undefined)

    const result = await listWorkspaceTree('')

    expect(result.unavailable).toBe('no-workspace')
    expect(result.entries).toHaveLength(0)
  })
})
