# A merge synthesises into its own branch

The architect console reads the N diffs a fan produced and writes the version it judges correct, in its own worktree, on its own branch — free to take structure from one lane and edge-case handling from another. It writes a comparison note alongside, stating what it took from where.

It does not merge into the user's working branch. Adoption is one explicit click.

**Status:** accepted

## Context

`cmd-fusion.ts` spawns a temporary `FUSION` agent on the architect's model with `FULL_TOOLS` and the writer lease, while every source agent stays on `READONLY_TOOLS`. It receives the original prompt plus the complete transcripts of all successful runs, and it can write code, not only prose. The result persists as `fusion-context.md`.

Two parts of that do not transfer. Their fuser reads **transcripts**; ours reads **diffs**, because every fan target has a worktree ([ADR 0009](0009-a-harnessed-console-gets-its-own-worktree.md)). And their fuser needs the writer lease because it is the only writer in the checkout; ours does not, because it has a worktree of its own.

## Considered Options

- **Produce a comparison only** — the architect assesses the N diffs and the user checks out a branch by hand. Rejected as the default: it makes the merge a reviewer, and leaves the user assembling the good parts manually, which is the work the fan was supposed to remove. The comparison is kept, as an artifact *alongside* the synthesis.
- **Adjudicate — pick a winner and merge it** — rejected on both ends. The best answer is frequently in no single diff, and merging into the working branch on a judgement nobody watched is exactly the irreversible step that should not be automatic.

## Consequences

- A fan ends with N+1 branches and a note. Any of them can be diffed against any other before anything is adopted.
- **Firing is automatic; landing is not.** [ADR 0007](0007-armed-relations-fire-themselves.md) automates moving work between agents because that is reversible. Writing to the branch the user ships from is not, so it stays deliberate. This is the line between the two, stated once.
- The architect needs a worktree like any other harnessed console, and its branch is created from the same base the fan started from.
- The comparison note is a real deliverable, not a log. It is what makes the four discarded branches worth having produced.
- A synthesis that draws from several lanes may combine code that was never tested together. The note must say what was combined, and the synthesised branch is not privileged over the others until it has been run.
