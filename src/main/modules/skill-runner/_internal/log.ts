import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runsDir } from '../../config'

/**
 * The runs log and the per-run output file.
 *
 * One line per event in `runs.log`, so what fired and when survives the app being
 * closed; one Markdown file per run holding what the skill actually said, because
 * a status chip that says "done" with nothing to read is not an answer.
 */

const LOG_FILENAME = 'runs.log'

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** `2026-08-27-1542` - sortable, and unique enough at one run per skill per minute. */
export function stamp(at: Date): string {
  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
    `-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`
  )
}

function clock(at: Date): string {
  return `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
}

export function logLine(line: string): void {
  appendFileSync(join(runsDir(), LOG_FILENAME), `${clock(new Date())}  ${line}\n`, 'utf8')
}

export function logPath(): string {
  return join(runsDir(), LOG_FILENAME)
}

/**
 * Write a run's output beside the log. The header carries the command that
 * produced it, so a file found later can always be traced back to its run.
 */
export function writeOutput(args: {
  skillId: string
  startedAt: Date
  command: string
  body: string
}): string {
  const path = join(runsDir(), `${stamp(args.startedAt)}-${args.skillId}.md`)
  const header = [
    `<!-- consoleHub run · ${args.skillId} · ${args.startedAt.toISOString()}`,
    `     ${args.command} -->`,
    ''
  ].join('\n')
  writeFileSync(path, `${header}\n${args.body}\n`, 'utf8')
  return path
}
