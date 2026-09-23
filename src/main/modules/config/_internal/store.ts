import { app } from 'electron'
import { isFilesystemSkillName } from '../../../../shared/skill-name'
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import {
  CONFIG_FILENAME,
  CONVERSATION_FILENAME,
  DEFAULT_CONFIG,
  DEFAULT_EXECUTORS,
  FALLBACK_CONFIG_DIR,
  type ConsoleHubConfig,
  type SkillEntry
} from './defaults'
import type { FanWorkspaceResult, SlotConfig } from '../../../../shared/fan'
import type { ConsoleAgent } from '../../../../shared/consoles'
import { defaultArrangement, validArrangement } from '../../fan-arrangement'

/**
 * The smallest honest config layer. Console Hub plan step 2 replaces the reading
 * strategy (watching, validation, schema); what it must not replace is the rule
 * that call sites read values from here and never carry literals of their own.
 */

function configDir(): string {
  try {
    return app.getPath('userData')
  } catch {
    return FALLBACK_CONFIG_DIR
  }
}

export function configPath(): string {
  return join(configDir(), CONFIG_FILENAME)
}

let cached: ConsoleHubConfig | null = null

/**
 * Read the config, seeding the file from defaults on first run.
 *
 * A malformed file is a user-visible failure, not something to paper over with
 * defaults: silently ignoring a typo in `skills[]` would make a button vanish
 * with no explanation, which is the one failure mode this plate cannot have.
 */
export function loadConfig(): ConsoleHubConfig {
  if (cached) return cached

  const path = configPath()
  if (!existsSync(path)) {
    mkdirSync(configDir(), { recursive: true })
    writeFileSync(path, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8')
    cached = DEFAULT_CONFIG
    return cached
  }

  const raw = readFileSync(path, 'utf8')
  const parsed = JSON.parse(raw) as Partial<ConsoleHubConfig>
  const skills = Array.isArray(parsed.skills)
    ? parsed.skills.map(normalizeSkill)
    : DEFAULT_CONFIG.skills
  const storedSkillRoots = Array.isArray(parsed.skillRoots) && parsed.skillRoots.every((root) => typeof root === 'string')
    ? parsed.skillRoots
    : undefined
  cached = {
    ...DEFAULT_CONFIG,
    ...parsed,
    skills,
    skillRoots: storedSkillRoots ?? DEFAULT_CONFIG.skillRoots
  }
  if (!storedSkillRoots || parsed.defaultLaunchAgent === undefined) writeFileSync(path, JSON.stringify(cached, null, 2), 'utf8')
  return cached
}

function normalizeSkill(skill: SkillEntry): SkillEntry {
  const legacy = skill as SkillEntry & {
    provider?: string
    model?: string
    effort?: string
    prompt?: string
  }
  const defaultProvider = legacy.defaultProvider ?? legacy.provider ?? 'claude'
  if (defaultProvider !== 'claude' && defaultProvider !== 'codex') {
    throw new Error(`Unknown skill provider "${String(defaultProvider)}" in console-hub.config.json`)
  }

  const legacyDefaults =
    legacy.model === undefined || legacy.effort === undefined
      ? undefined
      : { model: legacy.model, effort: legacy.effort }
  const skillName = legacy.skill ?? legacy.prompt?.replace(/^[/$]/u, '')
  if (!skillName) throw new Error('Every skill entry needs a skill name in console-hub.config.json')
  return {
    ...legacy,
    defaultProvider,
    skill: skillName,
    executors: {
      claude:
        legacy.executors?.claude ??
        (defaultProvider === 'claude' ? legacyDefaults : undefined) ??
        DEFAULT_EXECUTORS.claude,
      codex:
        legacy.executors?.codex ??
        (defaultProvider === 'codex' ? legacyDefaults : undefined) ??
        DEFAULT_EXECUTORS.codex
    }
  }
}

export function reloadConfig(): ConsoleHubConfig {
  cached = null
  return loadConfig()
}

export function skillEntries(): SkillEntry[] {
  return loadConfig().skills
}

export function skillById(id: string): SkillEntry | undefined {
  return skillEntries().find((s) => s.id === id)
}

export interface ResolvedSkill {
  sourceDirectory: string
  instructions: string
}

/** Resolve a named capability from configured roots without accepting path traversal. */
export function resolveSkill(name: string): ResolvedSkill | undefined {
  if (!isFilesystemSkillName(name)) return undefined
  for (const configuredRoot of loadConfig().skillRoots) {
    const root = resolve(configuredRoot)
    const sourceDirectory = resolve(root, name)
    const traversal = relative(root, sourceDirectory)
    if (traversal.startsWith('..') || traversal.includes(':')) continue
    const path = join(sourceDirectory, 'SKILL.md')
    if (!existsSync(path) || !statSync(path).isFile()) continue
    return { sourceDirectory, instructions: readFileSync(path, 'utf8') }
  }
  return undefined
}

/** The Codex model ids the picker offers. Config-owned, so a new model is an edit. */
export function codexModels(): string[] {
  return loadConfig().codexModels
}

export function defaultLaunchAgent(): ConsoleAgent {
  const agent = loadConfig().defaultLaunchAgent
  if (!agent || !['claude', 'codex', 'agy'].includes(agent.vendor)) {
    throw new Error('Invalid defaultLaunchAgent Vendor in console-hub.config.json')
  }
  if (agent.model !== undefined && (typeof agent.model !== 'string' || !agent.model.trim())) {
    throw new Error('Invalid defaultLaunchAgent model in console-hub.config.json')
  }
  if (agent.effort !== undefined && (typeof agent.effort !== 'string' || !agent.effort.trim())) {
    throw new Error('Invalid defaultLaunchAgent effort in console-hub.config.json')
  }
  return agent
}

const CONFIG_FLUSH_MS = 400
let arrangementFlush: NodeJS.Timeout | null = null
let workspaceFlush: NodeJS.Timeout | null = null

/**
 * The fan arrangement the plate reopens on, and where the plate leaves it.
 *
 * Validated on the way out rather than on the way in: a config file edited by
 * hand between runs is exactly the case this has to survive, and the plate must
 * open on the defaults rather than refuse. Written through the same deferred
 * flush as the ground params, since adding a slot and picking its model is a
 * burst of edits, not one.
 */
export function fanArrangement(): SlotConfig[] {
  const config = loadConfig()
  return validArrangement(config.fanArrangement) ?? defaultArrangement(DEFAULT_EXECUTORS)
}

export function saveArrangement(slots: SlotConfig[]): SlotConfig[] {
  const valid = validArrangement(slots)
  if (valid === undefined) return fanArrangement()

  cached = { ...loadConfig(), fanArrangement: valid }
  if (arrangementFlush) clearTimeout(arrangementFlush)
  arrangementFlush = setTimeout(flushArrangement, CONFIG_FLUSH_MS)
  return valid
}

export function flushArrangement(): void {
  if (arrangementFlush) {
    clearTimeout(arrangementFlush)
    arrangementFlush = null
  }
  if (!cached) return
  writeFileSync(configPath(), JSON.stringify(cached, null, 2), 'utf8')
}

/**
 * A stored workspace, or `undefined` when it is not one the plate can open on.
 *
 * A path is a real-world fact that can go stale between runs - the folder can be
 * renamed or deleted while Console Hub is closed. Falling back to no workspace is the
 * same rule `validArrangement` follows: a stale stored value costs the user their
 * workspace, never their plate.
 */
function validWorkspace(stored: unknown): string | undefined {
  if (typeof stored !== 'string' || stored.length === 0) return undefined
  if (!existsSync(stored) || !statSync(stored).isDirectory()) return undefined
  return stored
}

/** The fan's workspace the plate reopens on. See `saveWorkspace` for how it is set. */
export function fanWorkspace(): string | undefined {
  return validWorkspace(loadConfig().fanWorkspace)
}

/**
 * Set or clear the fan's workspace, from a typed path.
 *
 * Validated on the way in, unlike the arrangement: this is the one moment the
 * user is looking right at the field, so a path that does not exist is reported
 * in words rather than silently ignored or silently discarded on the next open.
 * An empty or whitespace-only path clears the workspace, which is not an error.
 */
export function saveWorkspace(path: string | undefined): FanWorkspaceResult {
  const trimmed = path?.trim()

  if (trimmed === undefined || trimmed.length === 0) {
    cached = { ...loadConfig(), fanWorkspace: undefined }
    if (workspaceFlush) clearTimeout(workspaceFlush)
    workspaceFlush = setTimeout(flushWorkspace, CONFIG_FLUSH_MS)
    return { workspace: undefined }
  }

  if (!existsSync(trimmed) || !statSync(trimmed).isDirectory()) {
    return { error: `"${trimmed}" does not exist, or is not a directory.` }
  }

  cached = { ...loadConfig(), fanWorkspace: trimmed }
  if (workspaceFlush) clearTimeout(workspaceFlush)
  workspaceFlush = setTimeout(flushWorkspace, CONFIG_FLUSH_MS)
  return { workspace: trimmed }
}

export function flushWorkspace(): void {
  if (workspaceFlush) {
    clearTimeout(workspaceFlush)
    workspaceFlush = null
  }
  if (!cached) return
  writeFileSync(configPath(), JSON.stringify(cached, null, 2), 'utf8')
}

/**
 * The Orchestrator's transcript, in its own file beside the config.
 *
 * Written through on every change rather than coalesced like the tuning values:
 * a conversation is typed one message at a time, not dragged, and losing the
 * last thing said on a crash is exactly what persisting it is for. A file that
 * cannot be read is treated as no conversation - the transcript is recoverable
 * history, never something to refuse to open the Hub over.
 *
 * Keyed since ADR 0050: the Console Recipe's Orchestrator is a second,
 * independent `OrchestratorConversation` instance, and two instances writing
 * through the same file would silently clobber each other's transcripts. `fan`
 * keeps the original filename unkeyed, so an existing conversation is read
 * without a migration; any other key gets its own file.
 */
export function conversationPath(key: string = 'fan'): string {
  const filename = key === 'fan' ? CONVERSATION_FILENAME : `orchestrator-conversation-${key}.json`
  return join(configDir(), filename)
}

export function loadConversation(key: string = 'fan'): unknown {
  const path = conversationPath(key)
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

export function saveConversation(file: unknown, key: string = 'fan'): void {
  mkdirSync(configDir(), { recursive: true })
  writeFileSync(conversationPath(key), JSON.stringify(file, null, 2), 'utf8')
}

/** Where runs and their outputs are written. Created on demand. */
export function runsDir(): string {
  const dir = join(configDir(), 'runs')
  mkdirSync(dir, { recursive: true })
  return dir
}
