import type { ConsoleAgent } from '../../../../shared/consoles'
import type { ConsoleHubConfig } from '../../config'
import type { ShellKind } from './shellInit'

export function configuredAgentBinary(agent: ConsoleAgent, config: ConsoleHubConfig): string {
  if (agent.vendor === 'claude') return config.claudeBin
  if (agent.vendor === 'codex') return config.codexBin
  if (agent.vendor === 'agy') return config.agyBin
  throw new Error('Unknown terminal agent')
}

export function agentCommand(agent: ConsoleAgent, kind: ShellKind, binary: string, prompt?: string, claudeContextDirectory?: string): string {
  if (!['codex', 'claude', 'agy'].includes(agent.vendor)) throw new Error('Unknown terminal agent')
  const quote = (value: string): string => kind === 'powershell'
    ? `'${value.replace(/'/g, "''")}'`
    : `'${value.replace(/'/g, "'\\''")}'`
  const executable = kind === 'powershell' ? `& ${quote(binary)}` : quote(binary)
  const args: string[] = [executable]
  if (agent.vendor === 'claude' && claudeContextDirectory) args.push('--add-dir', quote(claudeContextDirectory))
  if (agent.model) args.push('--model', quote(agent.model))
  if (agent.effort) {
    if (!['low', 'medium', 'high', 'xhigh', 'max'].includes(agent.effort)) throw new Error('Unknown effort')
    args.push(...(agent.vendor === 'codex'
      ? ['-c', quote(`model_reasoning_effort=${agent.effort}`)]
      : ['--effort', quote(agent.effort)]))
  }
  if (prompt) args.push(...(agent.vendor === 'agy' ? ['--prompt-interactive', quote(prompt)] : [quote(prompt)]))
  return args.join(' ')
}
