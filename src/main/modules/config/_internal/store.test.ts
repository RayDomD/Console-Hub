import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, unlinkSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const location = vi.hoisted(() => ({ path: '' }))
vi.mock('electron', () => ({ app: { getPath: () => location.path } }))
import {
  configPath,
  loadConfig,
  reloadConfig,
  fanWorkspace,
  saveWorkspace,
  flushWorkspace,
  conversationPath,
  loadConversation,
  saveConversation,
  resolveSkill
} from './store'

beforeEach(() => {
  location.path = mkdtempSync(join(tmpdir(), 'console-hub-config-test-'))
  reloadConfig()
})
afterEach(() => {
  flushWorkspace()
  unlinkSync(configPath())
  rmdirSync(location.path)
})

describe('fan workspace', () => {
  it('opens with no workspace when nothing is stored', () => {
    expect(fanWorkspace()).toBeUndefined()
  })

  it('accepts a typed path that exists and is a directory, and it survives a reload', () => {
    const dir = mkdtempSync(join(tmpdir(), 'consoleHub-workspace-test-'))
    try {
      expect(saveWorkspace(dir)).toEqual({ workspace: dir })
      flushWorkspace()
      reloadConfig()
      expect(fanWorkspace()).toBe(dir)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reports a path that does not exist in words, and does not change the workspace', () => {
    const dir = mkdtempSync(join(tmpdir(), 'consoleHub-workspace-test-'))
    try {
      saveWorkspace(dir)
      const missing = join(dir, 'does-not-exist')
      const result = saveWorkspace(missing)
      expect(result.error).toMatch(/does not exist/i)
      expect(result.workspace).toBeUndefined()
      expect(fanWorkspace()).toBe(dir)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects a path that exists but is a file, not a directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'consoleHub-workspace-test-'))
    try {
      const filePath = join(dir, 'a-file.txt')
      writeFileSync(filePath, 'x')
      const result = saveWorkspace(filePath)
      expect(result.error).toBeDefined()
      expect(result.workspace).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('clears the workspace when the typed path is empty, which is not an error', () => {
    const dir = mkdtempSync(join(tmpdir(), 'consoleHub-workspace-test-'))
    try {
      saveWorkspace(dir)
      expect(fanWorkspace()).toBe(dir)
      const result = saveWorkspace('')
      expect(result).toEqual({ workspace: undefined })
      expect(fanWorkspace()).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('falls back to no workspace, not a refusal to open, when the stored path no longer exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'consoleHub-workspace-test-'))
    saveWorkspace(dir)
    flushWorkspace()
    rmSync(dir, { recursive: true, force: true })
    reloadConfig()
    expect(fanWorkspace()).toBeUndefined()
  })

  it('falls back to no workspace when the stored value is not a string', () => {
    const dir = mkdtempSync(join(tmpdir(), 'consoleHub-workspace-test-'))
    try {
      saveWorkspace(dir)
      flushWorkspace()
      const config = loadConfig()
      ;(config as unknown as { fanWorkspace: unknown }).fanWorkspace = 42
      expect(fanWorkspace()).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('conversation persistence is keyed', () => {
  const cleanup: string[] = []
  afterEach(() => {
    for (const path of cleanup.splice(0)) rmSync(path, { force: true })
  })

  it('the default key keeps the original unkeyed filename', () => {
    expect(conversationPath()).toBe(conversationPath('fan'))
    expect(conversationPath('fan')).toMatch(/orchestrator-conversation\.json$/)
  })

  it('a different key gets its own filename', () => {
    expect(conversationPath('console')).toMatch(/orchestrator-conversation-console\.json$/)
    expect(conversationPath('console')).not.toBe(conversationPath('fan'))
  })

  it('two keys persist independently, neither clobbering the other', () => {
    cleanup.push(conversationPath('fan'), conversationPath('console'))

    saveConversation({ marker: 'fan-transcript' })
    saveConversation({ marker: 'console-transcript' }, 'console')

    expect(loadConversation()).toEqual({ marker: 'fan-transcript' })
    expect(loadConversation('console')).toEqual({ marker: 'console-transcript' })
  })

  it('an unwritten key reads as no conversation, not the default key\'s file', () => {
    cleanup.push(conversationPath('fan'))
    saveConversation({ marker: 'fan-only' })
    expect(loadConversation('console')).toBeUndefined()
  })
})

describe('Mission skill roots', () => {
  it('writes the default roots into a legacy config on reload', () => {
    const legacy = { ...loadConfig(), skillRoots: undefined }
    writeFileSync(configPath(), JSON.stringify(legacy), 'utf8')
    reloadConfig()

    expect(loadConfig().skillRoots.length).toBeGreaterThan(0)
    expect(JSON.parse(readFileSync(configPath(), 'utf8')).skillRoots).toEqual(loadConfig().skillRoots)
    expect(JSON.parse(readFileSync(configPath(), 'utf8')).defaultLaunchAgent).toEqual({ vendor: 'claude' })
  })

  it('writes the new launch default into migrated config while preserving existing roots', () => {
    const legacy = { ...loadConfig(), defaultLaunchAgent: undefined }
    writeFileSync(configPath(), JSON.stringify(legacy), 'utf8')
    reloadConfig()
    expect(JSON.parse(readFileSync(configPath(), 'utf8')).defaultLaunchAgent).toEqual({ vendor: 'claude' })
  })

  it('resolves a named SKILL.md from configured roots', () => {
    const root = mkdtempSync(join(tmpdir(), 'consoleHub-skill-root-'))
    try {
      const folder = join(root, 'ui-preview')
      mkdirSync(folder)
      writeFileSync(join(folder, 'SKILL.md'), '# UI Preview\nFollow it.', 'utf8')
      loadConfig().skillRoots = [root]

      expect(resolveSkill('ui-preview')).toEqual({ sourceDirectory: folder, instructions: '# UI Preview\nFollow it.' })
      expect(resolveSkill('../outside')).toBeUndefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
