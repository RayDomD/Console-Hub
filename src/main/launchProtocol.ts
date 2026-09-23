import { win32 } from 'node:path'
import type { LaunchRequest } from '../shared/launch'
export type { LaunchRequest } from '../shared/launch'

export function parseLaunchUrl(raw: string, isDirectory: (path: string) => boolean): LaunchRequest | undefined {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return undefined
  }

  if (url.protocol !== 'consolehub:' || url.host !== 'launch' || url.pathname !== '/v1') return undefined
  if (url.username || url.password || url.port || url.hash) return undefined

  const entries = [...url.searchParams.entries()]
  if (entries.some(([key]) => key !== 'workspace' && key !== 'action')) return undefined
  if (new Set(entries.map(([key]) => key)).size !== entries.length) return undefined

  const action = url.searchParams.get('action')
  if (action !== null && action !== 'project') return undefined

  const workspace = url.searchParams.get('workspace')
  if (action === 'project' && !workspace) return undefined
  if (workspace !== null) {
    const rawWorkspace = url.search.slice(1).split('&').find((part) => part.startsWith('workspace='))?.slice('workspace='.length)
    if (!workspace || rawWorkspace !== encodeURIComponent(workspace)) return undefined
    if (!win32.isAbsolute(workspace) || !isDirectory(workspace)) return undefined
  }

  return action === 'project'
    ? { action, workspace: workspace! }
    : workspace === null ? { action: 'open' } : { action: 'open', workspace }
}
