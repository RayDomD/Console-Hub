import { useCallback, useEffect, useRef, useState } from 'react'
import { ConsoleView } from './ConsoleView'
import { CONSOLE_LAUNCHERS, CONSOLE_LINEUP_MAX, canAddConsole, canRemoveConsole, nextConsoleLabel, consoleLaunchSpec, type ConsoleLauncher } from './lineup'
import type { ConsoleSpec } from './types'
import type { ConsoleAgent, ConsoleFleetEntry } from '../../../../../shared/consoles'
import type { ConsoleRunState } from '../../../../../shared/console-run'
import type { MissionState } from '../../../../../shared/mission'
import type { ActivatedLaunch } from '../../../../../shared/launch'
import { SlotSettings } from '../../question-fan-plate'
import { mostRecentAgentSession } from './launchSession'
import styles from './ConsoleLineup.module.css'

interface Slot {
  /** A React key stable across the slot's lifetime; never reused. */
  key: string
  label: string
  launcher: ConsoleLauncher
  spec: ConsoleSpec
}

/**
 * The Console Recipe's whole surface (ADR 0050): a grid of real terminals you
 * add and drop yourself, capped at six for readability rather than cost.
 *
 * This component is meant to stay mounted across a Recipe switch - its parent
 * hides it with `hidden` rather than unmounting it - so every open terminal's
 * pty and scrollback survive leaving and returning. A single terminal, never
 * added to, is exactly today's Console: one shell, nothing else on the surface.
 */
export function ConsoleLineup({ activation, onTargetsChange, onFleetChange, run, mission, children }: {
  activation?: ActivatedLaunch
  run?: ConsoleRunState
  mission?: MissionState
  onFleetChange?: (fleet: ConsoleFleetEntry[]) => void
  children?: React.ReactNode
  /** Every open terminal's label mapped to its real console id, on every change - what the Console Orchestrator types into. */
  onTargetsChange?: (targets: Record<string, string>) => void
}): React.JSX.Element {
  const counter = useRef(0)
  const [slots, setSlots] = useState<Slot[]>([])
  const [workspace, setWorkspace] = useState('')
  const workspaceEdited = useRef(false)
  const workspaceLoad = useRef(0)
  const [workspaceReady, setWorkspaceReady] = useState(false)
  const [workspaceError, setWorkspaceError] = useState<string>()
  const [opening, setOpening] = useState(false)
  const openingRef = useRef(false)
  const handledLaunch = useRef(0)
  const activity = useRef<Record<string, number>>({})
  const activitySequence = useRef(0)
  const [targets, setTargets] = useState<Record<string, string>>({})
  const [settings, setSettings] = useState<Record<ConsoleAgent['vendor'], Omit<ConsoleAgent, 'vendor'>>>({ codex: {}, claude: {}, agy: {} })
  const [codexModels, setCodexModels] = useState<string[]>([])
  const [agyModels, setAgyModels] = useState<string[]>([])

  useEffect(() => {
    if (!activation?.request.workspace) return
    ++workspaceLoad.current
    setWorkspace(activation.request.workspace)
    workspaceEdited.current = false
  }, [activation])

  useEffect(() => {
    if (!activation || activation.request.action !== 'project' || !workspaceReady || handledLaunch.current >= activation.sequence) return
    handledLaunch.current = activation.sequence
    const incoming = activation.request.workspace
    const existing = mostRecentAgentSession(slots.map((slot) => ({
      key: slot.key, workspace: slot.spec.cwd ?? '', agent: !!slot.spec.agent,
      activity: activity.current[slot.key] ?? 0
    })), incoming)
    if (existing) {
      const card = document.querySelector<HTMLElement>(`[data-launch-session="${existing}"]`)
      card?.scrollIntoView({ block: 'nearest' })
      card?.querySelector<HTMLTextAreaElement>('.xterm-helper-textarea')?.focus({ preventScroll: true })
      return
    }
    if (!canAddConsole(slots.length)) {
      setWorkspaceError('All six terminals are occupied. Close one before starting the project agent.')
      return
    }
    void window.consoleHub.launch.defaultAgent().then((agent) => {
      return window.consoleHub.launch.checkAgent(agent, incoming).then((check) => {
        if (!check.ok) {
          setWorkspaceError(`Project agent held: ${check.reason} Choose another Vendor, model, and effort in Configure fleet & workspace, then launch it there. The saved default is unchanged.`)
          return
        }
        counter.current += 1
        const slot: Slot = {
          key: `console-${counter.current}`, label: nextConsoleLabel(counter.current), launcher: agent.vendor,
          spec: { cwd: incoming, agent }
        }
        activity.current[slot.key] = ++activitySequence.current
        setWorkspaceError(undefined)
        setSlots((current) => canAddConsole(current.length) ? [...current, slot] : current)
      })
    }).catch((error: Error) => setWorkspaceError(error.message))
  }, [activation, workspaceReady, slots, targets])

  useEffect(() => {
    onTargetsChange?.(targets)
    onFleetChange?.(slots.map((slot) => ({ label: slot.label, consoleId: targets[slot.label], agent: slot.spec.agent })))
  }, [targets, slots, onTargetsChange, onFleetChange])

  useEffect(() => {
    let mounted = true
    const request = ++workspaceLoad.current
    void window.consoleHub.skills.codexModels().then((models) => { if (mounted) setCodexModels(models) }).catch((error: Error) => { if (mounted) setWorkspaceError(error.message) })
    void window.consoleHub.fan.agyModels().then((models) => { if (mounted) setAgyModels(models) }).catch((error: Error) => { if (mounted) setWorkspaceError(error.message) })
    void window.consoleHub.fan.workspace().then((stored) => {
      if (mounted) { if (request === workspaceLoad.current) setWorkspace(stored ?? ''); setWorkspaceReady(true) }
    }).catch((error: Error) => { if (mounted) setWorkspaceError(error.message) })
    return () => { mounted = false }
  }, [])

  const addSlot = useCallback((launcher: ConsoleLauncher = 'shell') => {
    if (!workspaceReady || openingRef.current) return
    openingRef.current = true
    setOpening(true)
    // A Recipe switch can change shared config while this lineup stays mounted.
    const pendingWorkspace = workspaceEdited.current
      ? window.consoleHub.fan.setWorkspace(workspace.trim() || undefined)
      : window.consoleHub.fan.workspace().then((stored) => ({ workspace: stored, error: undefined }))
    void pendingWorkspace.then(async (result) => {
      setWorkspaceError(result.error)
      if (result.error !== undefined) return
      workspaceEdited.current = false
      setWorkspace(result.workspace ?? '')
      if (launcher !== 'shell') {
        const check = await window.consoleHub.launch.checkAgent({ vendor: launcher, ...settings[launcher] }, result.workspace ?? '')
        if (!check.ok) {
          setWorkspaceError(check.reason)
          return
        }
      }
      counter.current += 1
      const slot: Slot = {
        key: `console-${counter.current}`, label: nextConsoleLabel(counter.current),
        launcher, spec: consoleLaunchSpec(launcher, result.workspace ?? '', launcher === 'shell' ? undefined : settings[launcher])
      }
      activity.current[slot.key] = ++activitySequence.current
      setSlots((current) => canAddConsole(current.length) ? [...current, slot] : current)
    }).catch((error: Error) => setWorkspaceError(error.message)).finally(() => {
      openingRef.current = false
      setOpening(false)
    })
  }, [workspace, workspaceReady, settings])

  const removeSlot = useCallback((key: string, label: string) => {
    setSlots((current) => (canRemoveConsole(current.length) ? current.filter((slot) => slot.key !== key) : current))
    setTargets((current) => {
      if (!(label in current)) return current
      const next = { ...current }
      delete next[label]
      return next
    })
  }, [])

  const ready = useCallback((label: string, consoleId: string) => {
    setTargets((current) => {
      const next = { ...current, [label]: consoleId }
      return next
    })
  }, [])

  return (
    <section data-verify-unit="ConsoleLineup" data-verify-count={slots.length} data-verify-can-add={String(canAddConsole(slots.length) && workspaceReady && !opening)}>
      <details className={styles.setup}>
        <summary>Configure fleet & workspace</summary>
        <div className={styles.setupBody}>
          <label htmlFor="console-workspace">Workspace for new terminals</label>
          <input
            id="console-workspace"
            value={workspace}
            disabled={!workspaceReady || opening}
            placeholder="Default vault folder"
            onChange={(event) => {
              setWorkspace(event.target.value)
              workspaceEdited.current = true
              setWorkspaceError(undefined)
            }}
          />
          <p>Saved to the shared workspace when you add a terminal. Existing terminals keep their folder.</p>
          {(['codex', 'claude', 'agy'] as const).map((vendor) => (
            <div className={styles.fleetRow} key={vendor}>
              <SlotSettings
                slot={{ id: vendor, vendor, role: 'worker', ...settings[vendor] }}
                editable={!opening} vendorEditable={false} codexModels={codexModels} agyModels={agyModels}
                onVendorChange={() => {}}
                onChange={(patch) => setSettings((current) => ({ ...current, [vendor]: { ...current[vendor], ...patch } }))}
              />
              <button type="button" disabled={!canAddConsole(slots.length) || !workspaceReady || opening} onClick={() => addSlot(vendor)}>Launch {vendor}</button>
            </div>
          ))}
          <p>Model and effort are launch settings. Changes apply to the next terminal.</p>
        </div>
      </details>
      {workspaceError !== undefined && <p role="alert">{workspaceError}</p>}
      <div className={styles.launchers} role="group" aria-label="Add terminal">
        <span>Add terminal</span>
        {CONSOLE_LAUNCHERS.map((launcher) => (
          <button key={launcher} type="button" disabled={!canAddConsole(slots.length) || !workspaceReady || opening} onClick={() => addSlot(launcher)}>
            {launcher === 'shell' ? 'Shell' : launcher === 'agy' ? 'AGY' : launcher === 'codex' ? 'Codex' : 'Claude'}
          </button>
        ))}
        <span className={styles.count}>{slots.length} / {CONSOLE_LINEUP_MAX}</span>
      </div>
      {children}
      <div className={styles.workersHead}><span>Terminals · {slots.length}</span><span>{mission ? `Mission · ${mission.phase.replaceAll('_', ' ')} · ${mission.lanes.length}/${slots.length} assigned` : run ? `Run · ${run.phase}` : 'Workers ready'}</span></div>
      <div className={styles.grid} data-verify="console-lineup" data-verify-count={slots.length}>
      {slots.map((slot) => (
        <div key={slot.key} data-launch-session={slot.key} className={`${styles.card} ${styles[slot.launcher] ?? ''}`}
          onFocusCapture={() => { activity.current[slot.key] = ++activitySequence.current }}>
          <ConsoleView
            label={slot.label}
            launcher={slot.launcher}
            spec={slot.spec}
            assignment={run?.assignments.find((item) => item.targetId === slot.label)}
            missionAssignment={mission?.lanes.find((lane) => lane.workerLabel === slot.label)
              ?? (() => {
                const unused = mission?.plan.unusedWorkers.find((worker) => worker.label === slot.label)
                return unused ? { phase: 'unused' as const, reason: unused.reason } : undefined
              })()}
            canClose={canRemoveConsole(slots.length)}
            onClose={() => removeSlot(slot.key, slot.label)}
            onReady={(consoleId) => ready(slot.label, consoleId)}
            onOpenError={(error) => { setWorkspaceError(error); removeSlot(slot.key, slot.label) }}
            onInput={() => { activity.current[slot.key] = ++activitySequence.current }}
            onAgent={(agent) => setSlots((current) => current.map((item) => item.key === slot.key
              ? { ...item, launcher: agent?.vendor ?? 'shell', spec: { ...item.spec, agent } } : item))}
          />
        </div>
      ))}
      </div>
    </section>
  )
}
