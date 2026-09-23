import { describe, expect, it } from 'vitest'
import { enter, release, step, retry } from './machine'
import type { FanConfig, SlotTerminalEvent } from '../../../../shared/fan'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid config. Vendor names control which defaults apply. */
function cfgWithVendors(overrides?: {
  workerVendors?: [string, string]
  orchestratorVendor?: string
}): FanConfig {
  const [wv1, wv2] = overrides?.workerVendors ?? ['claude', 'codex']
  const aVendor = overrides?.orchestratorVendor ?? 'claude'
  return {
    question: 'What should we build?',
    slots: [
      { id: 'w1', role: 'worker', vendor: wv1 },
      { id: 'w2', role: 'worker', vendor: wv2 },
      { id: 'arch', role: 'orchestrator', vendor: aVendor }
    ]
  }
}

/** Config where one slot carries its own model and effort. */
function cfgWithSlotOverrides(): FanConfig {
  return {
    question: 'What should we build?',
    slots: [
      { id: 'w1', role: 'worker', vendor: 'claude', model: 'haiku', effort: 'low' },
      { id: 'w2', role: 'worker', vendor: 'codex' },
      { id: 'arch', role: 'orchestrator', vendor: 'claude', model: 'opus', effort: 'high' }
    ]
  }
}

/** A delegation the parser can split across the two workers every config here has. */
const SPLIT = ['### w1', 'One.', '', '### w2', 'Two.'].join(String.fromCharCode(10))

function terminalCompleted(runId: string, slotId: string, text = 'ok'): SlotTerminalEvent {
  return {
    kind: 'terminal',
    runId,
    attempt: 1,
    slotId,
    vendor: 'v',
    outcome: { kind: 'completed', text }
  }
}

const DEFAULTS = {
  claude: { model: 'sonnet', effort: 'medium' },
  codex: { model: 'gpt-5.6-terra', effort: 'medium' }
}

// ---------------------------------------------------------------------------
// 1. Defaults supplied rather than read
// ---------------------------------------------------------------------------

describe('defaults argument — model and effort inheritance', () => {
  it("a slot's own model and effort win over the supplied default", () => {
    const config = cfgWithSlotOverrides()
    const { commands } = enter(config, undefined, { defaults: DEFAULTS })
    const launch = commands.find(c => c.kind === 'launch_delegation')
    expect(launch?.kind).toBe('launch_delegation')
    if (launch?.kind === 'launch_delegation') {
      // the orchestrator slot specifies model: 'opus', effort: 'high' - these win
      expect(launch.model).toBe('opus')
      expect(launch.effort).toBe('high')
    }
  })

  it('a slot with no own model or effort inherits the supplied default for its vendor', () => {
    // arch slot has no model or effort, vendor 'claude'
    const config = cfgWithVendors()
    const t1 = enter(config, undefined, { defaults: DEFAULTS })
    const runId = t1.state.runId

    // Drive to workers
    const t2 = release(step(terminalCompleted(runId, 'arch', SPLIT), t1.state).state)
    const t3 = step(terminalCompleted(runId, 'w1', 'a1'), t2.state)
    const t4 = step(terminalCompleted(runId, 'w2', 'a2'), t3.state)

    const archCmd = t4.commands.find(c => c.kind === 'launch_synthesis')
    expect(archCmd?.kind).toBe('launch_synthesis')
    if (archCmd?.kind === 'launch_synthesis') {
      // arch slot has no own model/effort, vendor 'claude' → inherits default
      expect(archCmd.model).toBe('sonnet')
      expect(archCmd.effort).toBe('medium')
    }
  })

  it('worker slots inherit the default for their respective vendors', () => {
    // w1 has own model/effort; w2 has none and vendor 'codex'
    const config = cfgWithSlotOverrides()
    const t1 = enter(config, undefined, { defaults: DEFAULTS })
    const runId = t1.state.runId

    const t2 = release(step(terminalCompleted(runId, 'arch', SPLIT), t1.state).state)
    const launchWorkers = t2.commands.find(c => c.kind === 'launch_workers')
    expect(launchWorkers?.kind).toBe('launch_workers')
    if (launchWorkers?.kind === 'launch_workers') {
      const w1 = launchWorkers.slots.find(s => s.slotId === 'w1')
      const w2 = launchWorkers.slots.find(s => s.slotId === 'w2')
      // w1 carries its own model/effort
      expect(w1?.model).toBe('haiku')
      expect(w1?.effort).toBe('low')
      // w2 has no own model/effort, vendor 'codex' → inherits default
      expect(w2?.model).toBe('gpt-5.6-terra')
      expect(w2?.effort).toBe('medium')
    }
  })

  it('with no defaults argument the launch commands carry no model or effort', () => {
    const config = cfgWithVendors()
    const { commands } = enter(config)
    const launch = commands.find(c => c.kind === 'launch_delegation')
    expect(launch?.kind).toBe('launch_delegation')
    if (launch?.kind === 'launch_delegation') {
      expect(launch.model).toBeUndefined()
      expect(launch.effort).toBeUndefined()
    }
  })

  it('with no defaults argument and no own fields, workers carry no model or effort', () => {
    const config = cfgWithVendors()
    const t1 = enter(config)
    const runId = t1.state.runId
    const t2 = release(step(terminalCompleted(runId, 'arch', SPLIT), t1.state).state)
    const launchWorkers = t2.commands.find(c => c.kind === 'launch_workers')
    expect(launchWorkers?.kind).toBe('launch_workers')
    if (launchWorkers?.kind === 'launch_workers') {
      for (const s of launchWorkers.slots) {
        expect(s.model).toBeUndefined()
        expect(s.effort).toBeUndefined()
      }
    }
  })
})

// ---------------------------------------------------------------------------
// 2. Scope on launch commands
// ---------------------------------------------------------------------------

describe('scope on launch commands', () => {
  it('the launch_delegation command carries the NONE scope', () => {
    const config = cfgWithVendors()
    const { commands } = enter(config)
    const launch = commands.find(c => c.kind === 'launch_delegation')
    expect(launch?.kind).toBe('launch_delegation')
    if (launch?.kind === 'launch_delegation') {
      expect(launch.scope).toBe('NONE')
    }
  })

  it('each worker in the launch_workers command carries the NONE scope', () => {
    const config = cfgWithVendors()
    const t1 = enter(config)
    const runId = t1.state.runId
    const t2 = release(step(terminalCompleted(runId, 'arch', SPLIT), t1.state).state)
    const launchWorkers = t2.commands.find(c => c.kind === 'launch_workers')
    expect(launchWorkers?.kind).toBe('launch_workers')
    if (launchWorkers?.kind === 'launch_workers') {
      for (const s of launchWorkers.slots) {
        expect(s.scope).toBe('NONE')
      }
    }
  })

  it('the launch_synthesis command carries the document scope', () => {
    const config = cfgWithVendors()
    const t1 = enter(config)
    const runId = t1.state.runId
    const t2 = release(step(terminalCompleted(runId, 'arch', SPLIT), t1.state).state)
    const t3 = step(terminalCompleted(runId, 'w1', 'a1'), t2.state)
    const t4 = step(terminalCompleted(runId, 'w2', 'a2'), t3.state)

    const archCmd = t4.commands.find(c => c.kind === 'launch_synthesis')
    expect(archCmd?.kind).toBe('launch_synthesis')
    if (archCmd?.kind === 'launch_synthesis') {
      expect(archCmd.scope).toBe('DOCS')
    }
  })

  it('retry of a worker carries the NONE scope', () => {
    // Drive both workers to crash then retry w1
    const config = cfgWithVendors()
    const t1 = enter(config)
    const runId = t1.state.runId
    const t2 = release(step(terminalCompleted(runId, 'arch', SPLIT), t1.state).state)
    const t3 = step(
      { kind: 'terminal', runId, attempt: 1, slotId: 'w1', vendor: 'v', outcome: { kind: 'process_crash' } },
      t2.state
    )
    const t4 = step(
      { kind: 'terminal', runId, attempt: 1, slotId: 'w2', vendor: 'v', outcome: { kind: 'process_crash' } },
      t3.state
    )
    const t5 = retry(t4.state, 'w1')
    const lw = t5.commands.find(c => c.kind === 'launch_workers')
    expect(lw?.kind).toBe('launch_workers')
    if (lw?.kind === 'launch_workers') {
      const w1 = lw.slots.find(s => s.slotId === 'w1')
      expect(w1?.scope).toBe('NONE')
    }
  })

  it('retry of the orchestrator carries the document scope', () => {
    // Drive to orchestrator failed then retry
    const config = cfgWithVendors()
    const t1 = enter(config)
    const runId = t1.state.runId
    const t2 = release(step(terminalCompleted(runId, 'arch', SPLIT), t1.state).state)
    const t3 = step(terminalCompleted(runId, 'w1', 'a1'), t2.state)
    const t4 = step(terminalCompleted(runId, 'w2', 'a2'), t3.state)
    const t5 = step(
      { kind: 'terminal', runId, attempt: 2, slotId: 'arch', vendor: 'v', outcome: { kind: 'process_crash' } },
      t4.state
    )
    const t6 = retry(t5.state, 'arch')
    const archCmd = t6.commands.find(c => c.kind === 'launch_synthesis')
    expect(archCmd?.kind).toBe('launch_synthesis')
    if (archCmd?.kind === 'launch_synthesis') {
      expect(archCmd.scope).toBe('DOCS')
    }
  })
})

// ---------------------------------------------------------------------------
// 3. Model validation
// ---------------------------------------------------------------------------

describe('model validation', () => {
  it('rejects a slot naming a model not in the acceptable list for its vendor', () => {
    const config: FanConfig = {
      question: 'q',
      slots: [
        { id: 'crit', role: 'worker', vendor: 'claude' },
        { id: 'w1', role: 'worker', vendor: 'claude', model: 'no-such-model' },
        { id: 'w2', role: 'worker', vendor: 'claude' },
        { id: 'arch', role: 'orchestrator', vendor: 'claude' }
      ]
    }
    const acceptableModels = { claude: ['sonnet', 'opus', 'haiku'] }
    expect(() => enter(config, undefined, { acceptableModels })).toThrow(/w1/)
  })

  it('the error names the offending slot id and what was wrong', () => {
    const config: FanConfig = {
      question: 'q',
      slots: [
        { id: 'crit', role: 'worker', vendor: 'codex', model: 'bad-model' },
        { id: 'w1', role: 'worker', vendor: 'codex' },
        { id: 'w2', role: 'worker', vendor: 'codex' },
        { id: 'arch', role: 'orchestrator', vendor: 'codex' }
      ]
    }
    const acceptableModels = { codex: ['gpt-5.6-terra'] }
    expect(() => enter(config, undefined, { acceptableModels })).toThrow(/crit/)
  })

  it('accepts a slot naming a valid model from the acceptable list', () => {
    const config: FanConfig = {
      question: 'q',
      slots: [
        { id: 'crit', role: 'worker', vendor: 'claude' },
        { id: 'w1', role: 'worker', vendor: 'claude', model: 'sonnet' },
        { id: 'w2', role: 'worker', vendor: 'claude' },
        { id: 'arch', role: 'orchestrator', vendor: 'claude' }
      ]
    }
    const acceptableModels = { claude: ['sonnet', 'opus'] }
    expect(() => enter(config, undefined, { acceptableModels })).not.toThrow()
  })

  it('with no acceptable-model set supplied for a vendor, any model is accepted', () => {
    const config: FanConfig = {
      question: 'q',
      slots: [
        { id: 'crit', role: 'worker', vendor: 'unknown-vendor', model: 'some-model' },
        { id: 'w1', role: 'worker', vendor: 'unknown-vendor' },
        { id: 'w2', role: 'worker', vendor: 'unknown-vendor' },
        { id: 'arch', role: 'orchestrator', vendor: 'unknown-vendor' }
      ]
    }
    // No acceptableModels supplied at all — absence of a list is not evidence a model is wrong
    expect(() => enter(config)).not.toThrow()
  })

  it('with no acceptable-model set for the vendor (but others have a list), model is accepted', () => {
    const config: FanConfig = {
      question: 'q',
      slots: [
        { id: 'crit', role: 'worker', vendor: 'mystery-vendor', model: 'whatever' },
        { id: 'w1', role: 'worker', vendor: 'mystery-vendor' },
        { id: 'w2', role: 'worker', vendor: 'mystery-vendor' },
        { id: 'arch', role: 'orchestrator', vendor: 'mystery-vendor' }
      ]
    }
    // acceptableModels provided but mystery-vendor not in the map
    const acceptableModels = { claude: ['sonnet'] }
    expect(() => enter(config, undefined, { acceptableModels })).not.toThrow()
  })
})
