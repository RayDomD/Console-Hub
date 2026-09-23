import { describe, expect, it } from 'vitest'
import { turnSignalInitCommand } from './initCommand'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('turnSignalInitCommand', () => {
  it.skipIf(process.platform !== 'win32')('preserves the notify array through PowerShell and an npm command shim', () => {
    const folder = mkdtempSync(join(tmpdir(), 'consoleHub-notify-argv-'))
    try {
      const recorder = join(folder, 'argv.cjs')
      writeFileSync(recorder, 'console.log(JSON.stringify(process.argv.slice(2)))')
      writeFileSync(join(folder, 'codex.cmd'), `@echo off\r\n"${process.execPath}" "${recorder}" %*\r\n`)
      const notifier = "C:/Users/test user's folder/codex-notify.cjs"
      const command = [
        "$ErrorActionPreference = 'Stop'",
        `$env:PATH = '${folder.replace(/'/g, "''")}'`,
        turnSignalInitCommand('codex', 'powershell', '', notifier),
        'codex'
      ].join('\n')
      const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, encoding: 'utf8', stdio: 'pipe' })
      const args = JSON.parse(output) as string[]
      expect(args).toHaveLength(2)
      expect(args[0]).toBe('-c')
      expect(args[1]).toMatch(/^notify=/)
      expect(JSON.parse(args[1]!.slice('notify='.length))).toEqual(['node', notifier])
    } finally { rmSync(folder, { recursive: true, force: true }) }
  })
  it.skipIf(process.platform !== 'win32').each(['codex', 'claude'] as const)('launches %s when npm installs both an extensionless shim and a cmd shim', (vendor) => {
    const folder = mkdtempSync(join(tmpdir(), 'consoleHub-codex-shims-'))
    try {
      writeFileSync(join(folder, vendor), '#!/bin/sh\nexit 1\n')
      writeFileSync(join(folder, `${vendor}.cmd`), '@echo off\r\necho AGENT_LAUNCHED %*\r\n')
      const command = [
        "$ErrorActionPreference = 'Stop'",
        `$env:PATH = '${folder.replace(/'/g, "''")}'`,
        turnSignalInitCommand(vendor, 'powershell', 'C:/tmp/claude-settings.json', 'C:/tmp/codex-notify.cjs'),
        `${vendor} --version`
      ].join('\n')
      const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, encoding: 'utf8', stdio: 'pipe' })
      expect(output).toContain('AGENT_LAUNCHED')
      expect(output).toContain('--version')
    } finally { rmSync(folder, { recursive: true, force: true }) }
  })
  it('a PowerShell claude command guards on Get-Command and passes --settings a file path', () => {
    const cmd = turnSignalInitCommand('claude', 'powershell', 'C:/tmp/claude-settings.json', '')
    expect(cmd).toContain('Get-Command claude -CommandType Application')
    expect(cmd).toContain('function claude {')
    expect(cmd).toContain("--settings 'C:/tmp/claude-settings.json'")
    expect(cmd).toContain('@args')
  })

  it('a PowerShell claude command forward-slashes a Windows path, never embedding a backslash', () => {
    const cmd = turnSignalInitCommand('claude', 'powershell', 'C:\\Users\\me\\AppData\\claude-settings.json', '')
    expect(cmd).toContain('C:/Users/me/AppData/claude-settings.json')
    expect(cmd).not.toContain('\\')
  })

  it('a posix claude command guards on command -v and uses command to bypass itself', () => {
    const cmd = turnSignalInitCommand('claude', 'posix', '/tmp/claude-settings.json', '')
    expect(cmd).toContain('command -v claude')
    expect(cmd).toContain("claude() { command claude --settings '/tmp/claude-settings.json'")
    expect(cmd).toContain('"$@"')
  })

  it('a PowerShell codex command builds a notify config naming the notifier file', () => {
    const cmd = turnSignalInitCommand('codex', 'powershell', '', 'C:/tmp/codex-notify.cjs')
    expect(cmd).toContain('Get-Command codex -CommandType Application')
    expect(cmd).toContain('notify=[\\"node\\",\\"C:/tmp/codex-notify.cjs\\"]')
  })

  it('a posix codex command guards on command -v and bypasses itself', () => {
    const cmd = turnSignalInitCommand('codex', 'posix', '', '/tmp/codex-notify.cjs')
    expect(cmd).toContain('command -v codex')
    expect(cmd).toContain('codex() { command codex -c')
    expect(cmd).toContain('notify=["node","/tmp/codex-notify.cjs"]')
  })

  it('a codex notifier path is forward-slashed too, for the same reason', () => {
    const cmd = turnSignalInitCommand('codex', 'powershell', '', 'C:\\Users\\me\\codex-notify.cjs')
    expect(cmd).toContain('C:/Users/me/codex-notify.cjs')
    expect(cmd).not.toContain('C:\\Users')
  })
})
