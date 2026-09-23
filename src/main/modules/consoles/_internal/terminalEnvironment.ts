/** A Console Hub console is a colour-capable PTY even when its parent process is not. */
export function terminalEnvironment(source: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const env = Object.fromEntries(
    Object.entries(source).filter(([key, value]) => key !== 'NO_COLOR' && value !== undefined)
  ) as Record<string, string>

  return {
    ...env,
    TERM: !source.TERM || source.TERM === 'dumb' ? 'xterm-256color' : source.TERM,
    COLORTERM: 'truecolor'
  }
}
