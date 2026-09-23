import { isAbsolute, join } from 'node:path'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { reportError } from './errorLog'
import { claimSingleInstance } from './singleInstance'
import { attachHubWindow, missionBlocksWorkspaceSwitch, registerHubHandlers, shutdownHub } from './hubRuntime'
import { defaultLaunchAgent, fanWorkspace, flushArrangement, flushWorkspace, reloadConfig, saveWorkspace } from './modules/config'
import { LaunchHandoff } from './launchHandoff'
import { parseLaunchUrl } from './launchProtocol'
import { importLegacyHubState } from './migration'
import type { ActivatedLaunch } from '../shared/launch'
import { checkLaunchAgent } from './launchAgent'
import type { ConsoleAgent } from '../shared/consoles'

const APP_NAME = 'Console Hub'
const WINDOW = { width: 1440, height: 900, minWidth: 1024, minHeight: 700 } as const
const BACKGROUND = '#0A0A0B'
const RENDERER_DEV_SERVER = process.env['ELECTRON_RENDERER_URL']
const verificationProfile = !app.isPackaged && process.env.CONSOLE_HUB_VERIFY_PROFILE && isAbsolute(process.env.CONSOLE_HUB_VERIFY_PROFILE)
  ? process.env.CONSOLE_HUB_VERIFY_PROFILE : undefined
let acceptedLaunch: ActivatedLaunch | undefined
let launchSequence = 0

const handoff = new LaunchHandoff(
  fanWorkspace,
  missionBlocksWorkspaceSwitch,
  (workspace) => {
    const result = saveWorkspace(workspace)
    if (result.error) throw new Error(result.error)
  },
  (request) => {
    acceptedLaunch = { sequence: ++launchSequence, request }
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('launch:accepted', acceptedLaunch)
    }
  }
)

function notifyPending(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('launch:pending', handoff.pending())
  }
}

function receiveLaunch(args: readonly string[], warm: boolean): void {
  const raw = args.find((arg) => arg.startsWith('consolehub:'))
  if (!raw) return
  const request = parseLaunchUrl(raw, (path) => {
    try { return existsSync(path) && statSync(path).isDirectory() } catch { return false }
  })
  if (!request) {
    reportError('Reject launch URL', 'Malformed or unsupported launch payload')
    return
  }
  handoff.receive(request, warm)
  notifyPending()
}

app.setName(APP_NAME)
if (verificationProfile) mkdirSync(verificationProfile, { recursive: true })
app.setPath('userData', verificationProfile ?? join(app.getPath('appData'), APP_NAME))

process.on('uncaughtException', (error) => reportError('Uncaught main-process exception', error))
process.on('unhandledRejection', (reason) => reportError('Unhandled main-process rejection', reason))

function createWindow(): void {
  const window = new BrowserWindow({
    ...WINDOW,
    show: false,
    backgroundColor: BACKGROUND,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  window.once('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url).catch((error) => reportError('Open external link', error))
    return { action: 'deny' }
  })
  window.webContents.on('render-process-gone', (_event, details) => {
    reportError('Renderer process ended', details.reason)
  })
  window.webContents.on('did-finish-load', () => {
    window.webContents.send('launch:pending', handoff.pending())
    if (acceptedLaunch) window.webContents.send('launch:accepted', acceptedLaunch)
  })
  attachHubWindow(window)

  const load = RENDERER_DEV_SERVER
    ? window.loadURL(RENDERER_DEV_SERVER)
    : window.loadFile(join(import.meta.dirname, '../renderer/index.html'))

  void load.catch((error) => {
    reportError('Load renderer', error)
    dialog.showErrorBox(APP_NAME, 'The window could not load. See the local error log for details.')
    window.close()
  })
}

if (claimSingleInstance(app, BrowserWindow)) {
  app.on('second-instance', (_event, args) => receiveLaunch(args, true))
  void app.whenReady().then(async () => {
    if (!verificationProfile) {
      try {
        const migration = importLegacyHubState(join(app.getPath('appData'), 'Cockpit'), app.getPath('userData'))
        for (const skipped of migration.skipped) reportError('Legacy state migration', skipped)
      } catch (error) {
        reportError('Legacy state migration will retry on next launch', error)
      }
    }
    await registerHubHandlers()
    ipcMain.handle('launch:pending', () => handoff.pending())
    ipcMain.handle('launch:current', () => acceptedLaunch)
    ipcMain.handle('launch:default-agent', () => {
      flushArrangement()
      flushWorkspace()
      reloadConfig()
      return defaultLaunchAgent()
    })
    ipcMain.handle('launch:check-agent', (_event, agent: ConsoleAgent) => checkLaunchAgent(agent))
    ipcMain.handle('launch:accept', () => {
      const accepted = handoff.accept()
      notifyPending()
      return accepted
    })
    ipcMain.handle('launch:reject', () => {
      handoff.reject()
      notifyPending()
    })
    receiveLaunch(process.argv, false)
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  }).catch((error) => reportError('Start application', error))

  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', shutdownHub)
}
