import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { app, shell, ipcMain, type BrowserWindow } from 'electron'
import {
  codexModels, loadConfig, resolveSkill, runsDir, configPath, DEFAULT_EXECUTORS, skillById,
  fanArrangement, fanWorkspace, loadConversation, saveConversation,
  flushArrangement, flushWorkspace, saveArrangement, saveWorkspace
} from './modules/config'
import {
  closeAll, closeConsole, consoleContext, listConsoles, onConsoleEvent,
  reportConsoleOutput, openConsole, restartConsole, validateMissionPaths,
  setConsoleAgent, agentCommand, configuredAgentBinary, shellTaskCommand, shellScriptCommand,
  withAgentExit, shellKindOf, resizeConsole, writeConsole, type ConsoleSpec
} from './modules/consoles'
import type { ConsoleAgent } from '../shared/consoles'
import {
  cancelAll, cancelRun, listSkills, previewCommand, logPath,
  onRunEvent, startRun, type RunOptions
} from './modules/skill-runner'
import {
  cancelHarness, cancelAll as cancelAllHarnessed, sweepDisposableCwds,
  listAgyModels, onEvent as onHarnessEvent, startHarness
} from './modules/harness'
import { ControlledRunner } from './modules/controlled-runner'
import { FanRuntime } from './modules/fan-runtime'
import { OrchestratorConversation, type CapturedSnapshot } from './modules/orchestrator-conversation'
import {
  consoleConversation, ConsoleController, TerminalOrchestrator, MissionController,
  MissionStore, MissionTerminals, MissionWorkspace
} from './modules/console-conversation'
import { turnSignalInitCommandFor } from './modules/turn-signal'
import type { FanConfig, FanState, SlotConfig } from '../shared/fan'
import type { ConversationSettings } from '../shared/orchestrator-conversation'
import { listWorkspaceTree } from './modules/workspace-tree'
import { subscriptionShellPrefix } from './subscriptionEnvironment'

const SKILL_EVENT_CHANNEL = 'skills:event'
const CONSOLE_EVENT_CHANNEL = 'consoles:event'
const FAN_EVENT_CHANNEL = 'fan:event'
const CONVERSATION_EVENT_CHANNEL = 'conversation:event'
const CONSOLE_CONVERSATION_EVENT_CHANNEL = 'console-conversation:event'

/**
 * One question fan at a time.
 *
 * Phase 1 is a single plate, and the machine already refuses a second Enter
 * while a run is live, so a registry of runtimes would be a lookup with one key
 * in it. Phase 2's Hub is where more than one fan becomes real.
 */
let fanRuntime: FanRuntime | undefined

/**
 * The id a run is known by, and the name its comparison document takes.
 *
 * The machine cannot generate this itself: it holds no clock, so its own
 * fallback is a counter that restarts at 1 with the process. That is what let
 * the first run of every session write `fan-run-1-comparison.md` over the last
 * session's, observed on 2026-09-02. A timestamp is the cheapest thing that does
 * not reset, and `archOutputPath` keeps only the characters that survive here.
 */
function freshRunId(): string {
  return `fan-run-${new Date().toISOString().replace(/[:.]/g, '-')}`
}

function fan(): FanRuntime {
  fanRuntime ??= new FanRuntime({
    harness: { start: startHarness, cancel: cancelHarness, onEvent: onHarnessEvent },
    // Read per run, not once: the config is editable while Console Hub is running,
    // and Codex's model roster is not a closed set the renderer could hold.
    enterOptions: () => ({
      defaults: DEFAULT_EXECUTORS,
      acceptableModels: { codex: codexModels() },
      runId: freshRunId()
    })
  })
  return fanRuntime
}

function registerFanHandlers(): void {
  ipcMain.handle('fan:start', (_e, config: FanConfig) => fan().start(config))
  ipcMain.handle('fan:retry', (_e, slotId: string) => fan().retrySlot(slotId))
  ipcMain.handle('fan:release', () => fan().release())
  ipcMain.handle('fan:stop', () => fan().stop())
  ipcMain.handle('fan:current', () => fan().current())
  ipcMain.handle('fan:arrangement', () => fanArrangement())
  ipcMain.handle('fan:saveArrangement', (_e, slots: SlotConfig[]) => saveArrangement(slots))
  ipcMain.handle('fan:workspace', () => fanWorkspace())
  ipcMain.handle('fan:agyModels', () => listAgyModels())
  // Validation is a real-world filesystem effect; the pure fan machine never
  // touches disk, so a typed path is checked here and the result — accepted or
  // reported in words — crosses back to the plate.
  ipcMain.handle('fan:setWorkspace', (_e, path: string | undefined) => saveWorkspace(path))
}


/**
 * The Orchestrator conversation, and the bridge between it and the Fan.
 *
 * The two lifecycles are deliberately separate modules: the conversation owns a
 * transcript and knows nothing about a run, the Fan owns a run and knows nothing
 * about a transcript. This is the one place that knows both, which is what keeps
 * a status question from ever reaching the machine that is running the workers.
 */
let conversationRuntime: OrchestratorConversation | undefined

/**
 * The dedicated Orchestrator slot's settings, read from the persisted Stack.
 *
 * Validated here rather than trusted: `toHarnessVendor` inside the conversation
 * throws for an executor the harness cannot launch, and a Stack hand-edited
 * between sessions is exactly the case that produces one. Falling back to the
 * defaults costs the user their model choice, never their conversation.
 */
function orchestratorSettings(): ConversationSettings {
  const slot = fanArrangement().find((candidate) => candidate.role === 'orchestrator')
  const fallback = DEFAULT_EXECUTORS.claude
  if (slot === undefined || !HARNESSABLE_VENDORS.has(slot.vendor)) {
    return { vendor: 'claude', model: fallback.model, effort: fallback.effort }
  }
  return { vendor: slot.vendor, model: slot.model, effort: slot.effort }
}

const HARNESSABLE_VENDORS = new Set(['claude', 'codex', 'agy'])

function conversation(): OrchestratorConversation {
  conversationRuntime ??= new OrchestratorConversation({
    harness: { start: startHarness, cancel: cancelHarness, onEvent: onHarnessEvent },
    settings: orchestratorSettings,
    workers: () => fanArrangement()
      .filter((candidate) => candidate.role === 'worker')
      .map((w) => ({ id: w.id, vendor: w.vendor, model: w.model })),
    load: loadConversation,
    save: saveConversation
  })
  return conversationRuntime
}

/** How much of a live worker's output a status snapshot carries. */
const SNAPSHOT_EXCERPT_CHARS = 240

/** The lifecycles during which a status question has a run to be about. */
const RUNNING_LIFECYCLES = new Set(['delegating', 'held', 'workers', 'synthesis'])

/**
 * A photograph of the run as it stands, or nothing when none is moving.
 *
 * Captured at the moment the question was asked, never held and reused: the
 * whole point of the entry is that its answer can be recognised as describing
 * one instant rather than the present.
 */
function captureRunSnapshot(): CapturedSnapshot | undefined {
  const state = fan().current()
  if (state === undefined || !RUNNING_LIFECYCLES.has(state.lifecycle)) return undefined

  const startedAt = runStartedAt.get(state.runId)
  const elapsedMs = startedAt === undefined ? 0 : Date.now() - startedAt

  return {
    runId: state.runId,
    lifecycle: state.lifecycle,
    workers: state.config.slots
      .filter((slot) => slot.role === 'worker')
      .map((slot) => {
        const status = state.slots[slot.id]
        const text = status?.phase === 'running'
          ? status.partialText ?? ''
          : status?.phase === 'completed' ? status.text : ''
        return {
          slotId: slot.id,
          phase: status?.phase ?? 'idle',
          elapsedMs,
          excerpt: text.slice(-SNAPSHOT_EXCERPT_CHARS),
          outputTokens: status?.phase === 'running' || status?.phase === 'completed'
            ? status.usage?.outputTokens
            : undefined
        }
      })
  }
}

/** When each run began, so a snapshot can report elapsed time the machine does not hold. */
const runStartedAt = new Map<string, number>()

/**
 * Every fan transition, read for the two moments the conversation cares about:
 * the delegation it proposed being accepted, and the synthesis coming back.
 * Both are idempotent in the reducer, so a repeated transition writes nothing.
 */
function bridgeFanTransition(state: FanState): void {
  if (!runStartedAt.has(state.runId)) runStartedAt.set(state.runId, Date.now())

  if (state.delegation !== undefined) {
    conversation().noteDelegation({
      runId: state.runId,
      assignments: Object.entries(state.delegation.tasks)
        .map(([slotId, task]) => ({ slotId, task })),
      degraded: state.delegation.degraded
    })
  }

  const orchestrator = state.slots[
    state.config.slots.find((slot) => slot.role === 'orchestrator')?.id ?? ''
  ]
  if (state.orchestrator.phase === 'completed' && orchestrator?.phase === 'completed') {
    conversation().noteSynthesis({
      runId: state.runId,
      text: orchestrator.text,
      outputPath: state.orchestrator.outputPath,
      absentSlotIds: state.orchestrator.absentSlotIds
    })
  }
}

/**
 * The conversation half of the seam.
 *
 * Deliberately narrow, and narrower than `consoles`: there is no executable, no
 * command line, no path and no process input here. The renderer can say a
 * sentence, ask for it again, or start over - main decides everything else.
 */
function registerConversationHandlers(): void {
  ipcMain.handle('conversation:current', () => conversation().current())
  ipcMain.handle('conversation:configure', (_e, patch: Partial<ConversationSettings>) =>
    conversation().configure(patch))
  ipcMain.handle('conversation:send', (_e, text: string) =>
    conversation().send(text, captureRunSnapshot()))
  ipcMain.handle('conversation:retry', () => conversation().retry())
  ipcMain.handle('conversation:new', () => conversation().newConversation())
  // The Stack crosses the seam because the renderer holds the live one; the task
  // does not, because the conversation in main is the only place it exists.
  ipcMain.handle('conversation:propose', (_e, slots: SlotConfig[]) => {
    const task = conversation().proposedTask()
    if (task === undefined) return undefined
    const workspace = fanWorkspace()
    return fan().start({
      slots,
      question: task.question,
      delegation: task.delegation,
      ...(workspace !== undefined ? { workspace } : {})
    })
  })
}

function registerWorkspaceHandlers(): void {
  // One level per call. The Explorer expands on demand, so the seam carries a
  // level rather than a tree.
  ipcMain.handle('workspace:tree', (_e, path: string | undefined) => listWorkspaceTree(path))
}

function registerSkillHandlers(): void {
  ipcMain.handle('skills:list', () => listSkills())
  ipcMain.handle('skills:run', (_e, id: string, opts: RunOptions) => {
    const skill = skillById(id)
    if (!skill) throw new Error(`No skill "${id}" in console-hub.config.json`)
    return startRun(id, opts)
  })
  ipcMain.handle('skills:cancel', (_e, runId: string) => cancelRun(runId))
  ipcMain.handle('skills:preview', (_e, id: string, opts: RunOptions) => previewCommand(id, opts))
  ipcMain.handle('skills:paths', () => ({ config: configPath(), log: logPath() }))
  // Claude's models are a closed set the renderer can name; Codex's are not, so
  // the list has to cross the seam rather than being a renderer constant.
  ipcMain.handle('skills:codexModels', () => codexModels())
  // Opening the output is the point of showing its path; the OS owns which editor.
  ipcMain.handle('skills:open', (_e, path: string) => shell.openPath(path))
}

function registerConsoleHandlers(): void {
  ipcMain.handle('consoles:open', async (_e, spec: ConsoleSpec) => {
    const contextDirectory = spec.orchestrator && spec.agent?.vendor === 'claude'
      ? await consoleOrchestratorTerminal().prepareClaudeContext() : undefined
    const info = await openConsole({ ...spec, claudeContextDirectory: contextDirectory }, spec.agent && spec.agent.vendor !== 'agy'
      ? (id, bin) => turnSignalInitCommandFor(spec.agent!.vendor as 'claude' | 'codex', bin, id)
      : undefined)
    if (spec.orchestrator) await consoleOrchestratorTerminal().attach(info.id, contextDirectory)
    return info
  })
  ipcMain.handle('consoles:list', () => listConsoles())
  ipcMain.handle('consoles:write', (_e, id: string, data: string) => writeConsole(id, data))
  ipcMain.handle('consoles:resize', (_e, id: string, cols: number, rows: number) =>
    resizeConsole(id, cols, rows)
  )
  ipcMain.handle('consoles:close', (_e, id: string) => closeConsole(id))
}

/**
 * The Console Recipe's Orchestrator (ADR 0050). No Stack tie - a Console has
 * no slots to read a vendor/model/effort from - so it runs on a fixed
 * default, the same one the Fan Orchestrator falls back to when its own Stack
 * has none configured.
 */
function consoleOrchestratorSettings(): ConversationSettings {
  const fallback = DEFAULT_EXECUTORS.claude
  return { vendor: 'claude', model: fallback.model, effort: fallback.effort }
}

// The renderer's lineup is the only place open terminals are tracked; the
// send handler below refreshes this just before every turn so the
// Orchestrator's own prompt (built once the conversation is constructed, but
// read live on every turn) names what is actually open right now.
let lastKnownTargetLabels: readonly string[] = []
let consoleController: ConsoleController | undefined
let terminalOrchestrator: TerminalOrchestrator | undefined
let missionControllerInstance: MissionController | undefined

/** ADR 0053's Mission workflow: held once at a time, storage rooted alongside Console run results. */
function missionRunner(): MissionController {
  if (missionControllerInstance) return missionControllerInstance
  const store = new MissionStore(join(runsDir(), 'mission'))
  const verificationEntry = app.isPackaged ? undefined : process.env.CONSOLE_HUB_VERIFY_CONTROLLED_RUNNER_ENTRY?.trim()
  const localVerificationRunner = !!verificationEntry && !!process.env.CONSOLE_HUB_VERIFY_PROFILE
  const missionUnavailable = 'Mission is unavailable in subscription CLI mode because its controlled runner does not use the signed-in Vendor CLIs.'
  const runner = new ControlledRunner({
    timeoutMs: loadConfig().runTimeoutMs,
    ...(verificationEntry ? { piPath: verificationEntry } : {})
  })
  const terminals = new MissionTerminals(
    {
      preflight: async (workspace, worktrees, storage) => {
        const config = loadConfig()
        await validateMissionPaths(workspace, config.vaultRoot, worktrees, storage)
      },
      restart: (id, spec) => {
        if (!localVerificationRunner) throw new Error(missionUnavailable)
        return restartConsole(id, spec, spec.agent && spec.agent.vendor !== 'agy'
          ? (_consoleId, bin) => turnSignalInitCommandFor(spec.agent!.vendor as 'claude' | 'codex', bin, id)
          : undefined)
      },
      run: (request) => {
        if (!localVerificationRunner) throw new Error(missionUnavailable)
        return runner.run(request)
      },
      output: reportConsoleOutput,
      close: closeConsole,
      loadSkill: async (name) => resolveSkill(name),
      workspace: new MissionWorkspace()
    },
    (missionId) => join(store.folder(missionId), 'terminals'),
    (missionId) => join(loadConfig().missionWorktreeRoot, missionId),
    () => loadConfig().vaultRoot
  )
  missionControllerInstance = new MissionController({
    store, terminals,
    routePreflight: () => localVerificationRunner ? undefined : missionUnavailable
  })
  return missionControllerInstance
}

function consoleOrchestratorTerminal(): TerminalOrchestrator {
  if (terminalOrchestrator) return terminalOrchestrator
  terminalOrchestrator = new TerminalOrchestrator({
    root: runsDir, write: writeConsole,
    alive: (id) => listConsoles().some((item) => item.id === id && item.agent),
    describe: (targets) => Object.entries(targets).map(([label, id]) => {
      const info = listConsoles().find((item) => item.id === id)
      return `${label}: ${info?.agent ? `already launched ${info.agent.vendor}; model ${info.agent.model ?? 'default'}; effort ${info.agent.effort ?? 'default'}; observed ${info.observedState ?? 'unknown'}` : 'plain shell'}; folder ${info?.cwd ?? 'unavailable'}`
    }),
    release: (plan, targets) => consoleRuns().releaseDraft(plan, targets),
    run: () => consoleController?.current(), collect: () => consoleRuns().collect(),
    mission: missionRunner(),
    sessions: (targets) => Object.fromEntries(Object.entries(targets).map(([label, id]) => {
      const info = listConsoles().find((item) => item.id === id)
      return [label, info ? {
        consoleId: info.id, cwd: info.cwd, shell: info.shell,
        ...(info.agent ? { agent: info.agent } : {}),
        ...(info.observedState ? { observedState: info.observedState } : {}),
        ...(consoleContext(info.id) ? { context: consoleContext(info.id) } : {})
      } : undefined]
    })),
    workspace: () => fanWorkspace()
  })
  onConsoleEvent((event) => {
    if (event.consoleId !== terminalOrchestrator?.current().consoleId) return
    if (event.type === 'turn-complete') terminalOrchestrator.turnComplete()
    if (event.type === 'exited' || event.type === 'agent-exited') terminalOrchestrator.exited()
  })
  const timer = setInterval(() => {
    void terminalOrchestrator?.tick().catch((error) => console.error('Orchestrator monitor:', error))
    void missionControllerInstance?.tick().catch((error) => console.error('Mission monitor:', error))
  }, 1000)
  timer.unref()
  return terminalOrchestrator
}

function consoleConversationRuntime(): OrchestratorConversation {
  return consoleConversation({
    harness: { start: startHarness, cancel: cancelHarness, onEvent: onHarnessEvent },
    settings: consoleOrchestratorSettings,
    openTargetLabels: () => lastKnownTargetLabels,
    targetDescriptions: () => consoleController?.descriptions() ?? [],
    load: (key) => loadConversation(key),
    save: (file, key) => saveConversation(file, key)
  })
}

function consoleRuns(): ConsoleController {
  consoleController ??= new ConsoleController({
    conversation: consoleConversationRuntime(),
    list: listConsoles, write: writeConsole, close: closeConsole, onEvent: onConsoleEvent,
    resultsRoot: runsDir,
    deliver: (text) => consoleOrchestratorTerminal().deliver(text),
    shellTask: async (id, task, path, runId) => {
      const info = listConsoles().find((item) => item.id === id)
      if (!info) throw new Error('Terminal closed')
      const bin = loadConfig().shells[info.shell]?.bin ?? info.shell
      await submitConsoleScript(id, shellTaskCommand(task, path, runId, shellKindOf(bin)), bin)
    },
    launch: launchAgentInConsole
  })
  return consoleController
}

async function launchAgentInConsole(id: string, agent: ConsoleAgent, prompt: string): Promise<void> {
  const info = listConsoles().find((item) => item.id === id)
  if (!info) throw new Error('Terminal closed')
  const config = loadConfig()
  const bin = config.shells[info.shell]?.bin ?? info.shell
  const scoped = agent.vendor === 'agy' ? '' : await turnSignalInitCommandFor(agent.vendor, bin, id)
  const command = [subscriptionShellPrefix(shellKindOf(bin)), scoped, agentCommand(agent, shellKindOf(bin), configuredAgentBinary(agent, config), prompt)].filter(Boolean).join('\n')
  await submitConsoleScript(id, command, bin, true)
  setConsoleAgent(id, agent)
}

async function submitConsoleScript(id: string, command: string, shellBin: string, agent = false): Promise<void> {
  const kind = shellKindOf(shellBin)
  const folder = join(runsDir(), 'console', 'commands')
  await mkdir(folder, { recursive: true })
  const path = join(folder, `${randomUUID()}.${kind === 'powershell' ? 'ps1' : 'sh'}`)
  await writeFile(path, command, 'utf8')
  const invocation = shellScriptCommand(path, kind)
  if (!writeConsole(id, (agent ? withAgentExit(invocation, kind, id) : invocation) + '\r')) throw new Error('Terminal closed')
}

function registerConsoleConversationHandlers(): void {
  ipcMain.handle('console-orchestrator:attach', async (_e, id: string) => {
    await consoleOrchestratorTerminal().attach(id)
    return consoleOrchestratorTerminal().current()
  })
  ipcMain.handle('console-orchestrator:state', () => consoleOrchestratorTerminal().current())
  ipcMain.handle('console-orchestrator:targets', (_e, targets: Record<string, string>) => consoleOrchestratorTerminal().setTargets(targets))
  ipcMain.handle('console-orchestrator:send', (_e, text: string, targets: Record<string, string>) => consoleOrchestratorTerminal().send(text, targets))
  ipcMain.handle('console-orchestrator:release', () => consoleOrchestratorTerminal().release())
  ipcMain.handle('console-orchestrator:pause', (_e, submitted?: boolean) => consoleOrchestratorTerminal().pause(submitted))
  ipcMain.handle('console-orchestrator:resume', () => consoleOrchestratorTerminal().resume())
  ipcMain.handle('console-orchestrator:retry-worker', (_e, target: string) => consoleRuns().retry(target))
  ipcMain.handle('console-orchestrator:partial', () => consoleRuns().collect(true))
  ipcMain.handle('console-conversation:current', () => consoleConversationRuntime().current())
  ipcMain.handle('console-conversation:configure', (_e, patch: Partial<ConversationSettings>) => consoleConversationRuntime().configure(patch))
  ipcMain.handle('console-conversation:retry', () => consoleConversationRuntime().retry())
  ipcMain.handle('console-conversation:new', () => { consoleRuns().stop(); return consoleConversationRuntime().newConversation() })
  ipcMain.handle('console-conversation:run', () => consoleRuns().current())
  ipcMain.handle('console-conversation:stop', () => { consoleRuns().stop(); return consoleRuns().current() })
  ipcMain.handle('console-conversation:collect', () => consoleRuns().collect())
  ipcMain.handle('console-conversation:markDone', (_e, id: string) => {
    consoleRuns().complete(id)
    return consoleRuns().current()?.assignments.filter((item) => item.phase === 'held').map((item) => item.targetId) ?? []
  })
  ipcMain.handle('console-conversation:heldTargets', () =>
    consoleRuns().current()?.assignments.filter((item) => item.phase === 'held').map((item) => item.targetId) ?? [])
  ipcMain.handle('console-conversation:send', (_e, text: string, targets: Record<string, string>) => {
    lastKnownTargetLabels = Object.keys(targets)
    return consoleRuns().send(text, targets)
  })
}

export async function registerHubHandlers(): Promise<void> {
  registerSkillHandlers()
  registerConsoleHandlers()
  registerFanHandlers()
  registerConversationHandlers()
  registerConsoleConversationHandlers()
  registerWorkspaceHandlers()
  sweepDisposableCwds()
  await missionRunner().restore()
}

export function attachHubWindow(window: BrowserWindow): void {
  const stopSkills = onRunEvent((event) => {
    if (!window.isDestroyed()) window.webContents.send(SKILL_EVENT_CHANNEL, event)
  })
  const stopConsoles = onConsoleEvent((event) => {
    if (!window.isDestroyed()) window.webContents.send(CONSOLE_EVENT_CHANNEL, event)
  })
  const stopFan = fan().onTransition((state) => {
    bridgeFanTransition(state)
    if (!window.isDestroyed()) window.webContents.send(FAN_EVENT_CHANNEL, state)
  })
  const stopConversation = conversation().onChange((state) => {
    if (!window.isDestroyed()) window.webContents.send(CONVERSATION_EVENT_CHANNEL, state)
  })
  const stopConsoleConversation = consoleConversationRuntime().onChange((state) => {
    if (!window.isDestroyed()) window.webContents.send(CONSOLE_CONVERSATION_EVENT_CHANNEL, state)
  })
  window.on('closed', () => {
    stopSkills()
    stopConsoles()
    stopFan()
    stopConversation()
    stopConsoleConversation()
  })
}

export function shutdownHub(): void {
  flushArrangement()
  flushWorkspace()
  cancelAll()
  void fanRuntime?.shutdown()
  conversationRuntime?.shutdown()
  cancelAllHarnessed()
  missionControllerInstance?.abort()
  closeAll()
  consoleController?.stop()
}

export function missionBlocksWorkspaceSwitch(): boolean {
  const mission = missionControllerInstance?.current()
  return mission !== undefined &&
    (!['applied', 'rejected'].includes(mission.phase) || mission.cleanupError !== undefined)
}

