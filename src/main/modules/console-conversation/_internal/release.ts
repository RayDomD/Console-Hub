/**
 * The two small parses that decide when a Console delegation plan actually
 * runs (grilled decisions D4): a plain "go"/"yes" reply releases the plan
 * already shown, and a message starting with `./goal` plans and releases in
 * the same turn without skipping the shown plan.
 */

const RELEASE_WORDS = new Set(['go', 'yes'])

/** An exact match only, never a substring - "let's go look at this" must not fire it. */
export function isReleaseReply(text: string): boolean {
  return RELEASE_WORDS.has(text.trim().toLowerCase())
}

const GOAL_PREFIX = /^\.\/goal\s+(\S.*)$/s

/** The goal text after `./goal `, or `undefined` when the message is not that form. */
export function parseGoalCommand(text: string): string | undefined {
  const match = GOAL_PREFIX.exec(text.trim())
  return match?.[1]?.trim()
}
