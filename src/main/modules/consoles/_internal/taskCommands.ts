import type { ShellKind } from './shellInit'

function quote(value: string, kind: ShellKind): string {
  return kind === 'powershell' ? `'${value.replace(/'/g, "''")}'` : `'${value.replace(/'/g, "'\\''")}'`
}

/** One submitted line, preserving multiline scripts without PSReadLine continuation races. */
export function shellScriptCommand(path: string, kind: ShellKind): string {
  return kind === 'powershell' ? `& ${quote(path, kind)}` : `source ${quote(path, kind)}`
}

export function withAgentExit(command: string, kind: ShellKind, consoleId: string): string {
  const marker = quote(`CONSOLE_HUB_AGENT_EXIT:${consoleId}`, kind)
  return kind === 'powershell'
    ? `try { ${command} } finally { Write-Output ${marker} }`
    : `${command}; printf '\\n%s\\n' ${marker}`
}

export function shellTaskCommand(task: string, path: string, runId: string, kind: ShellKind): string {
  const temp = quote(`${path}.partial`, kind)
  const final = quote(path, kind)
  const marker = quote(`CONSOLE_HUB_TASK_FAILED:${runId}`, kind)
  if (kind === 'powershell') return [
    '& { try {',
    `$consoleHubResult = & { $ErrorActionPreference = 'Stop'; $LASTEXITCODE = 0; ${task}; if ($LASTEXITCODE -ne 0) { throw 'Command exited with an error' } } | Out-String;`,
    `if ([string]::IsNullOrWhiteSpace($consoleHubResult)) { $consoleHubResult = 'Command completed with no output.' };`,
    `$consoleHubResult; $consoleHubResult | Set-Content -LiteralPath ${temp} -Encoding UTF8;`,
    `Move-Item -LiteralPath ${temp} -Destination ${final} -Force -ErrorAction Stop`,
    `} catch { Write-Output ${marker}; Write-Error $_ } }`
  ].join('\n')
  return `( ( ${task}\n) > ${temp} 2>&1; consoleHub_status=$?; cat ${temp}; if [ "$consoleHub_status" -eq 0 ]; then [ -s ${temp} ] || printf 'Command completed with no output.\\n' > ${temp}; mv ${temp} ${final}; else printf '\\n%s\\n' ${marker}; fi )`
}

/** Explicit lifecycle protocol lines, never cursor/prompt heuristics. */
export function protocolLines(output: string): string[] {
  return output.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').split(/\r?\n/).map((line) => line.trim())
}
