export const fixtures = [
  { name: 'closed', description: 'No CLI session has started.' },
  { name: 'ready', description: 'A live terminal accepts prompts and slash commands directly.' },
  { name: 'paused', description: 'Native terminal input pauses automatic handoffs.' },
  { name: 'busy', description: 'Worker results wait until the current response ends.' },
  { name: 'plan-ready', description: 'A saved delegation plan is visible for release.' }
]

export const invariants = [
  { description: 'A saved plan has visible text and an explicit release control.',
    check: (el: Element) => el.getAttribute('data-verify-plan-ready') !== 'true' ||
      (!!el.querySelector('pre')?.textContent && [...el.querySelectorAll('button')].some((button) => button.textContent === 'Release to workers')) }
]
