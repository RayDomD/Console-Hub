import type { ShellKind } from '../../consoles'

/**
 * The shell function that makes a bare `claude` or `codex` typed into a
 * console carry the extra flag - additive, scoped to one console, gone when
 * it closes. Resolves the real binary through the shell's own PATH lookup at
 * the moment the console opens rather than a path baked in here, so this
 * keeps working across machines and CLI updates without edits.
 * PowerShell can return multiple npm shims, so only its first application
 * match is callable here, not the array of paths.
 *
 * Both vendors' extra value is a bare file path (`claudeSettingsPath`,
 * `codexNotifierPath`) rather than an inline value, for a reason found live,
 * not a style preference - see `_internal/notifier.ts`'s top comment.
 */

export type TurnSignalVendor = 'claude' | 'codex'

/** JSON.stringify, then escaped for a PowerShell single-quoted string: only `'` needs doubling. */
function psSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/** A POSIX single-quoted string: `'` cannot appear inside one, so it closes, escapes, reopens. */
function posixSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

/** Forward slashes even on Windows: one fewer thing for either parse to treat as an escape. */
function forwardSlashed(path: string): string {
  return path.replace(/\\/g, '/')
}

function codexNotifyConfig(notifierPath: string): string {
  // A TOML array-of-strings value, passed to `-c notify=`. Codex appends its
  // own JSON payload as one more argv entry beyond this.
  // TOML unicode escapes keep spaces and cmd metacharacters out of the npm
  // shim's second parse while preserving the decoded notifier path.
  const path = JSON.stringify(forwardSlashed(notifierPath)).replace(/[\s&|<>^()%!']/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)
  return `notify=["node",${path}]`
}

export function turnSignalInitCommand(
  vendor: TurnSignalVendor,
  kind: ShellKind,
  claudeSettingsPath: string,
  codexNotifierPath: string
): string {
  if (vendor === 'claude') {
    return kind === 'powershell'
      ? [
          '$__consoleHubClaudeBin = (Get-Command claude -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source',
          'if ($__consoleHubClaudeBin) {',
          `  function claude { & $__consoleHubClaudeBin --settings ${psSingleQuoted(forwardSlashed(claudeSettingsPath))} @args }`,
          '}'
        ].join('\n')
      : [
          'if command -v claude >/dev/null 2>&1; then',
          `  claude() { command claude --settings ${posixSingleQuoted(claudeSettingsPath)} "$@"; }`,
          'fi'
        ].join('\n')
  }

  const notifyArg = codexNotifyConfig(codexNotifierPath)
  return kind === 'powershell'
    ? [
        '$__consoleHubCodexBin = (Get-Command codex -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source',
        'if ($__consoleHubCodexBin) {',
        // Legacy native parsing needs literal quotes escaped for the child argv.
        // Keep this local to the wrapper so PowerShell 7 uses the same contract.
        `  function codex { $PSNativeCommandArgumentPassing = 'Legacy'; & $__consoleHubCodexBin -c ${psSingleQuoted(notifyArg.replace(/"/g, '\\"'))} @args }`,
        '}'
      ].join('\n')
    : [
        'if command -v codex >/dev/null 2>&1; then',
        `  codex() { command codex -c ${posixSingleQuoted(notifyArg)} "$@"; }`,
        'fi'
      ].join('\n')
}
