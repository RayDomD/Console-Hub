import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * The notifier scripts a scoped `claude`/`codex` shell function invokes on
 * its own, and claude's settings file. All written to disk rather than
 * inlined into the shell command that launches them, and for a real reason
 * found live, not a style preference: Windows reconstructs a child process's
 * argv from a single command-line string, and single-quoting a value inside
 * a PowerShell script does not survive that second parse - an inline JSON
 * `--settings` value with embedded double quotes reached claude corrupted
 * ("Invalid JSON provided to --settings"), verified 2026-09-04. A bare file
 * path has nothing left for either parse to mangle.
 */

let claudeNotifierScript: string | undefined

/**
 * Claude's `Stop` hook receives its own JSON payload on stdin, which this
 * ignores - the hook firing at all is the whole signal. Claude spawns the
 * hook command through its own mechanism, never through the PowerShell
 * script that scopes `claude` itself, so port and console id are safe to
 * carry as plain argv here - only the *settings value itself* had to move
 * to a file.
 */
function claudeNotifierContents(): string {
  return `
const http = require('http')
const port = Number(process.argv[2])
const consoleId = process.argv[3]
const req = http.request(
  { host: '127.0.0.1', port, path: '/turn-complete', method: 'POST', headers: { 'content-type': 'application/json' } },
  (res) => { res.resume() }
)
req.on('error', () => {})
req.end(JSON.stringify({ consoleId }))
`.trimStart()
}

/**
 * Codex's own argv parsing is the leg that broke on an inline value, so port
 * and console id are baked into this file's own source rather than passed as
 * argv - the `-c notify=` value this drives needs nothing but a bare path.
 * `argv[2]` is codex's own JSON payload, appended after whatever this module
 * configured. Filtered here rather than trusted blindly: codex fires
 * `notify` once per sub-turn, including an internal task-title generation
 * turn - verified live 2026-09-04 against codex-cli 0.151.0 - and only a
 * `type: "agent-turn-complete"` whose `input-messages` were not that internal
 * prompt counts as the user's turn actually ending.
 */
function codexNotifierContents(port: number, consoleId: string): string {
  return `
const http = require('http')
const port = ${JSON.stringify(port)}
const consoleId = ${JSON.stringify(consoleId)}
let payload
try { payload = JSON.parse(process.argv[2] ?? '{}') } catch { payload = {} }
const firstInput = Array.isArray(payload['input-messages']) ? String(payload['input-messages'][0] ?? '') : ''
const isInternalTitleTurn = firstInput.startsWith('Generate a concise, single-line task title')
if (payload.type !== 'agent-turn-complete' || isInternalTitleTurn) process.exit(0)
const req = http.request(
  { host: '127.0.0.1', port, path: '/turn-complete', method: 'POST', headers: { 'content-type': 'application/json' } },
  (res) => { res.resume() }
)
req.on('error', () => {})
req.end(JSON.stringify({ consoleId }))
`.trimStart()
}

function writeToFreshTemp(name: string, contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'consoleHub-turn-signal-'))
  const path = join(dir, name)
  writeFileSync(path, contents)
  return path
}

/** Cached: nothing in this file varies per call, unlike codex's below. */
export function claudeNotifierPath(): string {
  claudeNotifierScript ??= writeToFreshTemp('claude-notify.cjs', claudeNotifierContents())
  return claudeNotifierScript
}

/**
 * A fresh file every call, since port and console id are baked into its
 * source rather than passed as argv. Cheap, and only written once per
 * dispatch of a watched codex producer, not on every keystroke.
 */
export function writeCodexNotifierScript(port: number, consoleId: string): string {
  return writeToFreshTemp('codex-notify.cjs', codexNotifierContents(port, consoleId))
}

/**
 * Claude's `--settings` value, written to disk rather than passed inline -
 * see this file's own top comment for why. One file per call: cheap, and
 * only written once per dispatch of a watched claude producer.
 */
export function writeClaudeSettingsFile(port: number, consoleId: string): string {
  const notifierPath = claudeNotifierPath()
  const settings = {
    hooks: {
      Stop: [
        {
          hooks: [
            {
              type: 'command',
              command: `node ${JSON.stringify(notifierPath)} ${port} ${consoleId}`
            }
          ]
        }
      ]
    }
  }
  return writeToFreshTemp('claude-settings.json', JSON.stringify(settings))
}

/** Test-only: forces the next call to write a fresh file. */
export function resetNotifierCacheForTests(): void {
  claudeNotifierScript = undefined
}
