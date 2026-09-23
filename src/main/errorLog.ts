import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'

const ERROR_LOG = 'console-hub-errors.log'

export function reportError(context: string, reason: unknown): void {
  const detail = reason instanceof Error ? reason.stack ?? reason.message : String(reason)
  const entry = `${new Date().toISOString()} ${context}: ${detail}\n`
  console.error(entry)

  try {
    const path = join(app.getPath('userData'), ERROR_LOG)
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(path, entry, 'utf8')
  } catch (error) {
    console.error('Unable to write Console Hub error log', error)
  }
}
