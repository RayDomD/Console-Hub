import { describe, expect, it } from 'vitest'
import { shellKindOf, withInitCommand } from './shellInit'

describe('shellKindOf', () => {
  it('recognizes powershell and pwsh by name', () => {
    expect(shellKindOf('powershell.exe')).toBe('powershell')
    expect(shellKindOf('C:/Program Files/PowerShell/7/pwsh.exe')).toBe('powershell')
  })

  it('treats anything else as posix', () => {
    expect(shellKindOf('C:/Program Files/Git/bin/bash.exe')).toBe('posix')
    expect(shellKindOf('/bin/zsh')).toBe('posix')
  })
})

describe('withInitCommand', () => {
  it('runs the command via -NoExit -Command on PowerShell, writing no file', () => {
    let wrote = false
    const args = withInitCommand('powershell', ['-NoLogo'], 'function claude { }', () => {
      wrote = true
      return 'unused'
    })
    expect(args).toEqual(['-NoLogo', '-NoExit', '-Command', 'function claude { }'])
    expect(wrote).toBe(false)
  })

  it('writes an rcfile and swaps --login for --rcfile on posix, keeping -i', () => {
    const args = withInitCommand('posix', ['--login', '-i'], 'claude() { :; }', () => '/tmp/rc-1')
    expect(args).toEqual(['-i', '--rcfile', '/tmp/rc-1'])
  })

  it('the posix rcfile replays the login profile chain before the init command', () => {
    let written = ''
    withInitCommand('posix', ['--login', '-i'], 'INIT_MARKER', (contents) => {
      written = contents
      return '/tmp/rc-2'
    })
    expect(written).toContain('.bash_profile')
    expect(written).toContain('.bashrc')
    expect(written.trim().endsWith('INIT_MARKER')).toBe(true)
  })
})
