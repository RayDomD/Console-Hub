import { useEffect, useState } from 'react'
import type { FanLifecycle, FanState } from '../../../../../shared/fan'
import { RECIPES, recipeById, recipeUnavailableReason } from '../../../../../shared/recipes'
import { useRecipeSelection } from '../../recipe-selection'
import { useLiveStack } from '../../live-stack'
import { OrchestratorTerminal } from '../../orchestrator-terminal'
import {
  addWorkerSlot,
  canAddWorker,
  canRemoveWorker,
  currentStageIndex,
  removeWorkerSlot,
  recipeHasRuntime,
  withSlotVendor,
  withSlotSettings,
  workerSlots
} from './model'
import cardStyles from './WorkerCard.module.css'
import { SlotSettings, WorkerCard } from './WorkerCard'
import { questionFanVerifyAttrs } from './QuestionFanPlate.verify'
import type { DelegationVerifyState, WorkspaceVerifyState } from './QuestionFanPlate.verify'
import styles from './QuestionFanPlate.module.css'

const LIVE_LIFECYCLES = new Set<FanLifecycle>(
  ['delegating', 'held', 'workers', 'synthesis']
)

/**
 * The run, as the Hub stage's single column.
 *
 * It was a `MovablePlate` with an "open" launcher, which predates the Hub being
 * a surface: a free plate floating over the stage let the stage's own copy paint
 * straight through it, and the mockup has no second plate to arrange. The stage
 * decides whether to draw this at all - it renders only once a Recipe is chosen.
 */
export function QuestionFanPlate(): React.JSX.Element {
  return <OpenPlate />
}

function OpenPlate(): React.JSX.Element {
  // ADR 0021: no Recipe is preselected, so `recipeId` is null on first open.
  const { recipe: recipeId, select } = useRecipeSelection()
  const recipe = recipeId !== null ? recipeById(recipeId) : null

  // The Stack is app-wide (ADR 0030): the aside shows it, this edits it, and
  // one module owns the write.
  const { slots, edit: editSlots } = useLiveStack()
  const workers = workerSlots(slots)
  const [fanState, setFanState] = useState<FanState>()
  const [codexModels, setCodexModels] = useState<string[]>([])
  const [agyModels, setAgyModels] = useState<string[]>([])
  const [workspace, setWorkspace] = useState<string>()
  const [workspaceDraft, setWorkspaceDraft] = useState('')
  const [workspaceError, setWorkspaceError] = useState<string>()
  const [routeError, setRouteError] = useState<string>()

  useEffect(() => {
    let mounted = true
    const unsubscribe = window.consoleHub.fan.onState((state) => setFanState(state))

    // Codex's roster is config, not a closed set, and main validates a slot
    // against this same list when the run starts.
    void window.consoleHub.skills.codexModels().then((models) => {
      if (mounted) setCodexModels(models)
    })
    void window.consoleHub.fan.agyModels().then((models) => {
      if (mounted) setAgyModels(models)
    })

    void window.consoleHub.fan.workspace().then((stored) => {
      if (mounted) { setWorkspace(stored); setWorkspaceDraft(stored ?? '') }
    })

    void window.consoleHub.fan.current().then((current) => {
      if (mounted && current !== undefined) setFanState(current)
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  const isLive = fanState !== undefined && LIVE_LIFECYCLES.has(fanState.lifecycle)
  const held = fanState?.lifecycle === 'held'
  const workspaceVerifyState: WorkspaceVerifyState =
    workspaceError !== undefined ? 'invalid' : workspace !== undefined ? 'set' : 'none'
  const lifecycle = fanState?.lifecycle ?? 'idle'
  const delegationVerifyState: DelegationVerifyState = fanState?.delegation === undefined
    ? 'absent'
    : lifecycle === 'held'
      ? 'held'
      : fanState.delegation.degraded ? 'degraded' : 'fixed'
  const slotPhaseVerifyState = slots.map((slot) => ({
    id: slot.id,
    phase: fanState?.slots[slot.id]?.phase ?? 'idle'
  }))

  // Console Hub never drops a slot or weakens a guarantee to make a Recipe fit
  // (ADR 0038): the Stack gate is checked first, then whether the Recipe has a
  // runtime at all - only the orchestrated fan does, until the others land.
  const stackReason = recipe !== null ? recipeUnavailableReason(recipe, slots.length) : undefined
  const runtimeReason = recipe !== null && !recipeHasRuntime(recipe.id)
    ? `${recipe.title}'s runtime is not built yet`
    : undefined
  const unavailableReason = stackReason ?? runtimeReason
  const currentStage = recipe !== null ? currentStageIndex(recipe.id, fanState?.lifecycle) : undefined

  /**
   * The one place a typed path crosses the seam. Main owns the filesystem check,
   * so what comes back is either the accepted path (including a clear back to
   * none) or the reason it was refused - the draft never silently reverts.
   */
  const commitWorkspace = (): void => {
    const typed = workspaceDraft.trim()
    if (typed === (workspace ?? '')) return
    void window.consoleHub.fan.setWorkspace(typed.length > 0 ? typed : undefined).then((result) => {
      setWorkspace(result.workspace)
      setWorkspaceDraft(result.workspace ?? '')
      setWorkspaceError(result.error)
    })
  }

  const onWorkspaceKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    commitWorkspace()
  }

  return (
    <section
      className={styles.plate}
      aria-label="Question fan"
      {...questionFanVerifyAttrs(
        true,
        slots.length,
        workspaceVerifyState,
        recipeId,
        unavailableReason === undefined,
        lifecycle,
        delegationVerifyState,
        slotPhaseVerifyState
      )}
    >
      <div className={styles.run}>
        {recipe !== null && (
          <div className={styles.pipelineBar}>
            <div className={styles.recipeMeta}>
              <span className={styles.recipeTitle}>{recipe.title}</span>
              <span className={styles.recipeBadge}>{recipe.badge}</span>
              {unavailableReason !== undefined && (
                <span className={styles.unbuiltTag} role="status">{unavailableReason}</span>
              )}
            </div>
            <ol className={styles.stages} aria-label="Recipe stages">
              {recipe.stages.map((stage, index) => (
                <li
                  key={stage}
                  className={`${styles.stage}${index === currentStage ? ` ${styles.active}` : ''}`}
                >
                  <span className={styles.stageIndex}>{index + 1}</span>
                  <span>{stage}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        {recipe === null && unavailableReason !== undefined && (
          <p className={styles.unavailable} role="status">{unavailableReason}</p>
        )}

        <details className={styles.setup}>
          <summary>
            <span className={styles.setupIcon} aria-hidden="true">+</span>
            <span>Configure fleet & workspace</span>
          </summary>
          <div className={styles.setupBody}>
            <select
              aria-label="Recipe"
              className={styles.recipeSelect}
              disabled={isLive}
              value={recipeId ?? ''}
              onChange={(event) => select(event.target.value as typeof recipeId)}
            >
              {RECIPES.map((item) => (
                <option
                  key={item.id}
                  value={item.id}
                  disabled={recipeUnavailableReason(item, slots.length) !== undefined}
                >
                  {item.title}
                </option>
              ))}
            </select>
            <input
            type="text"
            aria-label="Workspace"
            className={styles.workspaceChip}
            value={workspaceDraft}
            readOnly={isLive}
            placeholder="WORKSPACE · NONE"
            onChange={(event) => {
              setWorkspaceDraft(event.target.value)
              setWorkspaceError(undefined)
            }}
            onKeyDown={onWorkspaceKeyDown}
            onBlur={commitWorkspace}
          />
            {workers.map((slot) => (
              <div key={slot.id} className={styles.setupSlot}>
                <span>{slot.id}</span>
                <SlotSettings
                  slot={slot}
                  editable={!isLive}
                  codexModels={codexModels}
                  agyModels={agyModels}
                  onChange={(patch) => editSlots((current) => withSlotSettings(current, slot.id, patch))}
                  onVendorChange={(vendor) => editSlots((current) => withSlotVendor(current, slot.id, vendor))}
                />
                {!isLive && canRemoveWorker(slots) && (
                  <button type="button" onClick={() => editSlots((current) => removeWorkerSlot(current, slot.id))}>Remove</button>
                )}
              </div>
            ))}
            {!isLive && canAddWorker(slots) && (
              <button type="button" className={styles.setupAction} onClick={() => editSlots(addWorkerSlot)}>Add worker</button>
            )}
          </div>
          {workspaceError !== undefined && (
            <span className={styles.workspaceError} role="alert">{workspaceError}</span>
          )}
        </details>

        <div className={styles.terminalSlot}>
          <OrchestratorTerminal
            slots={slots}
            lifecycle={fanState?.lifecycle}
            codexModels={codexModels}
            agyModels={agyModels}
          />
        </div>

        <div className={styles.causalBus} aria-hidden="true">
          <div className={styles.busTrunk} />
          <div className={styles.busBranches}>
            {workers.map((slot) => (
              <div key={slot.id} className={styles.busNode}>
                <span className={styles.busPin} />
                <span className={styles.busWire} />
              </div>
            ))}
          </div>
        </div>

        <div className={styles.workersHead}>
          <span>Workers · {workers.length}</span>
          <span className={styles.workersRun}>
            {fanState === undefined
              ? 'No delegation yet'
              : `One accepted delegation · run ${fanState.runId}`}
          </span>
          {/* The hold gate (ADR 0019): the split is written, nothing is running,
              and the workers spend only when the user says so. */}
          {held && (
            <button
              type="button"
              className={styles.runButton}
              onClick={() => { setRouteError(undefined); void window.consoleHub.fan.release().catch((error: Error) => setRouteError(error.message)) }}
            >
              Run workers
            </button>
          )}
          {isLive && !held && (
            <button
              type="button"
              className={styles.runButton}
              onClick={() => { void window.consoleHub.fan.stop() }}
            >
              Stop run
            </button>
          )}
        </div>
        {routeError && <p className={styles.workspaceError} role="alert">{routeError}</p>}

        <section className={cardStyles.cards} aria-label="Worker answers">
          {workers.map((slot) => (
            <WorkerCard
              key={slot.id}
              slot={slot}
              status={fanState?.slots[slot.id]}
              streamKey={`${fanState?.runId ?? 'idle'}:${fanState?.attempts[slot.id] ?? 0}`}
              editable={false}
              codexModels={codexModels}
              agyModels={agyModels}
              onChange={(patch) => editSlots((current) => withSlotSettings(current, slot.id, patch))}
              onVendorChange={(vendor) => editSlots((current) => withSlotVendor(current, slot.id, vendor))}
              onRemove={undefined}
              showSettings={false}
            />
          ))}
        </section>
      </div>
    </section>
  )
}
