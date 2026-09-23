export const LAUNCH_SCHEME = 'consolehub'

interface ProtocolApp {
  isPackaged: boolean
  isDefaultProtocolClient: (scheme: string) => boolean
  setAsDefaultProtocolClient: (scheme: string) => boolean
}

/**
 * The installer registers `consolehub://` (build/installer.nsh). This repairs a
 * registration that went missing after install. Development builds never
 * register, so a dev run cannot point the scheme at node_modules' electron.exe.
 */
export function registerLaunchProtocol(app: ProtocolApp): boolean {
  if (!app.isPackaged) return false
  return app.isDefaultProtocolClient(LAUNCH_SCHEME) || app.setAsDefaultProtocolClient(LAUNCH_SCHEME)
}
