import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { importLegacyHubState } from './migration'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function folders(): { legacy: string; hub: string } {
  const root = mkdtempSync(join(tmpdir(), 'hub-migration-'))
  roots.push(root)
  const legacy = join(root, 'Cockpit')
  const hub = join(root, 'Console Hub')
  mkdirSync(legacy)
  mkdirSync(hub)
  return { legacy, hub }
}

describe('legacy Hub state import', () => {
  it('copies Hub fields, conversations and records once without changing the source', () => {
    const { legacy, hub } = folders()
    const source = { vaultRoot: 'C:\\Vault', fanWorkspace: 'C:\\Work', corpusRoots: ['private'], skills: [] }
    writeFileSync(join(legacy, 'cockpit.config.json'), JSON.stringify(source))
    writeFileSync(join(legacy, 'orchestrator-conversation.json'), JSON.stringify({ turns: [] }))
    const mission = join(legacy, 'runs', 'mission', 'missions', 'm1')
    mkdirSync(mission, { recursive: true })
    writeFileSync(join(mission, 'run.json'), JSON.stringify({ id: 'm1', createdAt: 1, phase: 'held', lanes: [], summaryPath: join(mission, 'plan.md') }))
    writeFileSync(join(mission, 'plan.md'), '# Source')
    const before = readFileSync(join(mission, 'run.json'), 'utf8')

    const receipt = importLegacyHubState(legacy, hub)
    expect(receipt.copied).toContain('cockpit.config.json')
    expect(JSON.parse(readFileSync(join(hub, 'console-hub.config.json'), 'utf8'))).toMatchObject({ vaultRoot: 'C:\\Vault', fanWorkspace: 'C:\\Work' })
    expect(readFileSync(join(hub, 'console-hub.config.json'), 'utf8')).not.toContain('corpusRoots')
    expect(JSON.parse(readFileSync(join(hub, 'runs', 'mission', 'missions', 'm1', 'run.json'), 'utf8')).summaryPath).toBe(join(hub, 'runs', 'mission', 'missions', 'm1', 'plan.md'))
    expect(readFileSync(join(mission, 'run.json'), 'utf8')).toBe(before)
    expect(importLegacyHubState(legacy, hub)).toEqual(receipt)
  })

  it('skips corrupt records and records a reason without discarding good files', () => {
    const { legacy, hub } = folders()
    mkdirSync(join(legacy, 'runs', 'console', 'r1'), { recursive: true })
    writeFileSync(join(legacy, 'orchestrator-conversation.json'), '{broken')
    writeFileSync(join(legacy, 'runs', 'console', 'r1', 'result.txt'), 'kept')
    const receipt = importLegacyHubState(legacy, hub)
    expect(receipt.skipped.some((item) => item.includes('orchestrator-conversation.json'))).toBe(true)
    expect(readFileSync(join(hub, 'runs', 'console', 'r1', 'result.txt'), 'utf8')).toBe('kept')
  })

  it('retries a filesystem interruption without changing the source or sealing a receipt', () => {
    const { legacy, hub } = folders()
    const sourceRun = join(legacy, 'runs', 'console', 'r1')
    mkdirSync(sourceRun, { recursive: true })
    writeFileSync(join(sourceRun, 'result.txt'), 'kept')
    writeFileSync(join(hub, 'runs'), 'blocked')

    expect(() => importLegacyHubState(legacy, hub)).toThrow()
    expect(readFileSync(join(sourceRun, 'result.txt'), 'utf8')).toBe('kept')
    expect(() => readFileSync(join(hub, 'cockpit-migration-receipt.json'))).toThrow()

    rmSync(join(hub, 'runs'))
    const receipt = importLegacyHubState(legacy, hub)
    expect(receipt.copied).toContain(join('runs', 'console', 'r1', 'result.txt'))
    expect(readFileSync(join(hub, 'runs', 'console', 'r1', 'result.txt'), 'utf8')).toBe('kept')
  })
})
