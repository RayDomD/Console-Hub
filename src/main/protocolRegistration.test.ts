import { describe, expect, it } from 'vitest'
import { LAUNCH_SCHEME, registerLaunchProtocol } from './protocolRegistration'

function fakeApp(packaged: boolean, registered: boolean) {
  const calls: string[] = []
  return {
    calls,
    isPackaged: packaged,
    isDefaultProtocolClient: (scheme: string) => { calls.push(`is:${scheme}`); return registered },
    setAsDefaultProtocolClient: (scheme: string) => { calls.push(`set:${scheme}`); return true }
  }
}

describe('registerLaunchProtocol', () => {
  it('repairs a missing consolehub registration in the installed app', () => {
    const app = fakeApp(true, false)
    expect(registerLaunchProtocol(app)).toBe(true)
    expect(app.calls).toEqual([`is:${LAUNCH_SCHEME}`, `set:${LAUNCH_SCHEME}`])
  })

  it('leaves an existing registration alone', () => {
    const app = fakeApp(true, true)
    expect(registerLaunchProtocol(app)).toBe(true)
    expect(app.calls).toEqual([`is:${LAUNCH_SCHEME}`])
  })

  it('never points the scheme at a development Electron binary', () => {
    const app = fakeApp(false, false)
    expect(registerLaunchProtocol(app)).toBe(false)
    expect(app.calls).toEqual([])
  })
})
