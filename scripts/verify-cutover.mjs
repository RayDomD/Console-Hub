import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'

/**
 * Extraction step 11: the installed Console Hub and a packaged Cockpit, together.
 *
 *   node scripts/verify-cutover.mjs <path to packaged Cockpit.exe>
 *
 * Runs against the real installed Console Hub and its real user data, so it
 * only rejects Workspace proposals and never applies, rejects, or retries a
 * Mission. A project handoff starts the configured default agent in the
 * current Workspace without sending it a prompt. Cockpit runs in a throwaway
 * profile so it can sit beside a working Cockpit.
 */

const cockpitExe = resolve(process.argv[2] ?? '')
const hubExe = join(process.env.LOCALAPPDATA, 'Programs', 'Console Hub', 'Console Hub.exe')
const hubData = join(process.env.APPDATA, 'Console Hub')
const errorLog = join(hubData, 'console-hub-errors.log')
const HUB_IMAGE = 'Console Hub.exe'
assert.ok(existsSync(cockpitExe), `Packaged Cockpit not found: ${cockpitExe}`)
assert.ok(existsSync(hubExe), `Installed Console Hub not found: ${hubExe}`)

const hubPids = () => execFileSync('tasklist', ['/FI', `IMAGENAME eq ${HUB_IMAGE}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' })
  .split('\n').filter((line) => line.includes(HUB_IMAGE)).map((line) => Number(line.split('","')[1]))
const logLines = () => existsSync(errorLog) ? readFileSync(errorLog, 'utf8').split('\n').filter(Boolean).length : 0
const wait = (ms) => new Promise((done) => setTimeout(done, ms))
async function until(check, message, timeout = 20_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) { if (await check()) return; await wait(200) }
  throw new Error(message)
}
const passed = []
const pass = (line) => { passed.push(line); console.log(`PASS ${line}`) }

assert.deepEqual(hubPids(), [], 'Close Console Hub before running this check')
const cockpitProfile = mkdtempSync(join(tmpdir(), 'cockpit-cutover-'))
const launchCockpit = () => electron.launch({ executablePath: cockpitExe, args: [`--user-data-dir=${cockpitProfile}`] })

// 1. Direct launch of the installed Console Hub.
const hub = await electron.launch({ executablePath: hubExe })
const hubWindow = await hub.firstWindow()
const hubErrors = []
hubWindow.on('pageerror', (error) => hubErrors.push(String(error)))
await hubWindow.locator('[data-verify="app-root"]').waitFor({ timeout: 20_000 })
const workspace = await hubWindow.evaluate(() => window.consoleHub.fan.workspace())
assert.ok(workspace, 'Installed Console Hub has no Workspace to hand off to')
const sequence = async () => (await hubWindow.evaluate(() => window.consoleHub.launch.current()))?.sequence ?? 0
pass(`direct launch: installed Console Hub opened on Workspace ${workspace}`)

let cockpit = await launchCockpit()
let cockpitWindow = await cockpit.firstWindow()
await cockpitWindow.locator('[data-verify="console-hub-entry"]').waitFor()
try {
  // 2. Generic launch from Cockpit's Rest plate focuses the running Hub, with no agent.
  const beforeGeneric = await sequence()
  const agentsBefore = (await hubWindow.evaluate(() => window.consoleHub.consoles.list())).filter((item) => item.agent).length
  await cockpitWindow.locator('[data-verify="console-hub-entry"] button').click()
  await until(async () => await sequence() > beforeGeneric, 'Generic Cockpit launch never reached Console Hub')
  assert.deepEqual((await hubWindow.evaluate(() => window.consoleHub.launch.current())).request, { action: 'open' })
  assert.equal(hubPids().length > 0, true)
  await wait(1500)
  assert.equal((await hubWindow.evaluate(() => window.consoleHub.consoles.list())).filter((item) => item.agent).length, agentsBefore, 'Generic launch started an agent')
  pass('generic Cockpit launch: running Console Hub received { action: open } and started no agent')

  // 3. Project handoff for the current Workspace starts or focuses the default agent there.
  const beforeProject = await sequence()
  assert.deepEqual(await cockpitWindow.evaluate((path) => window.cockpit.consoleHub.launch({ action: 'project', workspace: path }), workspace), { ok: true })
  await until(async () => await sequence() > beforeProject, 'Project handoff never reached Console Hub')
  await until(async () => (await hubWindow.evaluate(() => window.consoleHub.consoles.list())).some((item) => item.agent && item.cwd === workspace),
    'Project handoff did not open an agent in the Workspace', 30_000)
  const agentsAfterProject = (await hubWindow.evaluate(() => window.consoleHub.consoles.list())).filter((item) => item.agent).length
  pass(`project handoff: default agent running in ${workspace}`)

  // 4. A repeated project handoff while that session runs focuses it instead of starting another.
  const beforeRepeat = await sequence()
  await cockpitWindow.evaluate((path) => window.cockpit.consoleHub.launch({ action: 'project', workspace: path }), workspace)
  await until(async () => await sequence() > beforeRepeat, 'Repeated handoff never reached Console Hub')
  await wait(3000)
  assert.equal((await hubWindow.evaluate(() => window.consoleHub.consoles.list())).filter((item) => item.agent).length, agentsAfterProject, 'Repeated handoff started a second agent')
  pass('repeated project handoff: focused the open agent session, no second agent')

  // 5. A different Workspace waits for acceptance; rejecting it keeps the current one.
  const alternate = [resolve('.'), 'C:\\FIles\\Cockpit-hub-cutover'].find((path) => path.toLowerCase() !== workspace.toLowerCase() && existsSync(path))
  await cockpitWindow.evaluate((path) => window.cockpit.consoleHub.launch({ action: 'open', workspace: path }), alternate)
  await until(async () => (await hubWindow.evaluate(() => window.consoleHub.launch.pending()))?.request.workspace === alternate, 'Different Workspace was not held for acceptance')
  const pending = await hubWindow.evaluate(() => window.consoleHub.launch.pending())
  await hubWindow.getByRole('region', { name: 'Incoming Workspace' }).waitFor()
  await hubWindow.evaluate(() => window.consoleHub.launch.reject())
  assert.equal(await hubWindow.evaluate(() => window.consoleHub.fan.workspace()), workspace)
  pass(`different Workspace: held for acceptance${pending.blocked ? ' and blocked by the unresolved Mission' : ''}; rejection kept ${workspace}`)

  // 6. Malformed protocol input changes nothing and is logged.
  const beforeMalformed = { sequence: await sequence(), log: logLines() }
  for (const url of ['consolehub://launch/v2', 'consolehub://launch/v1?workspace=relative', 'consolehub://launch/v1?action=install']) {
    spawnSync('cmd.exe', ['/c', 'start', '""', url], { windowsHide: true })
  }
  await until(() => logLines() >= beforeMalformed.log + 3, 'Malformed launches were not logged')
  assert.equal(await sequence(), beforeMalformed.sequence)
  assert.equal(await hubWindow.evaluate(() => window.consoleHub.launch.pending()), undefined)
  assert.equal(await hubWindow.evaluate(() => window.consoleHub.fan.workspace()), workspace)
  pass('malformed protocol input: three bad URLs rejected, logged, no state change')

  // 7. Cockpit quits; Console Hub and its agent keep running.
  await cockpit.close()
  await wait(3000)
  assert.ok(hubPids().length > 0, 'Console Hub exited with Cockpit')
  const survivors = (await hubWindow.evaluate(() => window.consoleHub.consoles.list())).filter((item) => item.agent && item.cwd === workspace)
  assert.ok(survivors.length > 0, 'Agent session ended with Cockpit')
  pass('Cockpit quit: Console Hub and its agent session kept running')

  // 8. Console Hub quits; Cockpit is unaffected and relaunches.
  for (const item of await hubWindow.evaluate(() => window.consoleHub.consoles.list())) {
    await hubWindow.evaluate((id) => window.consoleHub.consoles.close(id), item.id)
  }
  assert.deepEqual(hubErrors, [])
  await hub.close()
  await until(() => hubPids().length === 0, 'Console Hub did not quit')
  cockpit = await launchCockpit()
  cockpitWindow = await cockpit.firstWindow()
  await cockpitWindow.locator('[data-verify="console-hub-entry"]').waitFor()
  pass('Console Hub quit: exited cleanly and Cockpit relaunched unaffected')

  // 9. Cold launch from Cockpit starts Console Hub, which then outlives Cockpit.
  await cockpitWindow.locator('[data-verify="console-hub-entry"] button').click()
  await until(() => hubPids().length > 0, 'Cold Cockpit launch did not start Console Hub')
  await cockpit.close()
  await wait(3000)
  assert.ok(hubPids().length > 0, 'Cold-launched Console Hub exited with Cockpit')
  execFileSync('taskkill', ['/IM', HUB_IMAGE])
  await until(() => hubPids().length === 0, 'Cold-launched Console Hub did not close on request')
  pass('cold launch from Cockpit: Console Hub started through the OS, outlived Cockpit, then closed on request')
} finally {
  await cockpit.close().catch(() => undefined)
  await hub.close().catch(() => undefined)
}
console.log(`\n${passed.length}/9 cutover scenarios passed.`)
