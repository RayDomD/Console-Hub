import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { _electron as electron } from 'playwright'

const orchestratorVendor = process.argv[2] ?? 'claude'
assert.ok(['claude', 'codex', 'agy'].includes(orchestratorVendor), `Unknown Orchestrator vendor: ${orchestratorVendor}`)
const scenario = process.argv[3] ?? 'success'
assert.ok(['success', 'failure', 'adoption', 'reconciliation', 'restart'].includes(scenario), `Unknown Mission scenario: ${scenario}`)
const output = resolve('out/console-orchestrator', orchestratorVendor, scenario, String(Date.now()))
const profile = resolve(output, 'profile')
const workspace = resolve(output, 'workspace')
const vault = resolve(output, 'vault')
const received = resolve(output, 'received.json')
const runnerAttempts = resolve(output, 'runner-attempts.txt')
const fake = resolve(output, 'agent.cjs')
const fakePi = resolve(output, 'pi.cjs')
const adoption = scenario === 'adoption' || scenario === 'reconciliation'
mkdirSync(profile, { recursive: true })
mkdirSync(workspace, { recursive: true })
mkdirSync(vault, { recursive: true })

writeFileSync(resolve(workspace, 'README.md'), '# Mission fixture\n')
writeFileSync(resolve(vault, 'reference.md'), '# Read-only Mission reference\n')
execFileSync('git', ['init'], { cwd: workspace, stdio: 'ignore' })
execFileSync('git', ['add', 'README.md'], { cwd: workspace, stdio: 'ignore' })
execFileSync('git', ['-c', 'user.name=Console Hub Test', '-c', 'user.email=console-hub@test.invalid', 'commit', '-m', 'fixture'], { cwd: workspace, stdio: 'ignore' })
writeFileSync(resolve(profile, 'console-hub.config.json'), JSON.stringify({
  vaultRoot: vault,
  fanWorkspace: workspace,
  claudeBin: resolve(output, 'claude.cmd'),
  codexBin: resolve(output, 'codex.cmd'),
  agyBin: resolve(output, 'agy.cmd'),
  corpusRoots: []
}))

function readMissionState() {
  const root = resolve(profile, 'runs', 'mission', 'missions')
  const latest = readdirSync(root).map((id) => resolve(root, id, 'run.json'))
    .filter(existsSync).sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)[0]
  assert.ok(latest, 'Mission Run Record missing')
  return JSON.parse(readFileSync(latest, 'utf8'))
}

async function waitFor(check, message, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (check()) return
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  throw new Error(message)
}

writeFileSync(fake, `
const fs = require('node:fs');
const vendor = process.argv[2];
const args = process.argv.slice(3);
const received = ${JSON.stringify(received)};
const workspace = ${JSON.stringify(workspace)};
const adoption = ${JSON.stringify(adoption)};

function record(value) {
  const messages = fs.existsSync(received) ? JSON.parse(fs.readFileSync(received, 'utf8')) : [];
  messages.push(value);
  fs.writeFileSync(received, JSON.stringify(messages, null, 2));
}

if (vendor === 'agy' && args[0] === 'models') {
  process.stdout.write('gemini-3.7-flash-low\\n');
  process.exit(0);
}

process.stdin.setRawMode?.(true);
process.stdin.resume();
process.stdout.write('\\x1b[?1004h\\x1b[?1000h\\x1b[?1006hLocal ' + vendor + ' ready.\\r\\n> ');
let buffer = '';
process.stdin.on('data', chunk => {
  buffer += chunk.toString();
  if (buffer.includes('\\x15')) buffer = buffer.slice(buffer.lastIndexOf('\\x15') + 1);
  let end;
  while ((end = buffer.indexOf('\\r')) >= 0) {
    const text = buffer.slice(0, end)
      .replace(/\\x1b\\[20[01]~/g, '')
      .replace(/\\x1b\\[[IO]/g, '')
      .replace(/\\x1b\\[<\\d+;\\d+;\\d+[Mm]/g, '');
    buffer = buffer.slice(end + 1);
    if (!text.trim()) continue;
    record({ vendor, text });
    if (text.includes('Save the Mission plan to this exact plan file:')) {
      const planPath = /Save the Mission plan to this exact plan file: (.+?)\\. Write/.exec(text)?.[1];
      const readyPath = /Ready file: ([^\\r\\n]+)/.exec(text)?.[1]
        || /write "ready" to (.+?)\\. This signals/.exec(text)?.[1];
      if (!planPath || !readyPath) throw new Error('Mission plan paths missing');
      const plan = {
        version: 1,
        title: 'Verify terminal Mission workflow',
        workspace,
        acceptanceCriteria: ['The worker returns and combined review passes.'],
        lanes: [{
          id: 'terminal-flow', workerLabel: 'T1', agent: { vendor: 'agy', model: 'gemini-3.7-flash-low' },
          task: adoption ? 'Create mission-output.txt with the requested verification content.' : 'Return local verification evidence.',
          files: adoption ? ['mission-output.txt'] : [],
          validation: adoption ? ['git diff --check'] : [],
          reviewOnly: !adoption
        }],
        unusedWorkers: [{ label: 'T2', reason: 'The verification is one indivisible lane.' }]
      };
      fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));
      fs.writeFileSync(readyPath, 'ready');
      process.stdout.write('Mission plan ready. T1 will verify the flow; T2 is unused because the check is indivisible. Say "go ahead" to run it.\\r\\n> ');
    } else {
      const readyPath = /Ready file: ([^\\r\\n]+)/.exec(text)?.[1]
        || /write "ready" to (.+?)\\. This signals/.exec(text)?.[1];
      if (readyPath) fs.writeFileSync(readyPath, 'ready');
      process.stdout.write('Native agent input: ' + text + '\\r\\n> ');
    }
  }
});
`)

writeFileSync(fakePi, `
const fs = require('node:fs');
const args = process.argv.slice(2);
const received = ${JSON.stringify(received)};
const runnerAttempts = ${JSON.stringify(runnerAttempts)};
const scenario = ${JSON.stringify(scenario)};
const prompt = args[args.indexOf('--') + 1] || '';
const model = args[args.indexOf('--model') + 1];
const tools = args[args.indexOf('--tools') + 1];
const attempt = fs.existsSync(runnerAttempts) ? Number(fs.readFileSync(runnerAttempts, 'utf8')) + 1 : 1;
fs.writeFileSync(runnerAttempts, String(attempt));
if (scenario === 'adoption' || scenario === 'reconciliation') fs.writeFileSync('mission-output.txt', 'adopted from controlled worker\\n');
const messages = fs.existsSync(received) ? JSON.parse(fs.readFileSync(received, 'utf8')) : [];
messages.push({ controlledRunner: true, model, tools, prompt, attempt });
fs.writeFileSync(received, JSON.stringify(messages, null, 2));
process.stdout.write(JSON.stringify({ type: 'session', id: 'verification-session' }) + '\\n');
if (scenario === 'restart') {
  setInterval(() => {}, 1000);
} else {
  process.stdout.write(JSON.stringify({
    type: 'message_end',
    message: {
      role: 'assistant',
      stopReason: 'stop',
      content: [{ type: 'text', text: scenario === 'failure' && attempt === 1
        ? 'plain text instead of structured evidence'
        : JSON.stringify({
        summary: 'Verified controlled Mission handoff.',
        tests: 'Local Electron scenario.',
        artifacts: [], decisions: [], unresolved: []
      }) }]
    }
  }) + '\\n');
}
`)

for (const vendor of ['claude', 'codex', 'agy']) {
  writeFileSync(resolve(output, `${vendor}.cmd`), `@echo off\r\n"${process.execPath}" "${fake}" ${vendor} %*\r\n`)
}

const launchApp = () => electron.launch({
  args: ['.', '--no-sandbox', '--disable-gpu'],
  env: {
    ...process.env,
    CONSOLE_HUB_VERIFY_PROFILE: profile,
    PATH: `${output};${process.env.PATH}`,
    TERM: 'xterm-256color',
    CONSOLE_HUB_VERIFY_CONTROLLED_RUNNER_ENTRY: fakePi
  }
})
let app = await launchApp()

try {
  let win = await app.firstWindow()
  const errors = []
  win.on('pageerror', error => errors.push(String(error)))
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
  await lineup.getByRole('button', { name: 'Launch agy', exact: true }).click()
  await lineup.getByRole('button', { name: 'Codex', exact: true }).click()
  await win.waitForFunction(() => document.querySelectorAll('[data-verify="console-view"]').length === 2)
  await orchestrator.getByLabel('Orchestrator vendor').selectOption(orchestratorVendor)
  if (orchestratorVendor === 'codex') await orchestrator.getByLabel('Orchestrator model').selectOption('gpt-5.6-terra')
  if (orchestratorVendor === 'agy') await orchestrator.getByLabel('Orchestrator model').selectOption('gemini-3.7-flash-low')
  await orchestrator.getByRole('button', { name: 'Start Orchestrator', exact: true }).click()
  await win.waitForFunction(() => document.querySelector('[data-verify-unit="ConsoleOrchestrator"]')?.getAttribute('data-verify-status') === 'ready')

  const input = orchestrator.locator('.xterm-helper-textarea')
  await input.focus()
  await win.keyboard.type('/mission')
  await win.keyboard.press('Enter')
  await win.waitForFunction(() => document.querySelector('[data-verify-unit="ConsoleOrchestrator"]')?.getAttribute('data-verify-mission-phase') === 'held', undefined, { timeout: 20000 })
  assert.equal(await orchestrator.getByRole('button', { name: 'Run plan', exact: true }).count(), 0)
  assert.equal(await orchestrator.getByText('Review saved delegation plan').count(), 0)

  // The fake terminal enables focus and mouse reporting. Refocusing before approval
  // reproduces the sequence that used to poison SubmittedLine and leak the command.
  await orchestrator.getByRole('button', { name: 'Clear', exact: true }).focus()
  await input.focus()
  await win.keyboard.type('go ahead')
  await win.keyboard.press('Enter')
  if (scenario === 'restart') {
    await win.waitForFunction(() => document.querySelector('[data-verify-unit="ConsoleOrchestrator"]')?.getAttribute('data-verify-mission-phase') === 'running', undefined, { timeout: 30000 })
    await waitFor(() => existsSync(runnerAttempts), 'Controlled worker did not start before restart')
    const retainedPaths = readMissionState().worktrees.filter((item) => item.status !== 'deleted').map((item) => item.path)

    await app.close()
    app = await launchApp()
    win = await app.firstWindow()
    win.on('pageerror', error => errors.push(String(error)))
    await win.waitForSelector('[data-verify="app-root"]')
    await win.locator('nav button', { hasText: 'Console' }).click({ force: true })
    const restartedOrchestrator = win.locator('[data-verify-unit="ConsoleOrchestrator"]')
    await win.waitForFunction(() => document.querySelector('[data-verify-unit="ConsoleOrchestrator"]')?.getAttribute('data-verify-mission-phase') === 'interrupted', undefined, { timeout: 30000 })
    await restartedOrchestrator.getByLabel('Orchestrator vendor').selectOption(orchestratorVendor)
    if (orchestratorVendor === 'codex') await restartedOrchestrator.getByLabel('Orchestrator model').selectOption('gpt-5.6-terra')
    if (orchestratorVendor === 'agy') await restartedOrchestrator.getByLabel('Orchestrator model').selectOption('gemini-3.7-flash-low')
    await restartedOrchestrator.getByRole('button', { name: 'Start Orchestrator', exact: true }).click()
    await win.waitForFunction(() => document.querySelector('[data-verify-unit="ConsoleOrchestrator"]')?.getAttribute('data-verify-status') === 'ready')
    const restartedInput = restartedOrchestrator.locator('.xterm-helper-textarea')
    await restartedInput.focus()
    await win.keyboard.type('reject it')
    await win.keyboard.press('Enter')
    await win.waitForFunction(() => document.querySelector('[data-verify-unit="ConsoleOrchestrator"]')?.getAttribute('data-verify-mission-phase') === 'rejected', undefined, { timeout: 30000 })
    await waitFor(() => readMissionState().worktrees.every((item) => item.status === 'deleted'), 'Restarted Mission worktrees were not recorded as deleted')
    for (const path of retainedPaths) assert.equal(existsSync(path), false, `Restarted Mission worktree was not removed: ${path}`)
    assert.deepEqual(errors, [])
    const screenshot = resolve(output, `${orchestratorVendor}-interrupted-rejected.png`)
    await win.screenshot({ path: screenshot })
    console.log(`PASS: ${orchestratorVendor} Orchestrator restart scenario restored an interrupted Mission and deleted retained worktrees only after explicit rejection. No paid model requests. No page errors.`)
    console.log(`Screenshot: ${screenshot}`)
  } else {
  await win.waitForFunction((expected) => document.querySelector('[data-verify-unit="ConsoleOrchestrator"]')?.getAttribute('data-verify-mission-phase') === expected, scenario === 'failure' ? 'blocked' : 'ready_apply', { timeout: 30000 })

  const t1 = win.locator('[data-verify="console-view"][data-verify-label="T1"]')
  const t2 = win.locator('[data-verify="console-view"][data-verify-label="T2"]')
  if (scenario === 'failure') {
    await win.waitForFunction(() => document.querySelector('[data-verify="console-view"][data-verify-label="T1"]')?.getAttribute('data-verify-status') === 'failed')
    await win.waitForFunction(() => /failed/i.test(document.querySelector('[data-verify-unit="ConsoleOrchestrator"] [role="status"]')?.textContent ?? ''))
    assert.equal(await t1.getAttribute('data-verify-status'), 'failed')
    assert.match(await orchestrator.getByRole('status').innerText(), /failed/i)
    const beforeRetry = JSON.parse(readFileSync(received, 'utf8'))
    assert.equal(beforeRetry.filter(message => message.controlledRunner).length, 1, 'Failure must be reported before another worker attempt starts')
    await win.screenshot({ path: resolve(output, 'failure-reported-before-retry.png') })
    await input.focus()
    await win.keyboard.type('retry T1')
    await win.keyboard.press('Enter')
    await win.waitForFunction(() => document.querySelector('[data-verify-unit="ConsoleOrchestrator"]')?.getAttribute('data-verify-mission-phase') === 'ready_apply', undefined, { timeout: 30000 })
  }
  assert.equal(await t1.getAttribute('data-verify-status'), 'done')
  assert.equal(await t1.getAttribute('data-verify-assignment'), adoption
    ? 'Create mission-output.txt with the requested verification content.'
    : 'Return local verification evidence.')
  assert.equal(await t2.getAttribute('data-verify-status'), 'idle')
  assert.equal(await t2.getAttribute('data-verify-assignment'), 'The verification is one indivisible lane. Live Workspace changes may require reconciliation.')
  assert.deepEqual(errors, [])

  if (scenario === 'adoption' || scenario === 'reconciliation') {
    const beforeApply = readMissionState()
    const retainedPaths = readMissionState().worktrees.filter((item) => item.status !== 'deleted').map((item) => item.path)
    if (scenario === 'reconciliation') writeFileSync(resolve(workspace, 'README.md'), '# Mission fixture\nDestination moved.\n')
    await input.focus()
    await win.keyboard.type('apply it')
    await win.keyboard.press('Enter')
    if (scenario === 'reconciliation') {
      await waitFor(() => {
        const current = readMissionState()
        return current.phase === 'ready_apply' && current.destinationChanged && current.snapshotPath !== beforeApply.snapshotPath
      }, 'Mission did not produce a revalidated reconciliation result')
      await win.waitForFunction(() => /apply it again/i.test(document.querySelector('[data-verify-unit="ConsoleOrchestrator"] [role="status"]')?.textContent ?? ''), undefined, { timeout: 30000 })
      await input.focus()
      await win.keyboard.type('apply it')
      await win.keyboard.press('Enter')
    }
    await win.waitForFunction(() => document.querySelector('[data-verify-unit="ConsoleOrchestrator"]')?.getAttribute('data-verify-mission-phase') === 'applied', undefined, { timeout: 30000 })
    await waitFor(() => readMissionState().worktrees.every((item) => item.status === 'deleted'), 'Mission worktrees were not recorded as deleted')
    assert.equal(readFileSync(resolve(workspace, 'mission-output.txt'), 'utf8').replace(/\r\n/g, '\n'), 'adopted from controlled worker\n')
    if (scenario === 'reconciliation') assert.equal(readFileSync(resolve(workspace, 'README.md'), 'utf8').replace(/\r\n/g, '\n'), '# Mission fixture\nDestination moved.\n')
    for (const path of retainedPaths) assert.equal(existsSync(path), false, `Mission worktree was not removed: ${path}`)
  }

  await orchestrator.evaluate(el => el.scrollIntoView({ block: 'start' }))
  const screenshot = resolve(output, `${orchestratorVendor}-${adoption ? 'applied' : 'ready-to-apply'}.png`)
  await win.screenshot({ path: screenshot })
  const messages = JSON.parse(readFileSync(received, 'utf8'))
  assert.equal(messages.some(message => message.text === 'go ahead'), false, 'Mission approval must not reach the agent CLI')
  const expectedTools = adoption ? 'read,grep,find,ls,bash,edit,write' : 'read,grep,find,ls'
  assert.equal(messages.some(message => message.controlledRunner && message.model === 'google/gemini-3.7-flash-low' && message.tools === expectedTools), true)
  if (scenario === 'failure') assert.equal(messages.filter(message => message.controlledRunner).length, 2)
  assert.equal(messages.some(message => message.vendor === orchestratorVendor && message.text?.includes('Save the Mission plan to this exact plan file:')), true)
  console.log(`PASS: ${orchestratorVendor} Orchestrator ${scenario} scenario, focus-safe natural approval, isolated controlled-worker dispatch, automatic review, compact worker state, and no removed Mission panel controls. No paid model requests. No page errors.`)
  console.log(`Screenshot: ${screenshot}`)
  }
} catch (error) {
  const win = await app.firstWindow()
  const screenshot = resolve(output, 'failure.png')
  await win.screenshot({ path: screenshot })
  console.log(`Failure screenshot: ${screenshot}`)
  throw error
} finally {
  await app.close()
}

