import { useEffect, useRef, useState } from 'react'
import type { SlotConfig } from '../../../../../shared/fan'
import type { ConsoleAgent, ConsoleFleetEntry } from '../../../../../shared/consoles'
import type { ConsoleRunState } from '../../../../../shared/console-run'
import { RECIPES, recipeUnavailableReason } from '../../../../../shared/recipes'
import type { WorkspaceTreeEntry, WorkspaceTreeListing } from '../../../../../shared/workspace-tree'
import { useRecipeSelection } from '../../recipe-selection'
import { useLiveStack } from '../../live-stack'
import { QuestionFanPlate } from '../../question-fan-plate'
import { ConsoleLineup } from '../../console-view'
import { ConsoleOrchestrator } from '../../console-orchestrator'
import type { MissionState } from '../../../../../shared/mission'
import type { ActivatedLaunch } from '../../../../../shared/launch'
import { indentForPath, mergeTreeLevel, stageContentFor, toggleOpenLevel, type TreeLevels } from './model'
import { HUB_ZOOM_DEFAULT, HUB_ZOOM_MAX, HUB_ZOOM_MIN, nextHubZoom } from './hubZoom'
import {
  HUB_PANES_STORAGE_KEY,
  HUB_PANE_MAX,
  HUB_PANE_MIN,
  nextPaneWidth,
  readPaneWidths,
  type HubPane,
  type HubPaneWidths
} from './hubPanes'
import styles from './HubShell.module.css'

const UNAVAILABLE_COPY: Record<NonNullable<WorkspaceTreeListing['unavailable']>, string> = {
  'no-workspace': 'No workspace is configured. Set one on the run plate to browse its files.',
  'outside-workspace': 'This directory is outside the configured workspace.',
  'not-a-directory': 'This path is not a directory.'
}

const RIM_VENDORS = new Set(['claude', 'codex', 'agy'])

/** One arrow press moves a pane by a visible amount without overshooting a column. */
const PANE_KEY_STEP = 16

function hubVerifyAttrs(stageZoom: number): Record<string, string> {
  return {
    'data-verify-unit': 'HubShell',
    'data-verify-stage-zoom': String(stageZoom),
    'data-verify-stage-zoom-percent': String(Math.round(stageZoom * 100))
  }
}

export function HubShell({ activation }: { activation?: ActivatedLaunch }): React.JSX.Element {
  const { recipe, select } = useRecipeSelection()
  const { slots } = useLiveStack()
  const [workspace, setWorkspace] = useState<string>()
  const workspaceRequest = useRef(0)
  const [levels, setLevels] = useState<TreeLevels>({})
  const [openLevels, setOpenLevels] = useState<string[]>([])
  const [selectedPath, setSelectedPath] = useState<string>()
  const treeRequest = useRef(0)
  const [stageZoom, setStageZoom] = useState(HUB_ZOOM_DEFAULT)
  // Mounted the first time Console is opened, and never unmounted after: a
  // Recipe switch hides the lineup instead of tearing it down, so every open
  // terminal's pty and scrollback survive leaving and returning. Not mounted
  // eagerly - opening a real shell before Console is ever chosen would spend
  // a process nobody asked for.
  const [consoleOpened, setConsoleOpened] = useState(recipe === 'console')
  useEffect(() => {
    if (recipe === 'console') setConsoleOpened(true)
  }, [recipe])
  // The Console Orchestrator types into terminals by label, and the lineup is
  // the only place a label maps to a real console id.
  const [consoleTargets, setConsoleTargets] = useState<Record<string, string>>({})
  const [consoleFleet, setConsoleFleet] = useState<ConsoleFleetEntry[]>([])
  const [consoleRun, setConsoleRun] = useState<ConsoleRunState>()
  const [consoleMission, setConsoleMission] = useState<MissionState>()
  const [consoleAgent, setConsoleAgent] = useState<ConsoleAgent>()
  useEffect(() => {
    if (!consoleOpened) return
    let mounted = true
    const update = (): void => { void window.consoleHub.consoleConversation.run().then((run) => { if (mounted) setConsoleRun(run) }) }
    update()
    const stop = window.consoleHub.consoleConversation.onState(() => update())
    const timer = setInterval(update, 1000)
    return () => { mounted = false; clearInterval(timer); stop() }
  }, [consoleOpened])
  // Read once, lazily, rather than in an effect: restoring after the first paint
  // would show the designed columns and then jump to the stored ones.
  const [panes, setPanes] = useState<HubPaneWidths>(
    () => readPaneWidths(localStorage.getItem(HUB_PANES_STORAGE_KEY))
  )

  useEffect(() => {
    localStorage.setItem(HUB_PANES_STORAGE_KEY, JSON.stringify(panes))
  }, [panes])

  /**
   * Pointer capture rather than window listeners: the handle keeps receiving
   * moves when the pointer crosses the stage, which is where a fast drag ends up.
   */
  const startPaneDrag = (pane: HubPane) => (event: React.PointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const handle = event.currentTarget
    const startX = event.clientX
    const startWidth = panes[pane]
    handle.setPointerCapture(event.pointerId)

    const onMove = (move: PointerEvent): void => {
      setPanes((current) => ({
        ...current,
        [pane]: nextPaneWidth(pane, startWidth, move.clientX - startX)
      }))
    }
    const onUp = (): void => {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      handle.removeEventListener('pointercancel', onUp)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
    handle.addEventListener('pointercancel', onUp)
  }

  useEffect(() => {
    let mounted = true
    const request = ++workspaceRequest.current
    void window.consoleHub.fan.workspace().then((path) => { if (mounted && request === workspaceRequest.current) setWorkspace(path) })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!activation?.request.workspace) return
    ++workspaceRequest.current
    const request = ++treeRequest.current
    setWorkspace(activation.request.workspace)
    setLevels({})
    setOpenLevels([])
    setSelectedPath(undefined)
    void window.consoleHub.workspace.tree().then((listing) => {
      if (request === treeRequest.current) setLevels((current) => mergeTreeLevel(current, listing))
    })
  }, [activation])

  useEffect(() => {
    let mounted = true
    const request = ++treeRequest.current
    void window.consoleHub.workspace.tree().then((listing) => {
      if (mounted && request === treeRequest.current) setLevels((current) => mergeTreeLevel(current, listing))
    })
    return () => { mounted = false }
  }, [])

  const toggleDirectory = (entry: WorkspaceTreeEntry): void => {
    const opening = !openLevels.includes(entry.path)
    setOpenLevels((current) => toggleOpenLevel(current, entry.path))
    if (opening && levels[entry.path] === undefined) {
      const request = treeRequest.current
      void window.consoleHub.workspace.tree(entry.path).then((listing) => {
        if (request === treeRequest.current) setLevels((current) => mergeTreeLevel(current, listing))
      })
    }
  }

  const root = levels['']
  const workspaceName = workspace?.split(/[\\/]/).filter(Boolean).at(-1) ?? 'No workspace'
  const stage = stageContentFor(recipe)

  return (
    <section
      className={styles.hub}
      aria-label="Console Hub"
      style={{
        '--navigator-width': `${panes.navigator}px`,
        '--stack-width': `${panes.stack}px`
      } as React.CSSProperties}
      {...hubVerifyAttrs(stageZoom)}
    >
      <aside className={styles.navigator} aria-label="Console navigation">
        <div className={styles.navigatorFrame}>
          <div className={styles.navigatorHead}>
            <span>Console navigator</span>
          </div>
          <nav className={styles.routeList} aria-label="Hub activities">
            {RECIPES.map((item) => {
              const unavailable = recipeUnavailableReason(item, slots.length)
              const active = recipe === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  className={active ? styles.routeActive : styles.route}
                  disabled={unavailable !== undefined}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => select(item.id)}
                >
                  <span>{item.title}</span>
                  <i>{unavailable ?? item.badge}</i>
                </button>
              )
            })}
          </nav>
          <section className={styles.workspace}>
            <div className={styles.workspaceTitle}>
              <span>Workspace explorer</span>
              <span className={styles.workspaceBadge}>{workspace ? 'ACTIVE' : 'UNSET'}</span>
            </div>
            <strong>{workspaceName}</strong>
            <span>{workspace ?? 'No workspace configured'}</span>
          </section>
          <div className={styles.tree}>
            {root?.unavailable !== undefined && (
              <div className={styles.emptyCard} role="status">
                <span className={styles.emptyGlyph}>▯▯▯▯</span>
                <p className={styles.empty}>{UNAVAILABLE_COPY[root.unavailable]}</p>
              </div>
            )}
            {root !== undefined && root.unavailable === undefined && (
              <TreeRows
                entries={root.entries}
                levels={levels}
                openLevels={openLevels}
                selectedPath={selectedPath}
                onDirectory={toggleDirectory}
                onFile={setSelectedPath}
              />
            )}
          </div>
        </div>
      </aside>

      <PaneHandle
        pane="navigator"
        label="Resize console navigation"
        width={panes.navigator}
        onDragStart={startPaneDrag}
        onResize={setPanes}
      />

      <main className={styles.stage}>
        <StageZoomControls zoom={stageZoom} onZoom={setStageZoom} />
        <div className={styles.stageContent} style={{ zoom: stageZoom }}>
          {stage === 'prompt' && <p className={styles.stagePrompt}>Choose a way to work from the rail.</p>}
          {consoleOpened && (
            <div hidden={stage !== 'console'}>
              <ConsoleLineup activation={activation} onTargetsChange={setConsoleTargets} onFleetChange={setConsoleFleet} run={consoleRun} mission={consoleMission}>
                <ConsoleOrchestrator targets={consoleTargets} run={consoleRun} onSessionChange={setConsoleAgent} onMissionChange={setConsoleMission} />
              </ConsoleLineup>
            </div>
          )}
          {stage === 'fan' && <QuestionFanPlate />}
        </div>
      </main>

      <PaneHandle
        pane="stack"
        label="Resize Live Stack"
        width={panes.stack}
        onDragStart={startPaneDrag}
        onResize={setPanes}
      />

      <aside className={styles.aside} aria-label="Live Stack">
        <section className={styles.asideSection}>
          <div className={styles.asideHead}>
            <span>Live Stack</span>
            {stage !== 'console' && <span>{slots.length} of 5</span>}
          </div>
          {stage === 'console' ? (
            <div data-verify="console-live-stack">
              {consoleFleet.map((item) => (
                <button key={item.label} type="button" className={`${styles.stackSlot} ${styles.stackButton} ${item.agent ? styles[item.agent.vendor] : ''}`}
                  onClick={() => {
                    const terminal = document.querySelector(`[data-verify="console-view"][data-verify-label="${item.label}"]`)
                    terminal?.scrollIntoView({ block: 'nearest' })
                    terminal?.querySelector<HTMLTextAreaElement>('.xterm-helper-textarea')?.focus({ preventScroll: true })
                  }}>
                  <strong>{item.label}</strong>
                  <span className={styles.stackModel}>{item.agent?.vendor ?? 'Shell'} · {item.agent?.model ?? 'vendor default'}</span>
                  <span className={styles.role}>{item.agent?.effort ?? 'default effort'} · {consoleMission?.lanes.find((lane) => lane.workerLabel === item.label)?.phase
                    ?? (consoleMission?.plan.unusedWorkers.some((worker) => worker.label === item.label) ? 'available' : consoleRun?.assignments.find((a) => a.targetId === item.label)?.phase ?? 'ready')}</span>
                </button>
              ))}
              <button type="button" className={`${styles.stackSlot} ${styles.stackButton} ${consoleAgent ? styles[consoleAgent.vendor] : ''}`}
                onClick={() => {
                  const composer = document.querySelector<HTMLTextAreaElement>('[data-verify="orchestrator-console-view"] .xterm-helper-textarea')
                  composer?.scrollIntoView({ block: 'nearest' }); composer?.focus({ preventScroll: true })
                }}>
                <strong>Orchestrator</strong>
                <span className={styles.stackModel}>{consoleAgent ? `${consoleAgent.vendor} · ${consoleAgent.model ?? 'vendor default'}` : 'Not started'}</span>
                <span className={styles.role}>Interactive terminal</span>
              </button>
            </div>
          ) : (
            slots.map((slot) => <StackSlot key={slot.id} slot={slot} />)
          )}
        </section>
      </aside>
    </section>
  )
}

/**
 * The grip on a column rule.
 *
 * `separator` with a value, not a bare div, because the widths are also
 * reachable by arrow key: a pointer-only affordance would leave the panes fixed
 * for anyone not using a mouse.
 */
function PaneHandle({ pane, label, width, onDragStart, onResize }: {
  pane: HubPane
  label: string
  width: number
  onDragStart: (pane: HubPane) => (event: React.PointerEvent<HTMLDivElement>) => void
  onResize: React.Dispatch<React.SetStateAction<HubPaneWidths>>
}): React.JSX.Element {
  const nudge = (deltaX: number): void => {
    onResize((current) => ({ ...current, [pane]: nextPaneWidth(pane, current[pane], deltaX) }))
  }
  return (
    <div
      className={styles.paneHandle}
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuenow={width}
      aria-valuemin={HUB_PANE_MIN}
      aria-valuemax={HUB_PANE_MAX}
      onPointerDown={onDragStart(pane)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') nudge(-PANE_KEY_STEP)
        else if (event.key === 'ArrowRight') nudge(PANE_KEY_STEP)
        else return
        event.preventDefault()
      }}
    />
  )
}

function StageZoomControls({ zoom, onZoom }: {
  zoom: number
  onZoom: (zoom: number) => void
}): React.JSX.Element {
  const zoomPercent = Math.round(zoom * 100)
  return (
    <div className={styles.zoomControls} role="group" aria-label="Stage zoom">
      <button
        type="button"
        aria-label="Zoom out"
        title="Zoom out"
        disabled={zoom <= HUB_ZOOM_MIN}
        onClick={() => onZoom(nextHubZoom(zoom, 'out'))}
      >
        <svg viewBox="0 0 18 18" aria-hidden="true"><path d="M4 9h10" /></svg>
      </button>
      <output aria-live="polite">{zoomPercent}%</output>
      <button
        type="button"
        aria-label="Zoom in"
        title="Zoom in"
        disabled={zoom >= HUB_ZOOM_MAX}
        onClick={() => onZoom(nextHubZoom(zoom, 'in'))}
      >
        <svg viewBox="0 0 18 18" aria-hidden="true"><path d="M4 9h10M9 4v10" /></svg>
      </button>
      <button
        type="button"
        aria-label="Reset stage zoom"
        title="Reset stage zoom"
        disabled={zoom === HUB_ZOOM_DEFAULT}
        onClick={() => onZoom(HUB_ZOOM_DEFAULT)}
      >
        <svg viewBox="0 0 18 18" aria-hidden="true"><path d="M14 7a5.5 5.5 0 1 0 1 4M14 3v4h-4" /></svg>
      </button>
    </div>
  )
}

/**
 * The Stack as configuration, not a scorecard: name, role, vendor, model and
 * effort as compact mono facts. Editing happens on the run plate, which is the
 * surface that owns a slot's controls.
 */
function StackSlot({ slot }: { slot: SlotConfig }): React.JSX.Element {
  const vendor = slot.vendor.toLowerCase()
  const rim = RIM_VENDORS.has(vendor) ? styles[vendor] : undefined
  return (
    <div className={rim ? `${styles.stackSlot} ${rim}` : styles.stackSlot}>
      <div className={styles.stackHead}>
        <div>
          <div className={styles.stackName}>{slot.id}</div>
          <div className={styles.role}>{slot.role}</div>
        </div>
        <span className={styles.effort}>{slot.effort ?? 'default'}</span>
      </div>
      <div className={styles.stackModel}>{vendor} · {slot.model ?? 'vendor default'}</div>
    </div>
  )
}

function TreeRows({ entries, levels, openLevels, selectedPath, onDirectory, onFile }: {
  entries: readonly WorkspaceTreeEntry[]
  levels: TreeLevels
  openLevels: readonly string[]
  selectedPath: string | undefined
  onDirectory: (entry: WorkspaceTreeEntry) => void
  onFile: (path: string) => void
}): React.JSX.Element {
  return <>{entries.map((entry) => {
    const open = entry.directory && openLevels.includes(entry.path)
    const childLevel = levels[entry.path]
    return (
      <div key={entry.path}>
        <button
          type="button"
          className={selectedPath === entry.path ? styles.treeRowSelected : styles.treeRow}
          style={{ paddingLeft: indentForPath(entry.path) }}
          onClick={() => entry.directory ? onDirectory(entry) : onFile(entry.path)}
        >
          <Twisty directory={entry.directory} open={open} />
          <span className={entry.directory ? styles.folder : styles.file} aria-hidden="true" />
          <span className={styles.treeName}>{entry.name}</span>
        </button>
        {open && childLevel !== undefined && (
          <TreeRows
            entries={childLevel.entries}
            levels={levels}
            openLevels={openLevels}
            selectedPath={selectedPath}
            onDirectory={onDirectory}
            onFile={onFile}
          />
        )}
        {open && childLevel?.unavailable !== undefined && (
          <p className={styles.empty} role="status">{UNAVAILABLE_COPY[childLevel.unavailable]}</p>
        )}
      </div>
    )
  })}</>
}

/**
 * A directory's open state, as a rotating chevron. Authored SVG rather than a
 * text glyph: `DESIGN.md` admits no icon that is not one, and a `+` sign also
 * reads as an add control on a row that has one elsewhere in the app.
 */
function Twisty({ directory, open }: { directory: boolean; open: boolean }): React.JSX.Element {
  if (!directory) return <span className={styles.twisty} aria-hidden="true" />
  return (
    <svg className={open ? styles.twistyOpen : styles.twisty} viewBox="0 0 18 18" aria-hidden="true">
      <path d="M7 4l5 5-5 5" />
    </svg>
  )
}
