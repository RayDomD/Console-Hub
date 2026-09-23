# Fan consoles persist across rounds

A fan is not one-shot. After a merge, each source console is resumed with its prior session intact, told the synthesised branch, and has its worktree reset onto it. Agents carry their reasoning into the next round instead of re-deriving it.

The checkout is the authority. Session memory is an accelerator, never a source of truth: where an agent's recollection and the worktree disagree, the worktree is right.

**The architect is exempt.** It starts each round with a fresh session.

**Status:** accepted

## Context

`cmd-fusion.ts` ends every fusion with a hard sync — each slot receives the fused context and must reply exactly `ACK FUSION <run-id>` with zero tool calls, retried once before the slot is marked failed. Fusion-harness needs this because its agents share one checkout: the merged result lives in the fuser's context and one markdown file, so the only carrier to the other slots is their context windows.

Cockpit has a stronger carrier. The synthesis is a branch ([ADR 0010](0010-a-merge-synthesises-into-its-own-branch.md)), and every console has a worktree that can be reset onto it.

## Considered Options

- **One-shot fans.** Merge lands, consoles close, worktrees prune, and round two is a fresh fan based on the synthesised branch. Rejected by the user, who wants agent context to continue. It would have removed the drift failure entirely, at the cost of re-paying context-loading tokens once per console per round.

## Consequences

- **Two carriers of state now exist, and they can disagree.** An agent may remember a decision the merge overruled. The rule above settles it: the worktree wins, and the resume message states the branch explicitly rather than describing the change in prose.
- The sync keeps fusion's cheapest idea — a required acknowledgement with no tool calls — as proof the console actually received the new base, not as ceremony. A console that fails to acknowledge is marked failed and does not join the next round.
- **Sessions must be resumable and are vendor-specific.** Cockpit must capture each console's session identifier from its stream at launch and resume against it. The exact flags for `claude` and `codex` are unverified and must be confirmed on this machine before this ships; a console whose session cannot be resumed degrades to a fresh one, and the card must say so rather than silently starting over.
- Worktree reset must be clean. A source console with uncommitted work in its worktree at merge time either commits it to its own branch first or the reset refuses. Discarding an agent's work silently is not acceptable.
- Cost accrues per round across every console, so a fan needs an explicit termination rule.

## Why the architect is exempt

A worker reads the brief and its own worktree. The architect reads **all four diffs, every round**, so by round three it carries twelve while each worker carries three of its own commits. Estimated context entering each round — unmeasured, and to be instrumented on a real fan before it is trusted:

| Round | Architect | Worker |
|---|---|---|
| 1 | ~55k | ~30k |
| 2 | ~110k | ~45k |
| 3 | ~165k | ~60k |

The architect is the only console that approaches the window, and what it is carrying is the worst possible payload: diffs from rounds that have since been superseded, while the branches those diffs came from sit on disk as current truth. Re-seeding it costs one fresh read of four current diffs and produces a judge with no memory of arguments that no longer apply.

Prompt caching absorbs much of the re-read cost on a persisted prefix, so quota burn grows more slowly than context does. The window pressure is real regardless.

