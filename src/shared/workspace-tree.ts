/**
 * The Hub Explorer's tree contract, shared by main, preload and renderer.
 *
 * Types only. One directory level per call: the sidebar expands on demand, and
 * a repo tree read eagerly is both slower to first paint and larger than
 * anything the Explorer draws at once.
 */

export interface WorkspaceTreeEntry {
  /** The entry's own name, as it is shown in the tree. */
  name: string
  /** Path relative to the workspace root, with forward slashes. Empty for the root itself. */
  path: string
  directory: boolean
}

export interface WorkspaceTreeListing {
  /** The level that was listed, relative to the workspace root. Empty string is the root. */
  path: string
  /** Directories first, then files, each group sorted by name. */
  entries: readonly WorkspaceTreeEntry[]
  /**
   * Why the listing is empty, when it is empty for a reason worth showing: no
   * workspace configured, or a path that does not resolve inside the root. A
   * genuinely empty directory reports no reason.
   */
  unavailable?: 'no-workspace' | 'outside-workspace' | 'not-a-directory'
}
