import { afterEach, describe, expect, it, vi } from 'vitest'
import { TerminalInput, PASTE_SUBMIT_DELAY_MS } from './terminalInput'

afterEach(() => vi.useRealTimers())
describe('terminal paste submission', () => {
  it('sends Enter separately after the paste guard window, exactly once', async () => {
    vi.useFakeTimers()
    const write = vi.fn()
    const input = new TerminalInput(write)
    input.write('\x1b[200~Task\nDetails\x1b[201~\r')
    expect(write.mock.calls).toEqual([['\x1b[200~Task\nDetails\x1b[201~']])
    await vi.advanceTimersByTimeAsync(PASTE_SUBMIT_DELAY_MS - 1)
    expect(write).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(write.mock.calls).toEqual([['\x1b[200~Task\nDetails\x1b[201~'], ['\r']])
  })
  it('cancels a pending Enter when the user intervenes or the session ends', async () => {
    vi.useFakeTimers()
    const write = vi.fn()
    const input = new TerminalInput(write)
    input.write('\x1b[200~Task\x1b[201~\r')
    input.write('\x03')
    await vi.runAllTimersAsync()
    expect(write.mock.calls).toEqual([['\x1b[200~Task\x1b[201~'], ['\x03']])
    write.mockClear()
    input.write('\x1b[200~Task\x1b[201~\r')
    input.cancel()
    await vi.runAllTimersAsync()
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('keeps a pending Enter when terminal focus or mouse reporting arrives', async () => {
    vi.useFakeTimers()
    const write = vi.fn()
    const input = new TerminalInput(write)
    input.write('\x1b[200~Mission plan\x1b[201~\r')
    input.write('\x1b[I')
    input.write('\x1b[<0;12;8M')

    await vi.runAllTimersAsync()

    expect(write.mock.calls).toEqual([
      ['\x1b[200~Mission plan\x1b[201~'],
      ['\x1b[I'],
      ['\x1b[<0;12;8M'],
      ['\r']
    ])
  })
})
