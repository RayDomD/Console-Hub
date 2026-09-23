import { describe, expect, it } from 'vitest'
import { subscriptionEnvironment, subscriptionShellPrefix } from './subscriptionEnvironment'

describe('subscription CLI environment', () => {
  it('removes common API-key and alternate-provider overrides from Hub-started agents', () => {
    const env = subscriptionEnvironment({
      PATH: 'C:\\Tools', OPENAI_API_KEY: 'secret', CODEX_API_KEY: 'secret',
      ANTHROPIC_API_KEY: 'secret', ANTHROPIC_AUTH_TOKEN: 'secret',
      GEMINI_API_KEY: 'secret', GOOGLE_GEMINI_BASE_URL: 'https://example.test',
      CLAUDE_CODE_USE_BEDROCK: '1'
    })
    expect(env).toEqual({ PATH: 'C:\\Tools' })
  })

  it('clears inherited overrides before launching an agent in an existing shell', () => {
    expect(subscriptionShellPrefix('powershell')).toContain('Remove-Item Env:OPENAI_API_KEY')
    expect(subscriptionShellPrefix('powershell')).toContain('Remove-Item Env:ANTHROPIC_API_KEY')
    expect(subscriptionShellPrefix('posix')).toContain('unset OPENAI_API_KEY')
  })
})
