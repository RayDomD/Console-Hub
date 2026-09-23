import { contextBridge, ipcRenderer } from 'electron'
import type { ConsoleEvent, ConsoleInfo, ConsoleSpec } from '../shared/consoles'
import type { WorkspaceTreeListing } from '../shared/workspace-tree'
import type { FanConfig, FanState, FanWorkspaceResult, SlotConfig } from '../shared/fan'
import type { ConsoleReleaseResult, ConversationSettings, ConversationState } from '../shared/orchestrator-conversation'
import type { ActivatedLaunch, PendingLaunch } from '../shared/launch'

const api = {
  launch: {
    pending: (): Promise<PendingLaunch | undefined> => ipcRenderer.invoke('launch:pending'),
    current: (): Promise<ActivatedLaunch | undefined> => ipcRenderer.invoke('launch:current'),
    defaultAgent: (): Promise<import('../shared/consoles').ConsoleAgent> => ipcRenderer.invoke('launch:default-agent'),
    checkAgent: (agent: import('../shared/consoles').ConsoleAgent, cwd: string): Promise<{ ok: boolean; reason?: string }> => ipcRenderer.invoke('launch:check-agent', agent, cwd),
    accept: (): Promise<boolean> => ipcRenderer.invoke('launch:accept'),
    reject: (): Promise<void> => ipcRenderer.invoke('launch:reject'),
    onPending: (listener: (pending: PendingLaunch | undefined) => void): (() => void) => {
      const handler = (_event: unknown, pending: PendingLaunch | undefined): void => listener(pending)
      ipcRenderer.on('launch:pending', handler)
      return () => ipcRenderer.off('launch:pending', handler)
    },
    onAccepted: (listener: (activation: ActivatedLaunch) => void): (() => void) => {
      const handler = (_event: unknown, activation: ActivatedLaunch): void => listener(activation)
      ipcRenderer.on('launch:accepted', handler)
      return () => ipcRenderer.off('launch:accepted', handler)
    }
  },
  skills: {
    codexModels: (): Promise<string[]> => ipcRenderer.invoke('skills:codexModels')
  },  consoles: {
    open: (spec: ConsoleSpec = {}): Promise<ConsoleInfo> =>
      ipcRenderer.invoke('consoles:open', spec),
    list: (): Promise<ConsoleInfo[]> => ipcRenderer.invoke('consoles:list'),
    write: (id: string, data: string): Promise<boolean> =>
      ipcRenderer.invoke('consoles:write', id, data),
    resize: (id: string, cols: number, rows: number): Promise<boolean> =>
      ipcRenderer.invoke('consoles:resize', id, cols, rows),
    close: (id: string): Promise<boolean> => ipcRenderer.invoke('consoles:close', id),
    onEvent: (listener: (event: ConsoleEvent) => void): (() => void) => {
      const handler = (_e: unknown, event: ConsoleEvent): void => listener(event)
      ipcRenderer.on('consoles:event', handler)
      return () => ipcRenderer.off('consoles:event', handler)
    }
  },
  /**
   * The Hub Explorer's tree. One directory level per call, rooted at the fan's
   * configured workspace - the renderer never names the root.
   */
  workspace: {
    tree: (path?: string): Promise<WorkspaceTreeListing> =>
      ipcRenderer.invoke('workspace:tree', path)
  },
  /**
   * The question fan. `start` is the Enter key: the machine latches a second
   * press while a run is live, so the renderer does not have to guard it.
   * Every mutation also arrives through `onState`, so a view that only listens
   * stays correct without awaiting anything.
   */
  fan: {
    start: (config: FanConfig): Promise<FanState> => ipcRenderer.invoke('fan:start', config),
    retry: (slotId: string): Promise<FanState | undefined> =>
      ipcRenderer.invoke('fan:retry', slotId),
    release: (): Promise<FanState | undefined> => ipcRenderer.invoke('fan:release'),
    stop: (): Promise<FanState | undefined> => ipcRenderer.invoke('fan:stop'),
    current: (): Promise<FanState | undefined> => ipcRenderer.invoke('fan:current'),
    arrangement: (): Promise<SlotConfig[]> => ipcRenderer.invoke('fan:arrangement'),
    saveArrangement: (slots: SlotConfig[]): Promise<SlotConfig[]> =>
      ipcRenderer.invoke('fan:saveArrangement', slots),
    workspace: (): Promise<string | undefined> => ipcRenderer.invoke('fan:workspace'),
    agyModels: (): Promise<string[]> => ipcRenderer.invoke('fan:agyModels'),
    setWorkspace: (path: string | undefined): Promise<FanWorkspaceResult> =>
      ipcRenderer.invoke('fan:setWorkspace', path),
    onState: (listener: (state: FanState) => void): (() => void) => {
      const handler = (_e: unknown, state: FanState): void => listener(state)
      ipcRenderer.on('fan:event', handler)
      return () => ipcRenderer.off('fan:event', handler)
    }
  },
  /**
   * The Orchestrator conversation (ADR 0049).
   *
   * Narrower than `consoles` on purpose, and the difference is the point: this
   * carries a sentence, never a command. There is no executable to name, no
   * path, no working directory and no process to type into - main decides what
   * the message becomes and which slot answers it.
   *
   * `propose` hands over the live Stack because the renderer holds it; the task
   * itself stays in main, where the conversation lives.
   */
  conversation: {
    current: (): Promise<ConversationState> => ipcRenderer.invoke('conversation:current'),
    configure: (patch: Partial<ConversationSettings>): Promise<ConversationState> =>
      ipcRenderer.invoke('conversation:configure', patch),
    send: (text: string): Promise<ConversationState> =>
      ipcRenderer.invoke('conversation:send', text),
    retry: (): Promise<ConversationState> => ipcRenderer.invoke('conversation:retry'),
    newConversation: (): Promise<ConversationState> => ipcRenderer.invoke('conversation:new'),
    propose: (slots: SlotConfig[]): Promise<FanState | undefined> =>
      ipcRenderer.invoke('conversation:propose', slots),
    onState: (listener: (state: ConversationState) => void): (() => void) => {
      const handler = (_e: unknown, state: ConversationState): void => listener(state)
      ipcRenderer.on('conversation:event', handler)
      return () => ipcRenderer.off('conversation:event', handler)
    }
  },

  /**
   * The Console Recipe's Orchestrator (ADR 0050) - a second, independent
   * conversation. `targets` maps a terminal's label (what the Orchestrator's
   * plan names, e.g. `T1`) to its real console id (what `consoles.write`
   * needs), since the renderer's lineup is the only place that mapping lives.
   */
  consoleConversation: {
    terminal: {
      setTargets: (targets: Record<string, string>): Promise<void> => ipcRenderer.invoke('console-orchestrator:targets', targets),
      attach: (id: string): Promise<import('../shared/console-run').ConsoleOrchestratorStatus> => ipcRenderer.invoke('console-orchestrator:attach', id),
      state: (): Promise<import('../shared/console-run').ConsoleOrchestratorStatus> => ipcRenderer.invoke('console-orchestrator:state'),
      send: (text: string, targets: Record<string, string>): Promise<{ error?: string }> => ipcRenderer.invoke('console-orchestrator:send', text, targets),
      release: (): Promise<{ error?: string }> => ipcRenderer.invoke('console-orchestrator:release'),
      pause: (submitted = false): Promise<void> => ipcRenderer.invoke('console-orchestrator:pause', submitted),
      resume: (): Promise<void> => ipcRenderer.invoke('console-orchestrator:resume'),
      retryWorker: (target: string): Promise<void> => ipcRenderer.invoke('console-orchestrator:retry-worker', target),
      partial: (): Promise<{ error?: string }> => ipcRenderer.invoke('console-orchestrator:partial')
    },
    run: (): Promise<import('../shared/console-run').ConsoleRunState | undefined> => ipcRenderer.invoke('console-conversation:run'),
    stop: (): Promise<import('../shared/console-run').ConsoleRunState | undefined> => ipcRenderer.invoke('console-conversation:stop'),
    collect: (): Promise<{ error?: string }> => ipcRenderer.invoke('console-conversation:collect'),
    current: (): Promise<ConversationState> => ipcRenderer.invoke('console-conversation:current'),
    configure: (patch: Partial<ConversationSettings>): Promise<ConversationState> =>
      ipcRenderer.invoke('console-conversation:configure', patch),
    send: (text: string, targets: Record<string, string>): Promise<{ state: ConversationState; release: ConsoleReleaseResult | undefined }> =>
      ipcRenderer.invoke('console-conversation:send', text, targets),
    retry: (): Promise<ConversationState> => ipcRenderer.invoke('console-conversation:retry'),
    newConversation: (): Promise<ConversationState> => ipcRenderer.invoke('console-conversation:new'),
    /** The escape hatch (ADR 0051): marks a terminal done regardless of what is actually happening in it. */
    markDone: (targetId: string): Promise<string[]> => ipcRenderer.invoke('console-conversation:markDone', targetId),
    heldTargets: (): Promise<string[]> => ipcRenderer.invoke('console-conversation:heldTargets'),
    onState: (listener: (state: ConversationState) => void): (() => void) => {
      const handler = (_e: unknown, state: ConversationState): void => listener(state)
      ipcRenderer.on('console-conversation:event', handler)
      return () => ipcRenderer.off('console-conversation:event', handler)
    }
  }
} as const

export type ConsoleHubApi = typeof api

contextBridge.exposeInMainWorld('consoleHub', api)
