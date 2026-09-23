import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { _electron as electron } from 'playwright'

const output = resolve('out/console-launchers')
mkdirSync(output, { recursive: true })
const app = await electron.launch({
  args: ['.', '--no-sandbox', '--disable-gpu'],
  env: { ...process.env, CONSOLE_HUB_VERIFY_PROFILE: resolve(output, `profile-${Date.now()}`) }
})
const problems = []
try {
  const win = await app.firstWindow()
  // Keep the real PTY service while substituting an echo for paid agent clients.
  // The recorded request proves each button sent its actual startup command.
  await app.evaluate(({ ipcMain }) => {
    const original = ipcMain._invokeHandlers.get('consoles:open')
    globalThis.launchRequests = []
    ipcMain.removeHandler('launch:check-agent')
    ipcMain.handle('launch:check-agent', () => ({ ok: true }))
    let workspace
    ipcMain.removeHandler('fan:workspace')
    ipcMain.handle('fan:workspace', () => workspace)
    ipcMain.removeHandler('fan:setWorkspace')
    ipcMain.handle('fan:setWorkspace', (_event, value) => { workspace = value; return { workspace } })
    ipcMain.removeHandler('consoles:open')
    ipcMain.handle('consoles:open', async (event, spec) => {
      globalThis.launchRequests.push(spec)
      const info = await original(event, { ...spec, agent: undefined, ...(spec.agent ? { initCommand: `echo consolehub-launch-${spec.agent.vendor}` } : {}) })
      return { ...info, agent: spec.agent }
    })
  })
  await win.evaluate(() => {
    window.consoleSmokeErrors = []
    window.consoleHub.consoles.onEvent((event) => {
      if (event.type === 'data' && /Exception|PSConsoleReadLine/.test(event.chunk)) window.consoleSmokeErrors.push(event.chunk)
    })
  })
  win.on('pageerror', (error) => problems.push(String(error)))
  await win.waitForSelector('[data-verify="app-root"]')
  await win.locator('nav button', { hasText: 'Console' }).click()
  const root = win.locator('[data-verify-unit="ConsoleLineup"]')
  await root.waitFor()
  assert.equal(await root.getAttribute('data-verify-count'), '0')
  assert.equal(await root.locator('[data-verify="console-lineup-add"]').count(), 0)
  assert.equal(await root.getByRole('navigation', { name: 'Console stages' }).count(), 0)
  await root.locator('summary').first().click()
  await win.getByLabel('Workspace for new terminals').fill(process.cwd())
  await win.getByLabel('claude model', { exact: true }).selectOption('sonnet')
  await win.getByLabel('claude effort', { exact: true }).selectOption('medium')
  for (const name of ['Codex', 'Claude', 'AGY']) {
    await root.getByRole('button', { name, exact: true }).click()
  }
  await win.waitForFunction(() => document.querySelectorAll('[data-verify="console-cwd"]').length === 3 &&
    [...document.querySelectorAll('[data-verify="console-cwd"]')].every((el) => !el.textContent.includes('opening')))
  const requests = await app.evaluate(() => globalThis.launchRequests)
  assert.deepEqual(requests.filter((spec) => spec.agent).map((spec) => spec.agent.vendor), ['codex', 'claude', 'agy'])
  assert.ok(requests.filter((spec) => spec.agent).every((spec) => spec.cwd === process.cwd()))
  assert.deepEqual(requests.find((spec) => spec.agent?.vendor === 'claude').agent, { vendor: 'claude', model: 'sonnet', effort: 'medium' })
  assert.equal(await win.locator('[data-verify="console-live-stack"] button').count(), 4)
  await win.locator('[data-verify="console-live-stack"] button').filter({ hasText: 'T2' }).click()
  assert.ok(await win.locator('[data-verify-label="T2"] .xterm-helper-textarea').evaluate((el) => el === document.activeElement))
  await win.locator('[data-verify="console-live-stack"] button').filter({ hasText: 'Orchestrator' }).click()
  await root.evaluate((el) => { el.closest('main').scrollTop = 0 })
  await win.screenshot({ path: resolve(output, 'launchers.png') })
  await app.evaluate(({ ipcMain }, folder) => ipcMain._invokeHandlers.get('fan:setWorkspace')({}, folder), output)
  for (let count = 3; count < 6; count++) {
    await root.getByRole('button', { name: 'Shell', exact: true }).click()
    await win.waitForFunction((expected) => document.querySelector('[data-verify-unit="ConsoleLineup"]')?.getAttribute('data-verify-count') === String(expected), count + 1)
  }
  assert.equal(await app.evaluate(() => globalThis.launchRequests.at(-1).cwd), output)
  assert.equal(await root.getAttribute('data-verify-count'), '6')
  assert.equal(await root.locator('[aria-label="Add terminal"] button:disabled').count(), 4)
  await root.locator('[data-verify="console-close"]').last().click()
  assert.equal(await root.getAttribute('data-verify-count'), '5')
  await win.waitForFunction(() => [...document.querySelectorAll('[data-verify="console-cwd"]')].every((el) => !el.textContent.includes('opening')))
  const ids = await win.evaluate(() => window.consoleHub.consoles.list())
  const labels = await root.locator('[data-verify="console-view"]').evaluateAll((elements) => elements.map((el) => el.getAttribute('data-verify-label')))
  const targets = Object.fromEntries(labels.map((label, index) => [label, ids[index].id]))
  await app.evaluate(({ ipcMain, BrowserWindow }, labels) => {
    const state = ipcMain._invokeHandlers.get('console-conversation:current')({})
    state.turn = 'idle'
    state.entries = [
      { kind: 'user', id: 'smoke-user', at: Date.now(), text: 'Local verification: print one line in each test shell.' },
      { kind: 'orchestrator', id: 'smoke-plan', at: Date.now(), phase: 'complete', text: labels.map((label) => `### ${label}\nWrite-Output 'Verified shell result ${label}'`).join('\n') }
    ]
    BrowserWindow.getAllWindows()[0].webContents.send('console-conversation:event', state)
  }, labels)
  const release = await win.evaluate((targets) => window.consoleHub.consoleConversation.send('go', targets), targets)
  assert.equal(release.release.kind, 'released')
  await win.locator('[data-verify-unit="ConsoleOrchestrator"][data-verify-stage="Complete"]').waitFor({ timeout: 20000 })
  const run = await win.evaluate(() => window.consoleHub.consoleConversation.run())
  assert.equal(run.phase, 'complete')
  const results = run.assignments.map((item) => readFileSync(item.resultPath, 'utf8'))
  assert.ok(results.every((text) => text.includes('Verified shell result')))
  assert.deepEqual(await win.evaluate(() => window.consoleSmokeErrors), [])
  assert.equal(run.collected, false, 'Collection waits until an Orchestrator terminal is available')
  await root.locator('summary').first().click()
  await root.evaluate((el) => { el.closest('main').scrollTop = 0 })
  await win.screenshot({ path: resolve(output, 'completed-run.png') })
  console.log('PASS: real shell delegation, automatic file completion and UTF-8 result capture. Collection waits for an Orchestrator terminal.')
  assert.equal(await root.locator('[aria-label="Add terminal"] button:disabled').count(), 0)
  await win.locator('nav button', { hasText: 'Explore' }).click()
  await win.locator('nav button', { hasText: 'Console' }).click()
  assert.equal(await root.getAttribute('data-verify-count'), '5')
  assert.deepEqual(problems, [])
  console.log('PASS: Codex/Claude/AGY startup requests, workspace, six-terminal cap, removal and Recipe-switch persistence. Real PTYs, agent commands replaced by echo. No page errors.')
  console.log(`Screenshot: ${resolve(output, 'launchers.png')}`)
} catch (error) {
  const win = await app.firstWindow()
  await win.screenshot({ path: resolve(output, 'failure.png') })
  throw error
} finally {
  await app.close()
}

