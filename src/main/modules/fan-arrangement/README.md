# fan-arrangement

Decides whether a stored fan arrangement is one the plate can open on, and what
a profile with nothing stored starts from.

## Public interface

- `defaultArrangement(executors)` — the starting arrangement, built from the
  config's `executors` block: four workers alternating between the two
  spawnable vendors, and an orchestrator.
- `validArrangement(stored)` — the stored value when it satisfies every rule the
  fan machine and the harness would otherwise throw on, `undefined` otherwise.

## What it does not handle

- **Reading and writing.** The config store owns the file; this module is pure.
- **Model rosters.** A model name is checked for being a string, not for being
  one the vendor accepts — that roster is live, and the machine validates it at
  Enter with the list main supplies.
- **The question.** Not part of an arrangement, and deliberately not persisted.
- **The workspace.** The fan's workspace persists alongside the slot arrangement,
  under the config store's own `fanWorkspace()` and `saveWorkspace()`, and falls
  back the same way: a stored path that no longer exists on disk costs the user
  their workspace, never their plate. It is not part of this module because
  checking a path against the filesystem is not a rule the fan machine or the
  harness would throw on — it lives in `config`, which already owns the
  filesystem.

## Dependencies

`../../../../shared/fan` for `SlotConfig`. Nothing else.
