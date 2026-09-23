interface SingleInstanceApp {
  requestSingleInstanceLock: () => boolean
  quit: () => void
  on: (event: 'second-instance', listener: () => void) => unknown
}

interface FocusableWindow {
  isMinimized: () => boolean
  restore: () => void
  show: () => void
  focus: () => void
}

interface WindowRegistry {
  getAllWindows: () => FocusableWindow[]
}

export function claimSingleInstance(app: SingleInstanceApp, windows: WindowRegistry): boolean {
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return false
  }

  app.on('second-instance', () => {
    const window = windows.getAllWindows()[0]
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  })
  return true
}
