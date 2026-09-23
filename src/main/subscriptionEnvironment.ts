import type { ShellKind } from './modules/consoles'

const OVERRIDES = [
  'OPENAI_API_KEY', 'CODEX_API_KEY', 'AZURE_OPENAI_API_KEY', 'OPENAI_BASE_URL',
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY',
  'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GEMINI_BASE_URL'
] as const

/** Hub-started agents inherit the user's CLI sign-in, not API-key overrides from Hub's process. */
export function subscriptionEnvironment(source: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const removed = new Set<string>(OVERRIDES)
  return Object.fromEntries(Object.entries(source).filter(([key, value]) => !removed.has(key.toUpperCase()) && value !== undefined)) as Record<string, string>
}

/** A worker launched into an existing shell must clear inherited overrides there too. */
export function subscriptionShellPrefix(kind: ShellKind): string {
  return kind === 'powershell'
    ? OVERRIDES.map((key) => `Remove-Item Env:${key} -ErrorAction SilentlyContinue`).join('\n')
    : `unset ${OVERRIDES.join(' ')}`
}
