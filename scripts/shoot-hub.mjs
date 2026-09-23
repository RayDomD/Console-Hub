import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { _electron as electron } from 'playwright'

const output = resolve('out/hub-standalone.png')
mkdirSync(resolve('out'), { recursive: true })

const packaged = process.argv.includes('--packaged')
const app = await electron.launch(packaged
  ? { executablePath: resolve('release/win-unpacked/Console Hub.exe'), args: ['--no-sandbox', '--disable-gpu'] }
  : { args: ['.', '--no-sandbox', '--disable-gpu'] })
const window = await app.firstWindow()
const errors = []
window.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
window.on('pageerror', (error) => errors.push(String(error)))

try {
  await window.locator('[data-verify="app-root"][data-fonts="ready"]').waitFor({ timeout: 15000 })
  await window.locator('aside[aria-label="Console navigation"]').waitFor({ timeout: 8000 })
  await window.screenshot({ path: output })
  console.log(`shot: ${output}`)

  await window.getByRole('button', { name: /Explore/ }).first().click()
  await window.getByRole('region', { name: 'Question fan' }).waitFor({ timeout: 8000 })
  const exploreOutput = resolve('out/hub-explore.png')
  await window.screenshot({ path: exploreOutput })
  console.log(`shot: ${exploreOutput}`)

  await window.locator('nav[aria-label="Hub activities"] button').filter({ hasText: 'Console' }).click()
  await window.locator('[data-verify="console-lineup"]').waitFor({ state: 'attached', timeout: 8000 })
  const consoleOutput = resolve('out/hub-console.png')
  await window.screenshot({ path: consoleOutput })
  console.log(`shot: ${consoleOutput}`)
} finally {
  await app.close()
}

if (errors.length > 0) {
  for (const error of errors) console.error(error)
  process.exitCode = 1
} else {
  console.log('Zero renderer errors observed.')
}
