import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { _electron as electron } from 'playwright'

const orchestratorVendor = process.argv[2] ?? 'claude'
assert.ok(['claude', 'codex', 'agy'].includes(orchestratorVendor))
const auto = process.argv.includes('--auto')
const output = resolve('out/console-delegation', orchestratorVendor, String(Date.now()))
const profile = resolve(output, 'profile')
const workspace = resolve(output, 'workspace')
const received = resolve(output, 'received.json')
const fake = resolve(output, 'agent.cjs')
const messages = () => existsSync(received) ? readFileSync(received, 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : []
async function waitFor(check, message) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (check()) return
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  throw new Error(message)
}
mkdirSync(profile, { recursive: true })
mkdirSync(workspace, { recursive: true })
writeFileSync(resolve(profile, 'console-hub.config.json'), JSON.stringify({
  vaultRoot: workspace, fanWorkspace: workspace, corpusRoots: [],
  claudeBin: resolve(output, 'claude.cmd'), codexBin: resolve(output, 'codex.cmd'), agyBin: resolve(output, 'agy.cmd')
}))

writeFileSync(fake, `
const fs = require('node:fs');
const vendor = process.argv[2];
const received = ${JSON.stringify(received)};
if (vendor === 'agy' && process.argv[3] === 'models') { process.stdout.write('gemini-3.7-flash-low\\n'); process.exit(0); }
process.stdin.setRawMode?.(true);
process.stdin.resume();
process.stdout.write('Local ' + vendor + ' ready.\\r\\n> ');
let buffer = '';
process.stdin.on('data', chunk => {
  buffer += chunk.toString();
  if (buffer.includes('\\x15')) buffer = buffer.slice(buffer.lastIndexOf('\\x15') + 1);
  let end;
  while ((end = buffer.indexOf('\\r')) >= 0) {
    const text = buffer.slice(0, end).replace(/\\x1b\\[20[01]~/g, '');
    buffer = buffer.slice(end + 1);
    if (!text.trim()) continue;
    fs.appendFileSync(received, JSON.stringify({ vendor, text }) + '\\n');
    if (text.includes('Save the delegation to this exact plan file:')) {
      const path = /Save the delegation to this exact plan file: (.+?)\\. Write/.exec(text)?.[1];
      const ready = /Ready file: ([^\\r\\n]+)/.exec(text)?.[1] || /write "ready" to (.+?)\\. This signals/.exec(text)?.[1];
      if (!path || !ready) throw new Error('Delegation paths missing');
      fs.writeFileSync(path + '.tmp', '### T1\\nInspect A\\n### T2\\nInspect B\\n### T3\\nInspect C');
      fs.renameSync(path + '.tmp', path);
      fs.writeFileSync(ready, 'ready');
      process.stdout.write('Delegation plan saved.\\r\\n> ');
    } else if (text.includes('Write your final result as UTF-8 text to this exact file:')) {
      const path = /Write your final result as UTF-8 text to this exact file: ([^\\r\\n]+)/.exec(text)?.[1];
      if (!path) throw new Error('Result path missing');
      fs.writeFileSync(path + '.tmp', vendor + ' verified its assigned source.');
      fs.renameSync(path + '.tmp', path);
      process.stdout.write('Worker result saved.\\r\\n> ');
    } else {
      const ready = /Ready file: ([^\\r\\n]+)/.exec(text)?.[1] || /write "ready" to (.+?)\\. This signals/.exec(text)?.[1];
      if (ready) fs.writeFileSync(ready, 'ready');
      process.stdout.write(text.includes('completed worker results')
        ? 'Combined: Claude, Codex, and AGY verified their assigned sources.\\r\\n> '
        : 'Native input received.\\r\\n> ');
    }
  }
});
`)
for (const vendor of ['claude', 'codex', 'agy']) {
  writeFileSync(resolve(output, `${vendor}.cmd`), `@echo off\r\n"${process.execPath}" "${fake}" ${vendor} %*\r\n`)
}

const app = await electron.launch({ args: ['.', '--no-sandbox', '--disable-gpu'], env: {
  ...process.env, CONSOLE_HUB_VERIFY_PROFILE: profile, PATH: `${output};${process.env.PATH}`, TERM: 'xterm-256color'
} })
try {
  const win = await app.firstWindow()
  const errors = []
  win.on('pageerror', (error) => errors.push(String(error)))
  await win.waitForSelector('[data-verify="app-root"]')
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('fan:agyModels')
    ipcMain.handle('fan:agyModels', () => ['gemini-3.7-flash-low'])
  })
  await win.locator('nav button', { hasText: 'Console' }).click({ force: true })
  const lineup = win.locator('[data-verify-unit="ConsoleLineup"]')
  const orchestrator = win.locator('[data-verify-unit="ConsoleOrchestrator"]')
  await lineup.locator('summary', { hasText: 'Configure fleet & workspace' }).click({ force: true })
  await lineup.getByLabel('agy model').selectOption('gemini-3.7-flash-low')
  for (const vendor of ['claude', 'codex', 'agy']) {
    await lineup.getByRole('button', { name: `Launch ${vendor}`, exact: true }).click()
    await win.waitForFunction((count) => document.querySelectorAll('[data-verify="console-view"]').length === count, ['claude', 'codex', 'agy'].indexOf(vendor) + 1)
  }
  await orchestrator.getByLabel('Orchestrator vendor').selectOption(orchestratorVendor)
  if (orchestratorVendor === 'codex') await orchestrator.getByLabel('Orchestrator model').selectOption('gpt-5.6-terra')
  if (orchestratorVendor === 'agy') await orchestrator.getByLabel('Orchestrator model').selectOption('gemini-3.7-flash-low')
  await orchestrator.getByRole('button', { name: 'Start Orchestrator' }).click()
  await win.waitForFunction(() => document.querySelector('[data-verify-unit="ConsoleOrchestrator"]')?.getAttribute('data-verify-status') === 'ready')
  if (auto) {
    const input = orchestrator.locator('.xterm-helper-textarea')
    await input.focus()
    await win.keyboard.type('/delegate Compare three modules and report findings')
    await win.keyboard.press('Enter')
  } else {
    await orchestrator.getByLabel('Delegate to workers').fill('Compare three modules and report findings')
    await orchestrator.getByRole('button', { name: 'Prepare plan' }).click()
    await win.waitForFunction(() => document.querySelector('[data-verify-unit="ConsoleOrchestrator"]')?.getAttribute('data-verify-plan-ready') === 'true', undefined, { timeout: 20000 })
    assert.match(await orchestrator.locator('pre').innerText(), /### T1[\s\S]*### T2[\s\S]*### T3/)
    await orchestrator.evaluate((element) => element.scrollIntoView({ block: 'start' }))
    await win.screenshot({ path: resolve(output, 'plan-held.png') })
    assert.equal(messages().some((message) => message.text.includes('Write your final result as UTF-8 text')), false)
    await orchestrator.getByRole('button', { name: 'Release to workers' }).click()
    await win.waitForFunction(() => document.querySelector('[data-verify-unit="ConsoleOrchestrator"]')?.getAttribute('data-verify-plan-ready') === 'false')
  }
  await win.waitForFunction(() => document.body.textContent?.includes('Run · complete'), undefined, { timeout: 30000 })
  await win.waitForFunction(async () => (await window.consoleHub.consoleConversation.run())?.collected === true, undefined, { timeout: 30000 })
  await waitFor(() => messages().some((message) => message.text.includes('completed worker results')), 'Orchestrator did not receive collected results')
  const recorded = messages()
  if (auto) assert.equal(recorded.some((message) => message.text.startsWith('/delegate')), false, 'App command reached a vendor CLI')
  for (const vendor of ['claude', 'codex', 'agy']) {
    assert.ok(recorded.some((message) => message.vendor === vendor && message.text.includes('Write your final result as UTF-8 text')), `${vendor} worker did not receive its task`)
  }
  assert.ok(recorded.some((message) => message.text.includes('completed worker results') &&
    message.text.includes('claude verified') && message.text.includes('codex verified') && message.text.includes('agy verified')))
  await win.waitForFunction(() => document.querySelector('[data-verify-unit="ConsoleOrchestrator"] .xterm-rows')?.textContent?.includes('Combined: Claude, Codex, and AGY'), undefined, { timeout: 10000 })
  assert.deepEqual(errors, [])
  const screenshot = resolve(output, 'delegation.png')
  await win.screenshot({ path: screenshot })
  console.log(`PASS: ${orchestratorVendor} Orchestrator, ${auto ? '/delegate automatic release' : 'reviewed plan and explicit release'}, three CLI worker terminals, result files, and combined handoff. No paid model requests. No page errors.`)
  console.log(`Screenshot: ${screenshot}`)
} catch (error) {
  const win = await app.firstWindow()
  const screenshot = resolve(output, 'failure.png')
  await win.screenshot({ path: screenshot })
  console.log('Run state:', await win.evaluate(() => window.consoleHub.consoleConversation.run()))
  console.log('Orchestrator state:', await win.evaluate(() => window.consoleHub.consoleConversation.terminal.state()))
  console.log(`Failure screenshot: ${screenshot}`)
  throw error
} finally {
  await app.close()
}
