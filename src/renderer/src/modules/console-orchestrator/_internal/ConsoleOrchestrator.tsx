import { useEffect, useState } from 'react'
import type { ConsoleOrchestratorStatus, ConsoleRunState } from '../../../../../shared/console-run'
import type { ConsoleAgent, ConsoleSpec } from '../../../../../shared/consoles'
import type { MissionState } from '../../../../../shared/mission'
import { ConsoleView } from '../../console-view'
import { SlotSettings } from '../../question-fan-plate'
import { delegateCommand, missionCommand, orchestratorActivity } from './model'
import styles from './ConsoleOrchestrator.module.css'

const terminal = () => window.consoleHub.consoleConversation.terminal

function verifyAttrs(status: ConsoleOrchestratorStatus, started: boolean, run?: ConsoleRunState) {
  return {
    'data-verify-unit': 'ConsoleOrchestrator',
    'data-verify-status': !started ? 'closed' : !status.consoleId ? 'opening' : status.paused ? 'paused' : status.busy ? 'busy' : 'ready',
    'data-verify-stage': run?.phase === 'complete' ? 'Complete' : run?.phase === 'dispatch' ? 'Dispatch' : status.mission?.phase === 'held' ? 'Hold' : 'Plan',
    'data-verify-plan-ready': String(!!status.plan),
    'data-verify-mission-phase': status.mission?.phase ?? 'none',
    'data-verify-error': String(!!status.error)
  }
}

export function ConsoleOrchestrator({ targets, run, onSessionChange, onMissionChange }: { targets: Record<string, string>; run?: ConsoleRunState; onSessionChange?: (agent: ConsoleAgent | undefined) => void; onMissionChange?: (mission: MissionState | undefined) => void }): React.JSX.Element {
  const [settings, setSettings] = useState<ConsoleAgent>({ vendor: 'claude' })
  const [models, setModels] = useState<{ codex: string[]; agy: string[] }>({ codex: [], agy: [] })
  const [session, setSession] = useState<{ key: number; spec: ConsoleSpec }>()
  const [status, setStatus] = useState<ConsoleOrchestratorStatus>({ busy: false, paused: false, updates: [] })
  const [error, setError] = useState<string>()
  const [request, setRequest] = useState('')
  const [starting, setStarting] = useState(false)
  useEffect(() => { onSessionChange?.(session?.spec.agent) }, [session, onSessionChange])
  useEffect(() => { onMissionChange?.(status.mission) }, [status.mission, onMissionChange])
  useEffect(() => { void terminal().setTargets(targets).catch((e: Error) => setError(e.message)) }, [targets])

  useEffect(() => {
    let mounted = true
    void window.consoleHub.consoleConversation.current().then((state) => {
      const { vendor, model, effort } = state.settings
      if (mounted && (vendor === 'claude' || vendor === 'codex' || vendor === 'agy')) setSettings({ vendor, model, effort })
    }).catch((e: Error) => { if (mounted) setError(e.message) })
    void Promise.all([window.consoleHub.skills.codexModels(), window.consoleHub.fan.agyModels()])
      .then(([codex, agy]) => { if (mounted) setModels({ codex, agy }) }).catch((e: Error) => { if (mounted) setError(e.message) })
    const poll = () => { void terminal().state().then((state) => { if (mounted) setStatus(state) }).catch((e: Error) => { if (mounted) setError(e.message) }) }
    poll()
    const interval = setInterval(poll, 750)
    return () => { mounted = false; clearInterval(interval) }
  }, [])

  const start = async () => {
    setStarting(true)
    setError(undefined)
    try {
      const cwd = await window.consoleHub.fan.workspace()
      setStatus({ busy: false, paused: false, updates: [] })
      setSession({ key: Date.now(), spec: { orchestrator: true, agent: { ...settings }, ...(cwd ? { cwd } : {}) } })
    } catch (e) { setError(String(e)) }
    finally { setStarting(false) }
  }

  const action = async (work: () => Promise<{ error?: string } | void>) => {
    setError(undefined)
    try { const result = await work(); if (result?.error) setError(result.error) }
    catch (e) { setError(String(e)) }
  }

  const activeRun = run?.assignments.some((item) => item.phase === 'held' || item.phase === 'dispatched')
  const mission = status.mission
  const missionActive = !!mission && mission.phase !== 'applied' && mission.phase !== 'rejected'
  const activeWork = !!activeRun || missionActive
  const activity = orchestratorActivity({ started: !!session, paused: status.paused, busy: status.busy, phase: mission?.phase, runPhase: run?.phase, updates: status.updates })
  const prepare = async () => {
    const text = request.trim()
    if (!text) return
    setError(undefined)
    try {
      const result = await terminal().send(text, targets)
      if (result.error) { setError(result.error); return }
      setRequest('')
      setStatus(await terminal().state())
    } catch (e) { setError(String(e)) }
  }
  const release = () => void action(async () => {
    const result = await terminal().release()
    setStatus(await terminal().state())
    return result
  })

  return <section className={`${styles.terminal} ${styles[session?.spec.agent?.vendor ?? settings.vendor]}`} {...verifyAttrs(status, !!session, run)}>
    <div className={styles.rim} aria-hidden="true" />
    <header className={styles.head}>
      <h2>Orchestrator</h2>
      <span role="status">{activity}</span>
      <span className={styles.spacer} />
      {!session && <button className={styles.headButton} type="button" disabled={starting} onClick={() => void start()}>Start Orchestrator</button>}
      {session && <button className={styles.headButton} type="button" disabled={activeWork} onClick={() => { setSession(undefined); setStatus({ busy: false, paused: false, updates: [] }) }}>Close session</button>}
    </header>
    <details className={styles.settings} open={!session}>
      <summary>Orchestrator settings{session ? ' · apply to the next session' : ''}</summary>
      <div><SlotSettings slot={{ id: 'Orchestrator', role: 'orchestrator', ...settings }} editable={!session}
        codexModels={models.codex} agyModels={models.agy}
        onVendorChange={(vendor) => setSettings({ vendor })}
        onChange={(patch) => setSettings((current) => ({ ...current, ...patch }))} /></div>
    </details>
    {session ? <div className={styles.interactive}>
      <ConsoleView key={session.key} label="Orchestrator" purpose="orchestrator" launcher={session.spec.agent!.vendor} spec={session.spec}
        canClose={false} onClose={() => {}}
        onReady={(id) => { void action(async () => { setStatus(await terminal().attach(id)) }) }}
        onInput={(submitted) => { void terminal().pause(submitted) }}
        onCommand={(line) => {
          const command = delegateCommand(line) ?? missionCommand(line, mission?.phase)
          if (!command) return false
          void action(async () => {
            await terminal().resume()
            return command === '/mission run' ? terminal().release() : terminal().send(command, targets)
          })
          return true
        }} />
    </div> : <p className={styles.emptySession}>Start a session and enter prompts or slash commands directly in the terminal.</p>}
    {session && (status.paused || status.busy) && <details className={styles.settings}>
      <summary>Terminal controls</summary>
      <button type="button" onClick={() => void action(() => terminal().resume())}>Resume handoffs</button>
    </details>}
    {session && <form className={styles.compose} onSubmit={(event) => { event.preventDefault(); void prepare() }}>
      <label className={styles.prompt} htmlFor="console-delegation-request">Delegate to workers</label>
      <textarea id="console-delegation-request" className={styles.input} rows={2} value={request}
        placeholder="Describe a research or review task for the open worker terminals"
        disabled={status.busy || status.paused || activeWork || !!status.plan}
        onChange={(event) => setRequest(event.target.value)} />
      <button className={styles.send} type="submit" disabled={!request.trim() || status.busy || status.paused || activeWork || !!status.plan}>Prepare plan</button>
    </form>}
    {session && <p className={styles.holdNote}>{missionActive
      ? 'Resolve the current Mission before delegating.'
      : 'Type /delegate followed by a task in the terminal to plan and send it automatically.'}</p>}
    {session && status.plan && <div className={styles.plan}>
      <p className={styles.planTitle}>Review saved delegation plan</p>
      <pre>{status.plan}</pre>
      <button className={styles.send} type="button" disabled={status.busy || status.paused || activeWork} onClick={release}>Release to workers</button>
    </div>}
    {(error || status.error || run?.error) && <p className={styles.refusal} role="alert">{error || status.error || run?.error}</p>}
  </section>
}
