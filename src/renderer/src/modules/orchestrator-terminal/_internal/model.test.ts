import { describe, expect, it } from 'vitest'
import {
  canPropose,
  canRetry,
  composerDisabled,
  elapsedLabel,
  identityLabel,
  snapshotLine,
  stampLabel,
  turnLabel
} from './model'
import type { ConversationState } from '../../../../../shared/orchestrator-conversation'

function state(patch: Partial<ConversationState> = {}): ConversationState {
  return {
    id: 'c1',
    startedAt: 0,
    settings: { vendor: 'claude', model: 'sonnet', effort: 'high' },
    settingsLocked: false,
    continuity: 'fresh',
    entries: [],
    turn: 'idle',
    runs: [],
    ...patch
  }
}

describe('identityLabel', () => {
  it('reads as vendor, model, effort', () => {
    expect(identityLabel({ vendor: 'claude', model: 'sonnet', effort: 'high' }))
      .toBe('CLAUDE · SONNET · HIGH')
  })

  it('names only what the slot actually sets', () => {
    expect(identityLabel({ vendor: 'codex' })).toBe('CODEX')
  })
})

describe('turnLabel', () => {
  it('is readable without colour, as a glyph run plus a word', () => {
    expect(turnLabel(state({ turn: 'idle' }), undefined)).toBe('▯▯▯▯ READY')
    expect(turnLabel(state({ turn: 'responding' }), undefined)).toBe('▮▯▯▯ RESPONDING')
    expect(turnLabel(state({ turn: 'failed' }), undefined)).toBe('▯▮▯▮ REPLY FAILED')
  })

  it('reports the live run ahead of an idle conversation', () => {
    expect(turnLabel(state({ turn: 'idle' }), 'workers')).toBe('▮▮▮▮ WORKERS RUNNING')
    expect(turnLabel(state({ turn: 'idle' }), 'held')).toBe('▮▮▯▯ HELD')
  })

  it('lets a live reply outrank the run, since that is what the composer is waiting on', () => {
    expect(turnLabel(state({ turn: 'responding' }), 'workers')).toBe('▮▯▯▯ RESPONDING')
  })
})

describe('composerDisabled', () => {
  it('refuses a second message while a reply is live', () => {
    expect(composerDisabled(state({ turn: 'responding' }))).toBe(true)
    expect(composerDisabled(state({ turn: 'idle' }))).toBe(false)
    expect(composerDisabled(state({ turn: 'failed' }))).toBe(false)
  })
})

describe('canRetry', () => {
  it('is offered only on a failed reply', () => {
    expect(canRetry(state({ turn: 'failed' }))).toBe(true)
    expect(canRetry(state({ turn: 'idle' }))).toBe(false)
  })
})

describe('canPropose', () => {
  const replied = state({
    turn: 'idle',
    entries: [
      { kind: 'user', id: 'u1', at: 1, text: 'Split it.' },
      { kind: 'orchestrator', id: 'r1', at: 2, text: 'Three ways.', phase: 'complete' }
    ]
  })

  it('needs a landed reply and nothing already running', () => {
    expect(canPropose(replied, undefined)).toBe(true)
    expect(canPropose(replied, 'workers')).toBe(false)
    expect(canPropose(state({ turn: 'idle' }), undefined)).toBe(false)
  })

  it('refuses while a reply is still in flight', () => {
    expect(canPropose({ ...replied, turn: 'responding' }, undefined)).toBe(false)
  })

  it('allows a second run once the first is done', () => {
    expect(canPropose(replied, 'done')).toBe(true)
  })
})

describe('elapsedLabel', () => {
  it('reads in minutes and seconds', () => {
    expect(elapsedLabel(138_000)).toBe('2m 18s')
    expect(elapsedLabel(9_000)).toBe('9s')
  })
})

describe('stampLabel', () => {
  it('is the wall clock the transcript stamps an entry with', () => {
    expect(stampLabel(Date.parse('2026-09-02T10:42:00'))).toMatch(/^\d{2}:\d{2}$/)
  })
})

describe('snapshotLine', () => {
  it('states the phase, elapsed time and what the worker was doing', () => {
    expect(snapshotLine({
      slotId: 'w3',
      phase: 'running',
      elapsedMs: 138_000,
      excerpt: 'drafting benchmark coverage',
      outputTokens: 9_839
    })).toBe('w3 ▮▮▮▮ RUNNING · 2m 18s · 9,839 out · drafting benchmark coverage')
  })

  it('says nothing rather than inventing an excerpt', () => {
    expect(snapshotLine({ slotId: 'w1', phase: 'idle', elapsedMs: 0, excerpt: '' }))
      .toBe('w1 ▯▯▯▯ IDLE · 0s')
  })
})
