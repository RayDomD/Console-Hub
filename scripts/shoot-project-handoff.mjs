import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'

const saved = JSON.parse(readFileSync(join(process.env.APPDATA, 'Console Hub', 'console-hub.config.json'), 'utf8'))
const workspace = saved.fanWorkspace ?? resolve('.')
const profile = resolve('out/project-handoff', `profile-${Date.now()}`)
mkdirSync(profile, { recursive: true })
// Node is a harmless stand-in for a signed-in CLI: it passes the availability
// probe and stays interactive without making a model request.
writeFileSync(join(profile, 'console-hub.config.json'), JSON.stringify({
  fanWorkspace: workspace,
  defaultLaunchAgent: { vendor: 'claude' },
  claudeBin: process.execPath
}))
const url = `consolehub://launch/v1?workspace=${encodeURIComponent(workspace)}&action=project`
const app = await electron.launch({
  args: ['.', '--no-sandbox', '--disable-gpu', url],
  env: { ...process.env, CONSOLE_HUB_VERIFY_PROFILE: profile, ANTHROPIC_API_KEY: 'route-verification-placeholder' }
})
const window = await app.firstWindow()
const errors = []
window.on('pageerror', (error) => errors.push(String(error)))

try {
  await window.locator('[data-verify="app-root"][data-fonts="ready"]').waitFor({ timeout: 15000 })
  await window.locator('nav[aria-label="Hub activities"] button[aria-current="page"]').filter({ hasText: 'Console' }).waitFor({ timeout: 10000 })
  await window.locator('[data-verify="console-lineup"]').waitFor({ state: 'attached', timeout: 10000 })
  await window.waitForFunction(() => document.querySelector('[data-verify="console-lineup"]')?.getAttribute('data-verify-count') === '1')
  const consoles = await window.evaluate(() => window.consoleHub.consoles.list())
  if (consoles.length !== 1 || consoles[0].agent?.vendor !== 'claude' || consoles[0].cwd !== workspace) {
    throw new Error(`Project handoff did not open its configured agent in ${workspace}`)
  }
  if (errors.length) throw new Error(errors.join('\n'))
  console.log('PASS cold project handoff: configured agent started in accepted Workspace, zero page errors, no model request.')
} finally {
  await app.close()
}
