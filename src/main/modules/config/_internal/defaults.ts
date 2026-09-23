import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import type { ExecutorSettings, SkillEntry } from '../../../../shared/skills'
import type { ConsoleAgent, ShellId } from '../../../../shared/consoles'
import type { SlotConfig } from '../../../../shared/fan'

/**
 * The shipped configuration, written to disk on first run so the file the user
 * edits is a real file with real values rather than an empty stub they have to
 * invent. Every value here is overridable; nothing in the codebase reads a
 * literal that also appears in this file.
 */

/** The vault boundary used for read-only Mission access. */
const VAULT_ROOT = 'C:\\FIles\\Vault'

/** This repo, so repo-scoped skills have somewhere to run. */
const REPO_ROOT = 'C:\\FIles\\Console-Hub'

export type { SkillEntry }


export const DEFAULT_EXECUTORS: Record<SkillEntry['defaultProvider'], ExecutorSettings> = {
  claude: { model: 'sonnet', effort: 'medium' },
  codex: { model: 'gpt-5.6-terra', effort: 'medium' }
}

export interface ConsoleHubConfig {
  vaultRoot: string
  missionWorktreeRoot: string
  /** The Claude Code CLI to spawn. Resolved through PATH unless given absolute. */
  claudeBin: string
  /** The native Codex executable. A .cmd shim would require a shell. */
  codexBin: string
  /** The Antigravity CLI, resolved through PATH unless given absolute. */
  agyBin: string
  /** Ordered roots containing <skill-name>/SKILL.md capability packages. */
  skillRoots: string[]
  skills: SkillEntry[]
  /**
   * The Codex models offered in the picker. Claude's are a closed set the app can
   * name, but Codex ships new model strings on its own schedule - so this is a
   * config edit rather than a release, the same recipe as `skills[]`.
   */
  codexModels: string[]
  /**
   * The shells a console can run. A console is a shell, not an agent, so which
   * shells exist is a property of the machine and belongs in config rather than
   * in the module that spawns them.
   */
  shells: Record<ShellId, ShellSpec>
  /**
   * The question fan's slot arrangement, as last left. Absent until the plate
   * saves one; an arrangement that no longer validates is discarded on read
   * rather than refusing to open the plate.
   */
  fanArrangement?: SlotConfig[]
  /**
   * The folder the fan answers from, as last left. Absent until the plate saves
   * one; a stored path that is no longer a string, or no longer a directory on
   * disk, is discarded on read rather than refusing to open the plate.
   */
  fanWorkspace?: string
  /** Which entry of `shells` a new console opens with. */
  defaultShell: ShellId
  /** Agent started by an accepted project handoff when its Workspace has no open agent. */
  defaultLaunchAgent: ConsoleAgent
  /** How long a run may go without exiting before it is killed as blocked. */
  runTimeoutMs: number
}

/** A launchable shell. `args` is spawned directly. */
export interface ShellSpec {
  label: string
  bin: string
  args: string[]
}

/**
 * Headless has no window to approve in, so a run that stalls on a decision would
 * hang forever. Five minutes turns that into a visible `blocked` instead.
 */
const RUN_TIMEOUT_MS = 300_000

/**
 * Windows' CreateProcess appends `.exe` for an extensionless name, but naming it
 * outright is one less thing to be wrong about - and on this machine `claude` is a
 * real executable at ~\.local\bin\claude.exe, not a .cmd shim, so no shell is needed.
 */
const CLAUDE_BIN = process.platform === 'win32' ? 'claude.exe' : 'claude'

/**
 * The npm launcher on Windows is a `.cmd` shim. Console Hub never uses a shell for
 * prompts, so prefer the native executable shipped inside the installed Codex
 * package and fall back to PATH for non-npm installations.
 */
const CODEX_FALLBACK_BIN = process.platform === 'win32' ? 'codex.exe' : 'codex'
const NPM_CODEX_BIN = join(
  process.env.APPDATA ?? '',
  'npm',
  'node_modules',
  '@openai',
  'codex',
  'node_modules',
  '@openai',
  'codex-win32-x64',
  'vendor',
  'x86_64-pc-windows-msvc',
  'bin',
  'codex.exe'
)
const CODEX_BIN = process.platform === 'win32' && existsSync(NPM_CODEX_BIN)
  ? NPM_CODEX_BIN
  : CODEX_FALLBACK_BIN

const AGY_BIN = process.platform === 'win32' ? 'agy.exe' : 'agy'

/** Taken from the roster `codex -m` lists, not invented. Legacy ids stay: codex still accepts them. */
const CODEX_MODELS = [
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.4-mini'
]

/**
 * `-NoLogo` because a banner is not information, and `-NoExit` is deliberately
 * absent: the pty keeps the shell alive, so asking PowerShell to stay open too
 * would leave a shell nobody can close.
 */
const SHELLS: Record<ShellId, ShellSpec> = {
  powershell: {
    label: 'PowerShell',
    bin: 'powershell.exe',
    args: ['-NoLogo']
  },
  gitbash: {
    label: 'Git Bash',
    bin: join(process.env['ProgramFiles'] ?? 'C:\Program Files', 'Git', 'bin', 'bash.exe'),
    args: ['--login', '-i']
  }
}

const DEFAULT_SHELL: ShellId = 'powershell'

export const DEFAULT_CONFIG: ConsoleHubConfig = {
  missionWorktreeRoot: 'C:\\Console-Hub\\wt',
  vaultRoot: VAULT_ROOT,
  claudeBin: CLAUDE_BIN,
  codexBin: CODEX_BIN,
  agyBin: AGY_BIN,
  skillRoots: [
    join(homedir(), '.agents', 'skills'),
    join(homedir(), '.codex', 'skills'),
    join(homedir(), '.claude', 'skills')
  ],
  codexModels: CODEX_MODELS,
  shells: SHELLS,
  defaultShell: DEFAULT_SHELL,
  defaultLaunchAgent: { vendor: 'claude' },
  runTimeoutMs: RUN_TIMEOUT_MS,
  skills: []
}

/** Kept beside the defaults so the example in the recipe cannot drift from the type. */
export const EXAMPLE_ENTRY: SkillEntry = {
  id: 'graphify',
  defaultProvider: 'codex',
  executors: DEFAULT_EXECUTORS,
  label: 'Graphify',
  skill: 'graphify',
  cwd: REPO_ROOT,
  writes: true,
  input: null
}

export const CONFIG_FILENAME = 'console-hub.config.json'

/**
 * The Orchestrator's transcript, beside the config rather than inside it.
 *
 * `console-hub.config.json` is a file the user is expected to open and hand-edit; a
 * conversation that grows without bound would bury the settings it lives next
 * to. It is Console Hub-owned state, not configuration.
 */
export const CONVERSATION_FILENAME = 'orchestrator-conversation.json'

/** Only used when Electron's userData path is unavailable (tests, tooling). */
export const FALLBACK_CONFIG_DIR = join(homedir(), '.console-hub')
