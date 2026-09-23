import { createServer, type Server } from 'node:http'

/**
 * The one local listener every scoped `claude`/`codex` shell function phones
 * home to. A notifier script is a separate OS process by the time it runs -
 * it cannot reach Electron's `ipcMain` directly - so a loopback HTTP POST is
 * the plainest bridge back into this one.
 */

let server: Server | undefined
let port: number | undefined
let onTurnComplete: ((consoleId: string) => void) | undefined

export function startTurnSignalServer(listener: (consoleId: string) => void): Promise<number> {
  onTurnComplete = listener
  if (server && port !== undefined) return Promise.resolve(port)

  return new Promise((resolve, reject) => {
    const s = createServer((req, res) => {
      if (req.method !== 'POST' || req.url !== '/turn-complete') {
        res.writeHead(404).end()
        return
      }
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        res.writeHead(204).end()
        try {
          const parsed = JSON.parse(body) as { consoleId?: unknown }
          if (typeof parsed.consoleId === 'string') onTurnComplete?.(parsed.consoleId)
        } catch {
          // A malformed report is discarded, not crashed on - the listener
          // outlives any one console's notifier having a bad day.
        }
      })
    })
    // Loopback only: nothing outside this machine should ever be able to
    // report a console's turn as complete.
    s.listen(0, '127.0.0.1', () => {
      const address = s.address()
      if (address === null || typeof address === 'string') {
        reject(new Error('Turn signal server did not bind to a TCP port'))
        return
      }
      server = s
      port = address.port
      resolve(port)
    })
    s.on('error', reject)
  })
}

export function stopTurnSignalServer(): void {
  server?.close()
  server = undefined
  port = undefined
  onTurnComplete = undefined
}
