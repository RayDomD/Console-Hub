import type { ConsoleHubApi } from './index'

declare global {
  interface Window {
    consoleHub: ConsoleHubApi
  }
}

export {}
