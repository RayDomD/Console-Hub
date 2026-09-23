# Stack edits apply to future runs

The Stack plate adds, removes, renames, and reorders one to five slots, and edits each slot's Role, Vendor, model, reasoning effort, and Slot Instructions. Vendor Adapters supply known models, while a custom model name is allowed only after Cockpit probes it successfully. Slot names are unique and short, and the Role arrangement must remain valid.

Each running Recipe owns an immutable snapshot of the Stack it launched with. Live Stack edits affect later runs, require no app restart, and persist automatically. Editing or removing a slot with an active Direct Session or Console requires confirmation so active work is never silently orphaned.

**Status:** accepted
