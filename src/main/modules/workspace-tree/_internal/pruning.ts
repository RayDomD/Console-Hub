// Workspace browsing owns this policy independently of Console Hub's corpus indexer.
export const PRUNED_DIRECTORIES = new Set([
  '.git',
  '.obsidian',
  '.claude',
  '.agents',
  '.codex',
  'node_modules'
])
