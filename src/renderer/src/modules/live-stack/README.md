# live-stack

The one lineup of slots, held app-wide.

ADR 0030: the Stack survives Recipe and Workspace changes, so it cannot belong to the run plate that
happens to be open. The Hub's aside displays it and the plate edits it; both read the same array,
and there is one writer to disk.

## Public interface

- `LiveStackProvider` — wraps the app. Seeds from the persisted arrangement, falling back to
  `DEFAULT_SLOTS` for the frame before it arrives.
- `useLiveStack()` — `{ slots, edit }`. `edit` takes a function from the current slots to the next
  and persists the result.

## What it does not handle

- **What a valid arrangement is.** The slot helpers stay in the run plate, which is what edits them.
  This module stores an array; it does not police its shape.
- **Rendering a slot.** The aside and the plate each draw it their own way.
- **Per-run snapshots.** A run freezes its own copy; this is the live configuration, not the record.

## Dependencies

`react`, `SlotConfig` from `src/shared/fan`, and `window.consoleHub.fan` for persistence.
