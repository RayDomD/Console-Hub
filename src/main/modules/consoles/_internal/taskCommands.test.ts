import { describe, expect, it } from 'vitest'
import { protocolLines, shellTaskCommand, withAgentExit } from './taskCommands'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('terminal lifecycle commands', () => {
  it.skipIf(process.platform !== 'win32')('captures real PowerShell output and rejects a failing command', () => {
    const folder = mkdtempSync(join(tmpdir(), 'consoleHub-shell-capture-'))
    try {
      const path = join(folder, "result's.txt")
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', shellTaskCommand("Write-Output 'verified output'", path, 'run-1', 'powershell')], { windowsHide: true })
      expect(readFileSync(path, 'utf8')).toContain('verified output')
      const failed = join(folder, 'failed.txt')
      try {
        execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', shellTaskCommand("throw 'expected failure'", failed, 'run-2', 'powershell')], { windowsHide: true, stdio: 'pipe' })
      } catch { /* PowerShell reports the command failure to its caller too. */ }
      expect(existsSync(failed)).toBe(false)
    } finally { rmSync(folder, { recursive: true, force: true }) }
  }, 15000)
  it('reports agent exit even when the command fails', () => {
    expect(withAgentExit('claude', 'powershell', 'console-1')).toBe("try { claude } finally { Write-Output 'CONSOLE_HUB_AGENT_EXIT:console-1' }")
  })
  it('does not treat an echoed command as an exit signal', () => {
    expect(protocolLines("PS> Write-Output 'CONSOLE_HUB_AGENT_EXIT:console-1'\r\n")).not.toContain('CONSOLE_HUB_AGENT_EXIT:console-1')
    expect(protocolLines('\x1b[0mCONSOLE_HUB_AGENT_EXIT:console-1\r\n')).toContain('CONSOLE_HUB_AGENT_EXIT:console-1')
  })
  it('captures shell results to an atomic UTF-8 file and reports failures', () => {
    const command = shellTaskCommand("Write-Output 'hello'", "C:\\work's\\result.txt", 'run-1', 'powershell')
    expect(command).toContain("Write-Output 'hello'")
    expect(command).toContain("'C:\\work''s\\result.txt.partial' -Encoding UTF8")
    expect(command).toContain('CONSOLE_HUB_TASK_FAILED:run-1')
    expect(command).toContain('Move-Item -LiteralPath')
  })
})
