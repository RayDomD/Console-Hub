import { describe, expect, it, vi } from 'vitest'
import { claimSingleInstance } from './singleInstance'

describe('claimSingleInstance', () => {
  it('quits without registering a handler when another instance owns the lock', () => {
    const quit = vi.fn()
    const on = vi.fn()

    expect(claimSingleInstance({ requestSingleInstanceLock: () => false, quit, on }, { getAllWindows: () => [] })).toBe(false)
    expect(quit).toHaveBeenCalledOnce()
    expect(on).not.toHaveBeenCalled()
  })

  it('restores and focuses the existing window on a second launch', () => {
    const restore = vi.fn()
    const show = vi.fn()
    const focus = vi.fn()
    const on = vi.fn()
    const window = { isMinimized: () => true, restore, show, focus }

    expect(claimSingleInstance({ requestSingleInstanceLock: () => true, quit: vi.fn(), on }, { getAllWindows: () => [window] })).toBe(true)
    const listener = on.mock.calls.find(([event]) => event === 'second-instance')?.[1]
    expect(listener).toBeTypeOf('function')
    listener?.()
    expect(restore).toHaveBeenCalledOnce()
    expect(show).toHaveBeenCalledOnce()
    expect(focus).toHaveBeenCalledOnce()
  })
})
