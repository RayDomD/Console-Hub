import { MISSION_DRAFT_INSTRUCTIONS } from './missionDraft'

/** Generated beside the scoped Orchestrator CLAUDE.md, never installed globally or in the user's workspace. */
export const MISSION_SKILL = `---
name: mission
description: Prepare a Console Hub Mission from this conversation and save it for review and release.
disable-model-invocation: true
---

Prepare a Mission for the request discussed in this terminal. Additional user direction: $ARGUMENTS

1. Run: node "${'${CLAUDE_SKILL_DIR}'}/context.cjs". Read its JSON output. If it reports an error, stop and explain it. Never reuse paths from an earlier invocation.
2. Use the current conversation and supplied worker list to prepare the plan. If the task is unclear, ask the user before drafting. Do not launch or message workers yourself.
3. Follow this Console Hub plan protocol:

${MISSION_DRAFT_INSTRUCTIONS}

4. Save the JSON to the exact planPath from the helper using a temporary sibling and atomic rename. Do not release it. Present the complete plan in the terminal and tell the user to say "go ahead" or type /mission run after review.
5. At the end, including when asking a clarification question, write "ready" to readyPath. This signals Orchestrator readiness, not Mission completion.
`

export const MISSION_HELPER = `const { randomUUID } = require('node:crypto')
const { readFile, writeFile, rename } = require('node:fs/promises')
const { join } = require('node:path')
const folder = join(__dirname, '../../..')
const requestId = randomUUID()
const RESPONSE_TIMEOUT_MS = 20000
const POLL_INTERVAL_MS = 200
async function main() {
  const temporary = join(folder, requestId + '-mission-request.tmp')
  await writeFile(temporary, requestId, 'utf8')
  await rename(temporary, join(folder, 'mission-request.txt'))
  const deadline = Date.now() + RESPONSE_TIMEOUT_MS
  while (Date.now() < deadline) {
    const response = await readFile(join(folder, 'mission-response.json'), 'utf8').then(JSON.parse).catch(() => undefined)
    if (response?.requestId === requestId) {
      process.stdout.write(JSON.stringify(response))
      if (response.error) process.exitCode = 1
      return
    }
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
  }
  throw new Error('Console Hub did not respond. Check that this Orchestrator session is still open, then retry /mission.')
}
main().catch(error => { process.stderr.write(error.message); process.exitCode = 1 })
`
