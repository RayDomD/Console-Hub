/**
 * The Vendor-neutral `/mission` command protocol (ADR 0053, step 3 of the
 * Console Hub Mission plan). The instructions below are plain text pasted into
 * the Orchestrator terminal, so they work identically for claude, codex,
 * and agy. `parseMissionDraft` then turns whatever JSON the Vendor wrote back
 * into a held `MissionState`, reusing `createMissionState`'s invariants
 * rather than duplicating them.
 */
import type { ConsoleAgent } from '../../../../shared/consoles'
import type { MissionLanePlan, MissionPlan, MissionState } from '../../../../shared/mission'
import { isFilesystemSkillName } from '../../../../shared/skill-name'
import { createMissionState } from './missionState'

export const MISSION_DRAFT_INSTRUCTIONS = `When asked to prepare a Mission, draft a Mission plan as JSON (not markdown), matching this shape exactly:

{
  "version": 1,
  "title": string,
  "workspace": string,
  "acceptanceCriteria": string[],
  "lanes": [{
    "id": string,
    "workerLabel": string,
    "agent": { "vendor": "claude" | "codex" | "agy", "model"?: string, "effort"?: string },
    "task": string,
    "files": string[],
    "validation": string[],
    "skills"?: string[],
    "contextRefs"?: string[],
    "deliverables"?: string[],
    "dependsOn"?: string[],
    "reinforcement"?: boolean,
    "reviewOnly"?: boolean
  }],
  "unusedWorkers": [{ "label": string, "reason": string }]
}

One worker owns one lane, and workerLabel must name an open Mission crew terminal (e.g. "T1"). A lane for an already-launched worker keeps that worker's existing vendor; only a lane marked "reinforcement": true may propose a new worker and vendor. One Mission has at most six lanes; a larger indivisible plan must become separate Missions.

Keep the Orchestrator's full conversation in the Orchestrator. Give each worker only the named skills, relevant contextRefs, task, and deliverables it needs. Controlled Mission lanes are non-interactive; keep live design exploration in an ordinary Console session until controlled session continuation is available. Console Hub resolves named skills and supplies their instructions directly to Claude, Codex, or AGY.

Present the complete plan in the Orchestrator terminal before saving it. Save the JSON to the exact plan path using a temporary sibling and atomic rename. Do not release it yourself: the user reviews it in the terminal, then says "go ahead" or types /mission run.`

export type MissionDraftResult =
  | { kind: 'held'; state: MissionState }
  | { kind: 'refused'; reason: string }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function refused(reason: string): MissionDraftResult { return { kind: 'refused', reason } }

/**
 * Validates worker/vendor integrity against the currently open Mission crew
 * before handing the plan to `createMissionState`, which owns every other
 * invariant (lane count, unique ids/workers, file/validation contracts,
 * dependency validity).
 */
export function parseMissionDraft(id: string, text: string, workers: Record<string, ConsoleAgent | undefined>): MissionDraftResult {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return refused('Mission plan must be valid JSON.') }
  if (!isPlainObject(raw)) return refused('Mission plan must be a JSON object.')
  if (raw.version !== 1) return refused('Mission plan must set version: 1.')
  if (typeof raw.title !== 'string' || !raw.title.trim()) return refused('Mission plan requires a title.')
  if (typeof raw.workspace !== 'string' || !raw.workspace.trim()) return refused('Mission plan requires a workspace.')
  if (!Array.isArray(raw.acceptanceCriteria) || !raw.acceptanceCriteria.every((c) => typeof c === 'string')) {
    return refused('Mission plan requires acceptanceCriteria as an array of strings.')
  }
  if (!Array.isArray(raw.lanes)) return refused('Mission plan requires a lanes array.')
  if (!Array.isArray(raw.unusedWorkers)) return refused('Mission plan requires an unusedWorkers array.')
  const unusedWorkers = raw.unusedWorkers

  for (const lane of raw.lanes as unknown[]) {
    if (!isPlainObject(lane)) return refused('Each Mission lane must be an object.')
    const workerLabel = lane.workerLabel
    if (typeof workerLabel !== 'string') return refused('Each Mission lane needs a workerLabel.')
    if (!(workerLabel in workers)) return refused(`${workerLabel} is not an open Mission crew terminal.`)
    const existing = workers[workerLabel]
    const agent = isPlainObject(lane.agent) ? (lane.agent as Partial<ConsoleAgent>) : undefined
    const skills = lane.skills
    if (skills !== undefined && (!Array.isArray(skills) || !skills.every(isFilesystemSkillName))) {
      return refused(`${String(lane.id ?? workerLabel)}: skills must be valid skill names.`)
    }
    for (const field of ['contextRefs', 'deliverables'] as const) {
      const values = lane[field]
      if (values !== undefined && (!Array.isArray(values) || !values.every((value) => typeof value === 'string' && value.trim()))) {
        return refused(`${String(lane.id ?? workerLabel)}: ${field} must be an array of non-empty strings.`)
      }
    }
    if (lane.interactive === true) return refused(`${String(lane.id ?? workerLabel)}: interactive Mission lanes are not supported yet; use an ordinary Console session.`)
    if (lane.interactive !== undefined && typeof lane.interactive !== 'boolean') return refused(`${String(lane.id ?? workerLabel)}: interactive must be boolean.`)
    if (!lane.reinforcement) {
      if (!existing) return refused(`${workerLabel} has no launched agent; mark its lane as a reinforcement.`)
      if (!agent || agent.vendor !== existing.vendor) {
        return refused(`${workerLabel}: select a new agent in fleet configuration before changing vendors.`)
      }
    } else if (!agent?.vendor) {
      return refused(`${workerLabel}'s reinforcement lane needs a chosen vendor.`)
    } else if (!agent.model?.trim()) {
      return refused(`${workerLabel}'s reinforcement lane needs an explicit model.`)
    }
  }

  const assignedLabels = new Set((raw.lanes as Array<Record<string, unknown>>).map((lane) => lane.workerLabel as string))
  const unusedLabels = new Set<string>()
  for (const unused of unusedWorkers) {
    if (!isPlainObject(unused) || typeof unused.label !== 'string') return refused('Every unused worker requires a label.')
    if (typeof unused.reason !== 'string' || !unused.reason.trim()) return refused('Every unused worker requires a non-empty reason.')
    if (!workers[unused.label]) return refused(`${unused.label} is not an available agent-backed worker.`)
    if (assignedLabels.has(unused.label)) return refused(`${unused.label} cannot be both assigned and unused.`)
    if (unusedLabels.has(unused.label)) return refused(`${unused.label} may appear only once in unusedWorkers.`)
    unusedLabels.add(unused.label)
  }
  for (const [label, agent] of Object.entries(workers)) {
    if (agent && !assignedLabels.has(label) && !unusedLabels.has(label)) {
      return refused(`${label} must be assigned a lane or named once in unusedWorkers.`)
    }
  }

  const lanes = (raw.lanes as MissionLanePlan[]).map((lane) => lane.reinforcement
    ? lane
    : { ...lane, agent: { ...workers[lane.workerLabel]! } })

  const plan: MissionPlan = {
    version: 1,
    title: raw.title,
    workspace: raw.workspace,
    acceptanceCriteria: raw.acceptanceCriteria as string[],
    lanes,
    unusedWorkers: unusedWorkers as MissionPlan['unusedWorkers']
  }
  try {
    return { kind: 'held', state: createMissionState(id, plan) }
  } catch (error) {
    return refused(error instanceof Error ? error.message : String(error))
  }
}
