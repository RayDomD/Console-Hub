import type { ConsoleHubConfig } from '../../config'
import type {
  RunOptions,
  SkillEntry,
  SkillProvider
} from '../../../../shared/skills'

/**
 * Provider-specific command construction and output parsing.
 *
 * Neither provider goes through a shell. A prompt is always one argv element,
 * so quotes, dollar signs and other command syntax stay prompt text.
 */

const CLAUDE_MODE_READ_ONLY = 'plan'
const CLAUDE_MODE_WRITES = 'acceptEdits'
const CODEX_MODE_READ_ONLY = 'read-only'
const CODEX_MODE_WRITES = 'workspace-write'
const CLAUDE_OUTPUT_FORMAT = 'json'

export type { RunOptions }

export interface Invocation {
  provider: SkillProvider
  bin: string
  args: string[]
  permission: string
}

export interface ParsedResult {
  text: string
  isError: boolean
  costUsd?: number
  message?: string
}

export function providerFor(skill: SkillEntry, opts: RunOptions): SkillProvider {
  return opts.provider ?? skill.defaultProvider
}

export function permissionMode(skill: SkillEntry, opts: RunOptions): string {
  if (providerFor(skill, opts) === 'codex') {
    return skill.writes ? CODEX_MODE_WRITES : CODEX_MODE_READ_ONLY
  }
  return skill.writes ? CLAUDE_MODE_WRITES : CLAUDE_MODE_READ_ONLY
}

export function buildPrompt(
  skill: SkillEntry,
  provider: SkillProvider,
  opts: RunOptions
): string {
  const extra = opts.text?.trim()
  const invocation = `${provider === 'codex' ? '$' : '/'}${skill.skill}`
  return extra ? `${invocation} ${extra}` : invocation
}

export function buildArgs(skill: SkillEntry, opts: RunOptions): string[] {
  const provider = providerFor(skill, opts)
  const prompt = buildPrompt(skill, provider, opts)
  const executor = skill.executors[provider]
  const model = opts.model ?? executor.model
  const effort = opts.effort ?? executor.effort

  if (provider === 'codex') {
    const args = [
      'exec',
      '--model',
      model,
      '--config',
      `model_reasoning_effort="${effort}"`,
      '--sandbox',
      permissionMode(skill, opts),
      '--cd',
      skill.cwd,
      '--skip-git-repo-check',
      '--ephemeral',
      '--json',
      '--color',
      'never'
    ]
    if (skill.writes) args.push('--approve-for-me')
    args.push(prompt)
    return args
  }

  return [
    '-p',
    prompt,
    '--model',
    model,
    '--effort',
    effort,
    '--permission-mode',
    permissionMode(skill, opts),
    '--add-dir',
    skill.cwd,
    '--output-format',
    CLAUDE_OUTPUT_FORMAT
  ]
}

export function buildInvocation(
  config: Pick<ConsoleHubConfig, 'claudeBin' | 'codexBin'>,
  skill: SkillEntry,
  opts: RunOptions
): Invocation {
  return {
    provider: providerFor(skill, opts),
    bin: providerFor(skill, opts) === 'codex' ? config.codexBin : config.claudeBin,
    args: buildArgs(skill, opts),
    permission: permissionMode(skill, opts)
  }
}

/** The printable command uses the same argv as the spawn call. */
export function commandLine(bin: string, args: string[]): string {
  return [bin, ...args.map(quoteArg)].join(' ')
}

function quoteArg(value: string): string {
  return /[\s"]/u.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value
}

interface ClaudeResult {
  result?: string
  is_error?: boolean
  total_cost_usd?: number
}

interface CodexEvent {
  type?: string
  item?: {
    type?: string
    text?: string
  }
  error?: {
    message?: string
  }
}

export function parseResult(provider: SkillProvider, stdout: string): ParsedResult {
  return provider === 'codex' ? parseCodexResult(stdout) : parseClaudeResult(stdout)
}

function parseClaudeResult(stdout: string): ParsedResult {
  const trimmed = stdout.trim()
  if (!trimmed) return { text: '', isError: false }
  try {
    const parsed = JSON.parse(trimmed) as ClaudeResult
    const text =
      typeof parsed.result === 'string'
        ? parsed.result
        : '```json\n' + JSON.stringify(parsed, null, 2) + '\n```'
    return { text, isError: parsed.is_error === true, costUsd: parsed.total_cost_usd }
  } catch {
    return { text: trimmed, isError: false }
  }
}

/**
 * `codex exec --json` emits JSONL lifecycle events. The final agent message is
 * the artifact people want to read; raw output is retained if a future CLI
 * changes the event shape, so an upgrade cannot silently discard a result.
 */
function parseCodexResult(stdout: string): ParsedResult {
  const trimmed = stdout.trim()
  if (!trimmed) return { text: '', isError: false }

  const events: CodexEvent[] = []
  for (const line of trimmed.split(/\r?\n/u)) {
    try {
      events.push(JSON.parse(line) as CodexEvent)
    } catch {
      return { text: trimmed, isError: false }
    }
  }

  const messages = events
    .filter((event) => event.type === 'item.completed' && event.item?.type === 'agent_message')
    .map((event) => event.item?.text)
    .filter((text): text is string => typeof text === 'string')
  const failure = events.find(
    (event) => event.type === 'turn.failed' || event.type === 'error'
  )

  return {
    text: messages.at(-1) ?? '```jsonl\n' + trimmed + '\n```',
    isError: failure !== undefined,
    message: failure?.error?.message
  }
}
