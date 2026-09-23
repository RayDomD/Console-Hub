import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

/**
 * The whole mechanism is a bet that `--settings` and `-c` keep meaning what
 * they mean today. A silent rename would not break launching a console - it
 * would just make every dependency wait forever with no signal ever arriving,
 * which is the worst failure this plan names anywhere. This fails loud
 * instead: read once, at the moment either vendor is first scoped, and log
 * clearly if a flag Console Hub is about to depend on is gone.
 */
export interface FlagCheckResult {
  ok: boolean
  detail: string
}

async function helpText(bin: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await run(bin, args, { timeout: 10_000 })
    return stdout
  } catch (error) {
    // Some CLIs exit non-zero on --help; execFile still gives stdout on the error.
    const withStdout = error as { stdout?: string }
    if (typeof withStdout.stdout === 'string') return withStdout.stdout
    throw error
  }
}

export async function checkClaudeSettingsFlag(): Promise<FlagCheckResult> {
  try {
    const text = await helpText('claude', ['--help'])
    const ok = text.includes('--settings')
    return { ok, detail: ok ? 'claude --help lists --settings' : 'claude --help no longer lists --settings' }
  } catch (error) {
    return { ok: false, detail: `could not run claude --help: ${String(error)}` }
  }
}

export async function checkCodexConfigFlag(): Promise<FlagCheckResult> {
  try {
    const text = await helpText('codex', ['--help'])
    const ok = /(^|\s)-c(,|\s)/.test(text) || text.includes('--config')
    return { ok, detail: ok ? 'codex --help lists -c/--config' : 'codex --help no longer lists -c/--config' }
  } catch (error) {
    return { ok: false, detail: `could not run codex --help: ${String(error)}` }
  }
}
