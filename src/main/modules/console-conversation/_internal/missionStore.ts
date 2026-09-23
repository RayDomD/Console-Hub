import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import type { MissionState } from '../../../../shared/mission'

export class MissionStore {
  private saving: Promise<void> = Promise.resolve()

  constructor(private readonly root: string) {}

  folder(id: string): string { return join(this.root, 'missions', id) }

  async save(state: MissionState): Promise<void> {
    state.summaryPath = join(this.folder(state.id), 'plan.md')
    const snapshot = structuredClone(state)
    const saving = this.saving.then(() => this.writeSnapshot(snapshot))
    this.saving = saving.catch(() => undefined)
    return saving
  }

  private async writeSnapshot(state: MissionState): Promise<void> {
    const path = join(this.folder(state.id), 'run.json')
    const summaryPath = state.summaryPath ?? join(this.folder(state.id), 'plan.md')
    await mkdir(dirname(path), { recursive: true })
    const temporary = `${path}.${randomUUID()}.tmp`
    await writeFile(temporary, JSON.stringify(state, null, 2), 'utf8')
    await rename(temporary, path)
    const summaryTemporary = `${summaryPath}.${randomUUID()}.tmp`
    await writeFile(summaryTemporary, this.summary(state), 'utf8')
    await rename(summaryTemporary, summaryPath)
  }

  private summary(state: MissionState): string {
    const escape = (text: string) => text.replace(/[\\`*_[\]<>#]/g, '\\$&').replace(/[\r\n]+/g, ' ')
    const link = (label: string, path?: string) => path
      ? `[${label}](<${encodeURI(relative(this.folder(state.id), path).replace(/\\/g, '/')).replace(/#/g, '%23')}>)`
      : `${label}: unavailable`
    const plan = JSON.stringify(state.plan, null, 2)
    let fence = '```'
    while (plan.includes(fence)) fence += '`'
    return [
      `# ${escape(state.plan.title)}`, '', '## Summary', '',
      `Mission: ${escape(state.id)}. Outcome: ${state.phase}.`,
      `Source repository: ${escape(state.plan.workspace)}.`,
      `Snapshot: ${escape(state.snapshotPath ?? 'not released')}.`,
      ...(state.cleanupError ? [`Cleanup failed: ${escape(state.cleanupError)}`] : []), '',
      ...state.lanes.flatMap((lane) => [
        `### ${escape(lane.workerLabel)} / ${escape(lane.id)}`, '', `Outcome: ${lane.phase}.`,
        ...lane.evidence.flatMap((evidence) => [
          `Attempt ${evidence.attempt}: ${escape(evidence.summary ?? 'No worker summary returned')}.`,
          `Validation: ${evidence.error ? escape(evidence.error) : evidence.validationPath ? 'see recorded results' : 'not recorded'}.`,
          `${link('Result', evidence.resultPath)} · ${link('Patch', evidence.diffPath)} · ${link('Validation log', evidence.validationPath)}`
        ]), ''
      ]),
      '### Worktrees', '',
      ...(state.worktrees ?? []).map((tree) => `- ${escape(tree.laneId)}: ${tree.status}. Former/allocated path: ${escape(tree.path)}. ${link('Retained patch', tree.evidencePath)}${tree.error ? `. ${escape(tree.error)}` : ''}`), '',
      `${link('Integration patch', state.integrationPatchPath)} · ${link('Integration validation', state.integrationValidationPath)}`, '',
      'Worktree paths are historical references, not artifact links. Retained evidence survives cleanup.', '',
      '## Accepted plan', '', `${fence}json`, plan, fence, ''
    ].join('\n')
  }

  async load(id: string): Promise<MissionState | undefined> {
    const text = await readFile(join(this.folder(id), 'run.json'), 'utf8').catch(() => undefined)
    if (!text) return undefined
    const state = JSON.parse(text) as MissionState
    if (!['applied', 'rejected', 'held', 'stopped', 'integration_failed', 'ready_apply', 'ready_review'].includes(state.phase)) {
      state.phase = 'interrupted'
      for (const lane of state.lanes) if (lane.phase === 'running') lane.phase = 'stopped'
      await this.save(state)
    }
    return state
  }

  async loadLatest(): Promise<MissionState | undefined> {
    const entries = await readdir(join(this.root, 'missions'), { withFileTypes: true }).catch(() => [])
    const candidates = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
      const text = await readFile(join(this.folder(entry.name), 'run.json'), 'utf8').catch(() => undefined)
      if (!text) return undefined
      try {
        const state = JSON.parse(text) as Partial<MissionState>
        return typeof state.createdAt === 'number' ? { id: entry.name, createdAt: state.createdAt } : undefined
      } catch {
        return undefined
      }
    }))
    const latest = candidates.filter((item): item is { id: string; createdAt: number } => !!item)
      .sort((left, right) => right.createdAt - left.createdAt)[0]
    return latest ? this.load(latest.id) : undefined
  }
}
