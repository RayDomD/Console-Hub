import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from './modules/config'
import { checkLaunchAgent } from './launchAgent'

describe('subscription CLI launch availability', () => {
  it.each(['claude', 'codex', 'agy'] as const)('accepts a present %s CLI without a billing classification', (vendor) => {
    const probe = vi.fn()
    expect(checkLaunchAgent({ vendor }, DEFAULT_CONFIG, probe)).toEqual({ ok: true })
    expect(probe).toHaveBeenCalledWith(DEFAULT_CONFIG[`${vendor}Bin`])
  })

  it('reports a missing CLI before creating a terminal', () => {
    expect(checkLaunchAgent({ vendor: 'codex' }, DEFAULT_CONFIG, () => { throw new Error('missing') }))
      .toMatchObject({ ok: false, reason: expect.stringContaining('codexBin') })
  })

  it('rejects an unsupported model without changing the configured default', () => {
    expect(checkLaunchAgent({ vendor: 'codex', model: 'not-in-roster' }, DEFAULT_CONFIG, vi.fn()))
      .toMatchObject({ ok: false, reason: expect.stringContaining('not-in-roster') })
  })
})
