import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { app } from 'electron'
import type { ConsoleAgent } from '../shared/consoles'
import { CLAUDE_MODELS } from '../shared/agent-models'
import { loadConfig, type ConsoleHubConfig } from './modules/config'

function probeBinary(binary: string): void {
  if (!app.isPackaged && process.env.CONSOLE_HUB_VERIFY_PROFILE && binary.toLowerCase().endsWith('.cmd') && existsSync(binary)) return
  execFileSync(binary, ['--version'], { encoding: 'utf8', timeout: 5000, windowsHide: true, stdio: 'ignore' })
}

export function checkLaunchAgent(
  agent: ConsoleAgent,
  config: ConsoleHubConfig = loadConfig(),
  probe: (binary: string) => void = probeBinary
): { ok: boolean; reason?: string } {
  if (!agent || !['claude', 'codex', 'agy'].includes(agent.vendor)) return { ok: false, reason: 'Choose a supported Vendor.' }
  if (agent.model && agent.vendor === 'claude' && !CLAUDE_MODELS.includes(agent.model as typeof CLAUDE_MODELS[number])) {
    return { ok: false, reason: `Claude model "${agent.model}" is not in the current picker.` }
  }
  if (agent.model && agent.vendor === 'codex' && !config.codexModels.includes(agent.model)) {
    return { ok: false, reason: `Codex model "${agent.model}" is not in console-hub.config.json.` }
  }
  const field = `${agent.vendor}Bin` as const
  try {
    probe(config[field])
    return { ok: true }
  } catch {
    return { ok: false, reason: `${agent.vendor} is unavailable. Install its CLI or set ${field} in console-hub.config.json, then sign in through that CLI.` }
  }
}
