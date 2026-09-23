/** Live DOM checks also used by the Electron launch-button verification. */
export const fixtures = [
  { name: 'initial', description: 'One shell, all launchers enabled.' },
  { name: 'agent-terminals', description: 'Codex, Claude and AGY each have their own terminal.' },
  { name: 'full', description: 'Six terminals, every launcher disabled.' },
  { name: 'workspace', description: 'New terminals receive the typed folder, existing ones retain theirs.' }
]

export const invariants = [
  {
    description: 'The displayed count matches the terminal cards.',
    check: (el: Element): boolean => Number(el.getAttribute('data-verify-count')) === el.querySelectorAll('[data-verify="console-view"]').length
  },
  {
    description: 'All launchers respect the terminal cap.',
    check: (el: Element): boolean => [...el.querySelectorAll<HTMLButtonElement>('[aria-label="Add terminal"] button')]
      .every((button) => button.disabled === (el.getAttribute('data-verify-can-add') === 'false'))
  }
]
