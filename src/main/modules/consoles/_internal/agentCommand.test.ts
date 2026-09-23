import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../../config'
import { agentCommand, configuredAgentBinary } from './agentCommand'

describe('interactive agent launch', () => {
  it('passes Codex model and effort without shell interpolation', () => {
    expect(agentCommand({ vendor: 'codex', model: "a'b", effort: 'high' }, 'powershell', 'codex.exe'))
      .toBe("& 'codex.exe' --model 'a''b' -c 'model_reasoning_effort=high'")
  })
  it.each(['claude', 'agy'] as const)('passes %s settings', (vendor) => {
    expect(agentCommand({ vendor, model: 'chosen', effort: 'medium' }, 'powershell', `${vendor}.exe`))
      .toBe(`& '${vendor}.exe' --model 'chosen' --effort 'medium'`)
  })
  it('rejects an unrecognised vendor received over IPC', () => {
    expect(() => agentCommand({ vendor: 'bad' as 'codex' }, 'powershell', 'bad.exe')).toThrow()
  })

  it('runs the configured native binary even when its path contains spaces', () => {
    expect(agentCommand({ vendor: 'codex', model: 'gpt-5.6-terra' }, 'powershell', 'C:\\Program Files\\Codex\\codex.exe'))
      .toBe("& 'C:\\Program Files\\Codex\\codex.exe' --model 'gpt-5.6-terra'")
  })
  it('selects the same configured binary for each Vendor that route checks use', () => {
    const config = { ...DEFAULT_CONFIG, claudeBin: 'C:\\Apps\\Claude\\claude.exe', codexBin: 'C:\\Apps\\Codex\\codex.exe', agyBin: 'C:\\Apps\\AGY\\agy.exe' }
    expect(configuredAgentBinary({ vendor: 'claude' }, config)).toBe(config.claudeBin)
    expect(configuredAgentBinary({ vendor: 'codex' }, config)).toBe(config.codexBin)
    expect(configuredAgentBinary({ vendor: 'agy' }, config)).toBe(config.agyBin)
  })
})
