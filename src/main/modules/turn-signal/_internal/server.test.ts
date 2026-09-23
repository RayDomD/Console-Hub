import { afterEach, describe, expect, it } from 'vitest'
import { startTurnSignalServer, stopTurnSignalServer } from './server'

describe('startTurnSignalServer', () => {
  afterEach(() => {
    stopTurnSignalServer()
  })

  it('relays a posted consoleId to the listener', async () => {
    const reported: string[] = []
    const port = await startTurnSignalServer((id) => reported.push(id))

    const res = await fetch(`http://127.0.0.1:${port}/turn-complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ consoleId: 'console-42' })
    })

    expect(res.status).toBe(204)
    // The body is read and parsed asynchronously after the response is sent.
    await new Promise((r) => setTimeout(r, 20))
    expect(reported).toEqual(['console-42'])
  })

  it('reuses the same port across calls instead of opening a second listener', async () => {
    const first = await startTurnSignalServer(() => {})
    const second = await startTurnSignalServer(() => {})
    expect(second).toBe(first)
  })

  it('ignores a malformed body rather than crashing', async () => {
    const reported: string[] = []
    const port = await startTurnSignalServer((id) => reported.push(id))

    const res = await fetch(`http://127.0.0.1:${port}/turn-complete`, {
      method: 'POST',
      body: 'not json'
    })

    expect(res.status).toBe(204)
    await new Promise((r) => setTimeout(r, 20))
    expect(reported).toEqual([])
  })
})
