import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'

export interface MigrationReceipt {
  version: 1
  copied: string[]
  skipped: string[]
}

const CONFIG_FIELDS = [
  'vaultRoot', 'missionWorktreeRoot', 'claudeBin', 'codexBin', 'agyBin', 'skillRoots',
  'skills', 'codexModels', 'shells', 'defaultShell', 'runTimeoutMs', 'fanArrangement', 'fanWorkspace'
] as const
const CONVERSATIONS = ['orchestrator-conversation.json', 'orchestrator-conversation-console.json'] as const
const RECEIPT = 'cockpit-migration-receipt.json'

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function relocate(value: unknown, source: string, destination: string): unknown {
  if (typeof value === 'string') {
    return value.toLowerCase().startsWith(`${source}${sep}`.toLowerCase())
      ? `${destination}${value.slice(source.length)}` : value
  }
  if (Array.isArray(value)) return value.map((item) => relocate(item, source, destination))
  if (object(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, relocate(item, source, destination)]))
  return value
}

function atomicJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.migration-tmp`
  writeFileSync(temporary, JSON.stringify(value, null, 2), 'utf8')
  renameSync(temporary, path)
}

/** Copy only Hub-owned durable data. Existing destination files win on retry. */
export function importLegacyHubState(source: string, destination: string): MigrationReceipt {
  const receiptPath = join(destination, RECEIPT)
  if (existsSync(receiptPath)) return JSON.parse(readFileSync(receiptPath, 'utf8')) as MigrationReceipt
  const receipt: MigrationReceipt = { version: 1, copied: [], skipped: [] }
  if (!existsSync(source)) {
    receipt.skipped.push('Cockpit user-data directory unavailable')
    atomicJson(receiptPath, receipt)
    return receipt
  }

  const sourceConfig = join(source, 'cockpit.config.json')
  if (existsSync(sourceConfig)) {
    try {
      const legacy = JSON.parse(readFileSync(sourceConfig, 'utf8')) as unknown
      if (!object(legacy)) throw new SyntaxError('not an object')
      const target = join(destination, 'console-hub.config.json')
      const existing = existsSync(target) ? JSON.parse(readFileSync(target, 'utf8')) as unknown : {}
      if (!object(existing)) throw new SyntaxError('destination config is not an object')
      const fields = Object.fromEntries(CONFIG_FIELDS.filter((key) => key in legacy).map((key) => [key, legacy[key]]))
      atomicJson(target, { ...fields, ...existing })
      receipt.copied.push('cockpit.config.json')
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error
      receipt.skipped.push('cockpit.config.json: invalid JSON')
    }
  }

  for (const name of CONVERSATIONS) {
    const from = join(source, name)
    const to = join(destination, name)
    if (!existsSync(from) || existsSync(to)) continue
    try {
      const parsed = JSON.parse(readFileSync(from, 'utf8')) as unknown
      if (!object(parsed)) throw new SyntaxError('not an object')
      atomicJson(to, parsed)
      receipt.copied.push(name)
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error
      receipt.skipped.push(`${name}: invalid JSON`)
    }
  }

  const sourceRuns = join(source, 'runs')
  const targetRuns = join(destination, 'runs')
  const copyTree = (folder: string): void => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const from = join(folder, entry.name)
      const name = relative(sourceRuns, from)
      const to = join(targetRuns, name)
      if (entry.isDirectory()) { copyTree(from); continue }
      if (!entry.isFile() || existsSync(to)) continue
      try {
        mkdirSync(dirname(to), { recursive: true })
        if (entry.name.endsWith('.json')) {
          const parsed = JSON.parse(readFileSync(from, 'utf8')) as unknown
          if (!object(parsed) && !Array.isArray(parsed)) throw new SyntaxError('invalid record')
          if (entry.name === 'run.json' && (!object(parsed) || typeof parsed.id !== 'string' || !Array.isArray(parsed.lanes))) throw new SyntaxError('invalid Mission record')
          atomicJson(to, relocate(parsed, source, destination))
        } else {
          copyFileSync(from, to)
        }
        receipt.copied.push(join('runs', name))
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error
        receipt.skipped.push(`${join('runs', name)}: invalid record`)
      }
    }
  }
  for (const category of ['mission', 'console']) {
    const from = join(sourceRuns, category)
    if (!existsSync(from)) continue
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      if (!entry.isDirectory() || (category === 'console' && ['commands', 'orchestrator'].includes(entry.name))) continue
      copyTree(join(from, entry.name))
    }
  }

  receipt.skipped.push('Hub pane widths: Chromium local storage has no safe cross-profile transfer')
  atomicJson(receiptPath, receipt)
  return receipt
}
