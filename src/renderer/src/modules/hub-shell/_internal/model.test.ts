import { describe, expect, it } from 'vitest'
import type { WorkspaceTreeListing } from '../../../../../shared/workspace-tree'
import {
  escapeActionFor,
  indentForPath,
  mergeTreeLevel,
  stageContentFor,
  toggleOpenLevel,
  type TreeLevels
} from './model'

const root: WorkspaceTreeListing = {
  path: '',
  entries: [{ name: 'docs', path: 'docs', directory: true }]
}

describe('hub Explorer model', () => {
  it('opens and closes only the selected directory level', () => {
    expect(toggleOpenLevel([], 'docs')).toEqual(['docs'])
    expect(toggleOpenLevel(['docs', 'src'], 'docs')).toEqual(['src'])
  })

  it('merges a fetched level without replacing previously fetched levels', () => {
    const levels: TreeLevels = { '': root }
    const merged = mergeTreeLevel(levels, {
      path: 'docs',
      entries: [{ name: 'plans', path: 'docs/plans', directory: true }]
    })

    expect(merged['']).toBe(root)
    expect(merged['docs']?.entries[0]?.path).toBe('docs/plans')
  })

  it('indents entries by their depth below the workspace root', () => {
    expect(indentForPath('docs')).toBe(8)
    expect(indentForPath('docs/plans')).toBe(24)
    expect(indentForPath('docs/plans/archive')).toBe(40)
  })
})

describe('hub stage content', () => {
  it('prompts for a Recipe when none is selected', () => {
    expect(stageContentFor(null)).toBe('prompt')
  })

  it('gives the console its own plate rather than the fan plate', () => {
    expect(stageContentFor('console')).toBe('console')
  })

  it('sends every other Recipe to the fan plate, which owns their unavailable message', () => {
    expect(stageContentFor('synthesize')).toBe('fan')
    expect(stageContentFor('explore')).toBe('fan')
    expect(stageContentFor('debate')).toBe('fan')
    expect(stageContentFor('coordinate')).toBe('fan')
    expect(stageContentFor('validate')).toBe('fan')
    expect(stageContentFor('direct')).toBe('fan')
  })
})

describe('hub Escape handling', () => {
  it('lets the first Escape in the console reach the terminal', () => {
    expect(escapeActionFor(true)).toBe('pass-to-terminal')
  })

  it('lets a second quick Escape reach the terminal without leaving the Hub', () => {
    expect(escapeActionFor(true)).toBe('pass-to-terminal')
    expect(escapeActionFor(true)).toBe('pass-to-terminal')
  })

  it('leaves the Hub immediately when focus is outside the console', () => {
    expect(escapeActionFor(true)).toBe('pass-to-terminal')
    expect(escapeActionFor(false)).toBe('return-to-rest')
  })
})
