import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'

const config = JSON.parse(readFileSync(join(process.env.APPDATA, 'Console Hub', 'console-hub.config.json'), 'utf8'))
const current = config.fanWorkspace
const alternate = [resolve('.'), resolve('../Cockpit')].find((path) => path.toLowerCase() !== current?.toLowerCase())
if (!alternate) throw new Error('No alternate Workspace is available for the handoff check')

const url = (workspace) => `consolehub://launch/v1?workspace=${encodeURIComponent(workspace)}`
const binary = resolve('node_modules/electron/dist/electron.exe')
const app = await electron.launch({ args: ['.', '--no-sandbox', '--disable-gpu', ...(current ? [url(current)] : [])] })
const window = await app.firstWindow()
const errors = []
window.on('pageerror', (error) => errors.push(String(error)))

try {
  await window.locator('[data-verify="app-root"][data-fonts="ready"]').waitFor({ timeout: 15000 })
  const child = spawn(binary, ['.', '--no-sandbox', '--disable-gpu', url(alternate)], { cwd: resolve('.'), windowsHide: true, stdio: 'ignore' })
  const [code] = await once(child, 'exit')
  if (code !== 0) throw new Error(`Second instance exited ${code}`)
  await window.getByRole('region', { name: 'Incoming Workspace' }).waitFor({ timeout: 10000 })
  await window.getByText(alternate, { exact: true }).waitFor()
  await window.getByRole('button', { name: 'Keep current' }).click()
  await window.getByRole('region', { name: 'Incoming Workspace' }).waitFor({ state: 'detached' })
  if (errors.length) throw new Error(errors.join('\n'))
  console.log('PASS warm handoff: second instance focused the Hub, prompted for Workspace, and rejection kept the current Workspace. Zero page errors.')
} finally {
  await app.close()
}
