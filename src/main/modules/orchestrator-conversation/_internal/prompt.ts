/**
 * The transcript, as one prompt.
 *
 * ADR 0049: vendor session resumption is not proven, so every turn is a new
 * session handed its own history. That is the conservative direction - replaying
 * a transcript can only cost tokens, whereas assuming a resume that did not
 * happen loses the whole conversation silently. A Vendor Adapter that can prove
 * resumption may skip this later; nothing here has to change for that.
 */

import type { ConversationEntry } from '../../../../shared/orchestrator-conversation'

export interface WorkerDescriptor {
  id: string
  vendor?: string
  model?: string
}

export interface PromptOptions {
  workers?: readonly WorkerDescriptor[]
}

function renderPreamble(workers?: readonly WorkerDescriptor[]): string {
  const lines = [
    'You are the Orchestrator of a Console Hub fan run.',
    'Console Hub provides parallel worker agents in slots beneath this terminal.',
    'Your role in this conversation is to collaborate with the user to frame tasks and plan how to delegate the work across the workers.',
    'When the user asks to delegate work, research across workers, or split a task: do not execute the research or work yourself, and never claim that you lack workers or cannot delegate. Instead, propose a clear delegation plan outlining how to split the work across the workers.',
    'Once a delegation plan is agreed upon, the user will trigger the run in Console Hub to dispatch the tasks to the workers.'
  ]

  if (workers !== undefined && workers.length > 0) {
    const list = workers
      .map((w) => {
        const parts = [w.id]
        if (w.vendor) parts.push(w.vendor)
        if (w.model) parts.push(w.model)
        return parts.join(' · ')
      })
      .join(', ')
    lines.push(`Available worker slots: ${list}.`)
  }

  lines.push(
    'This is a new session: the conversation below is your own history, replayed as context.',
    'Answer the last message. Be direct and brief.'
  )

  return lines.join('\n')
}

/** `2m 18s`, the reading the mockup's snapshot block shows. */
export function elapsedLabel(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes === 0 ? `${seconds}s` : `${minutes}m ${seconds}s`
}

function stamp(at: number): string {
  return new Date(at).toISOString()
}

function renderEntry(entry: ConversationEntry): string | undefined {
  switch (entry.kind) {
    case 'user':
      return `USER: ${entry.text}`

    case 'orchestrator':
      // A turn still in flight has nothing to replay, and a blank speaker line
      // reads to the vendor as an empty assistant turn it should continue.
      if (entry.phase === 'responding' || entry.text.length === 0) return undefined
      return `ORCHESTRATOR: ${entry.text}`

    case 'delegation': {
      const head = `DELEGATION ACCEPTED · RUN ${entry.runId}`
      if (entry.degraded) {
        return `${head}\nNo per-slot split could be read, so every worker was sent all of it. `
          + 'This run is not a split.'
      }
      const lines = entry.assignments.map((a) => `  ${a.slotId}: ${a.task}`)
      return [head, ...lines].join('\n')
    }

    case 'snapshot': {
      const head = `RUN-STATUS SNAPSHOT · RUN ${entry.runId} · ${entry.lifecycle} · `
        + `snapshot taken at ${stamp(entry.at)}. It describes one point in time and may `
        + 'already be out of date. You cannot change this run.'
      const lines = entry.workers.map((worker) => {
        const tokens = worker.outputTokens === undefined
          ? ''
          : ` · ${worker.outputTokens.toLocaleString('en-US')} out`
        const excerpt = worker.excerpt.length > 0 ? ` · ${worker.excerpt}` : ''
        return `  ${worker.slotId} ${worker.phase.toUpperCase()} · `
          + `${elapsedLabel(worker.elapsedMs)}${tokens}${excerpt}`
      })
      return [head, ...lines].join('\n')
    }

    case 'synthesis': {
      const absent = entry.absentSlotIds ?? []
      const head = absent.length > 0
        ? `SYNTHESIS · RUN ${entry.runId} · PARTIAL ADVISORY · absent: ${absent.join(', ')}`
        : `SYNTHESIS · RUN ${entry.runId}`
      return `${head}\n${entry.text}`
    }
  }
}

export function buildPrompt(
  entries: readonly ConversationEntry[],
  options?: PromptOptions
): string {
  const body = entries
    .map(renderEntry)
    .filter((line): line is string => line !== undefined)
    .join('\n\n')
  return `${renderPreamble(options?.workers)}\n\n${body}\n`
}
