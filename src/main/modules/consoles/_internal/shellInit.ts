/**
 * How to make a shell run one command before it becomes interactive, without
 * touching the user's own profile - kept pure and separate from `registry.ts`
 * so the two shell families' argument shapes are testable without a real pty.
 */

export type ShellKind = 'powershell' | 'posix'

/** Told apart by the executable name; good enough for the two shells `defaults.ts` ships. */
export function shellKindOf(bin: string): ShellKind {
  const name = bin.toLowerCase()
  return name.includes('powershell') || name.includes('pwsh') ? 'powershell' : 'posix'
}

/**
 * Args that run `initCommand`, then hand off to an interactive shell exactly
 * as `baseArgs` would have on its own. Nothing is written to disk for
 * PowerShell; the posix path writes one temp rcfile because bash has no
 * "run this, then behave like `--login -i`" flag - `--rcfile` replaces
 * profile loading rather than adding to it, so the file sources the normal
 * profile chain itself before defining anything.
 */
export function withInitCommand(
  kind: ShellKind,
  baseArgs: readonly string[],
  initCommand: string,
  writeTempFile: (contents: string) => string
): string[] {
  if (kind === 'powershell') {
    return [...baseArgs, '-NoExit', '-Command', initCommand]
  }
  const rcfile = writeTempFile(
    [
      // Best-effort replay of what `--login` would have sourced, since
      // `--rcfile` takes over profile loading entirely rather than adding to it.
      'for f in /etc/profile "$HOME/.bash_profile" "$HOME/.bash_login" "$HOME/.profile"; do',
      '  [ -f "$f" ] && . "$f" && break',
      'done',
      '[ -f "$HOME/.bashrc" ] && . "$HOME/.bashrc"',
      initCommand
    ].join('\n')
  )
  return [...baseArgs.filter((a) => a !== '--login'), '--rcfile', rcfile]
}
