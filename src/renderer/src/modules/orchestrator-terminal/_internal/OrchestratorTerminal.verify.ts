import type { ConversationState } from '../../../../../shared/orchestrator-conversation'

/**
 * The terminal's DOM contract.
 *
 * Layer 0 is a canvas and the Hub is screenshot-verified, so these attributes
 * are what a test can actually assert against: that the composer is disabled
 * exactly while a reply is live, that a proposal is only offered once one has
 * landed, and that a restored transcript says so rather than passing itself off
 * as a resumed session.
 */

export interface OrchestratorTerminalFixture {
  name: string
  attrs: Record<string, string>
  expected: 'pass' | 'fail'
}

export type TerminalTurn = ConversationState['turn']
export type TerminalContinuity = ConversationState['continuity']

const VERIFY_TURNS = ['idle', 'responding', 'failed']
const VERIFY_CONTINUITY = ['fresh', 'restored']

export function orchestratorTerminalVerifyAttrs(
  turn: TerminalTurn,
  continuity: TerminalContinuity,
  entryCount: number,
  runCount: number,
  settingsLocked: boolean,
  canPropose: boolean
): Record<string, string> {
  return {
    'data-verify-unit': 'OrchestratorTerminal',
    'data-verify-turn': turn,
    'data-verify-continuity': continuity,
    'data-verify-entries': String(entryCount),
    'data-verify-runs': String(runCount),
    'data-verify-settings': settingsLocked ? 'locked' : 'open',
    // The composer is disabled rather than queued while a reply is live (ADR 0049).
    'data-verify-composer': turn === 'responding' ? 'disabled' : 'live',
    'data-verify-retry': turn === 'failed' ? 'offered' : 'absent',
    'data-verify-propose': canPropose ? 'offered' : 'absent'
  }
}

export const fixtures: OrchestratorTerminalFixture[] = [
  {
    name: 'a fresh conversation with nothing said',
    attrs: orchestratorTerminalVerifyAttrs('idle', 'fresh', 0, 0, false, false),
    expected: 'pass'
  },
  {
    name: 'a live reply',
    attrs: orchestratorTerminalVerifyAttrs('responding', 'fresh', 2, 0, true, false),
    expected: 'pass'
  },
  {
    name: 'a landed reply offering a proposal',
    attrs: orchestratorTerminalVerifyAttrs('idle', 'fresh', 2, 0, true, true),
    expected: 'pass'
  },
  {
    name: 'a restored transcript with one released run',
    attrs: orchestratorTerminalVerifyAttrs('idle', 'restored', 3, 1, true, true),
    expected: 'pass'
  },
  {
    name: 'a failed reply offering retry',
    attrs: orchestratorTerminalVerifyAttrs('failed', 'fresh', 2, 0, true, false),
    expected: 'pass'
  },
  {
    name: 'invalid-composer-live-while-responding',
    attrs: {
      ...orchestratorTerminalVerifyAttrs('responding', 'fresh', 2, 0, true, false),
      'data-verify-composer': 'live'
    },
    expected: 'fail'
  },
  {
    name: 'invalid-propose-while-a-reply-is-live',
    attrs: {
      ...orchestratorTerminalVerifyAttrs('responding', 'fresh', 2, 0, true, false),
      'data-verify-propose': 'offered'
    },
    expected: 'fail'
  },
  {
    name: 'invalid-settings-unlocked-after-a-message',
    attrs: {
      ...orchestratorTerminalVerifyAttrs('idle', 'fresh', 2, 0, false, true),
      'data-verify-settings': 'open'
    },
    expected: 'fail'
  },
  {
    name: 'invalid-retry-offered-on-a-healthy-turn',
    attrs: {
      ...orchestratorTerminalVerifyAttrs('idle', 'fresh', 2, 0, true, true),
      'data-verify-retry': 'offered'
    },
    expected: 'fail'
  },
  {
    name: 'invalid-run-without-a-transcript',
    attrs: orchestratorTerminalVerifyAttrs('idle', 'fresh', 0, 1, true, false),
    expected: 'fail'
  },
  {
    name: 'invalid-continuity',
    attrs: {
      ...orchestratorTerminalVerifyAttrs('idle', 'fresh', 0, 0, false, false),
      'data-verify-continuity': 'resumed'
    },
    expected: 'fail'
  }
]

export const invariants = [
  {
    description: 'The terminal identifies its verification unit.',
    check: (attrs: Record<string, string>) =>
      attrs['data-verify-unit'] === 'OrchestratorTerminal'
  },
  {
    description: 'The turn is one of the three the conversation can be in.',
    check: (attrs: Record<string, string>) => VERIFY_TURNS.includes(attrs['data-verify-turn'] ?? '')
  },
  {
    description: 'A restored transcript says so rather than claiming a resumed session.',
    check: (attrs: Record<string, string>) =>
      VERIFY_CONTINUITY.includes(attrs['data-verify-continuity'] ?? '')
  },
  {
    description: 'Only one reply is live: the composer is disabled while responding.',
    check: (attrs: Record<string, string>) =>
      attrs['data-verify-turn'] !== 'responding' || attrs['data-verify-composer'] === 'disabled'
  },
  {
    description: 'No proposal is offered while a reply is in flight.',
    check: (attrs: Record<string, string>) =>
      attrs['data-verify-turn'] !== 'responding' || attrs['data-verify-propose'] === 'absent'
  },
  {
    description: 'Retry is offered on a failed reply and nowhere else.',
    check: (attrs: Record<string, string>) =>
      (attrs['data-verify-retry'] === 'offered') === (attrs['data-verify-turn'] === 'failed')
  },
  {
    description: 'Settings are locked once anything has been said.',
    check: (attrs: Record<string, string>) =>
      Number(attrs['data-verify-entries']) === 0 || attrs['data-verify-settings'] === 'locked'
  },
  {
    description: 'A run cannot exist without the transcript that proposed it.',
    check: (attrs: Record<string, string>) => {
      const runs = Number(attrs['data-verify-runs'])
      const entries = Number(attrs['data-verify-entries'])
      return Number.isInteger(runs) && runs >= 0 && (runs === 0 || entries > 0)
    }
  }
]
