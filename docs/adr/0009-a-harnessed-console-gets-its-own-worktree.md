# A harnessed console gets its own worktree

Each harnessed console opens in its own git worktree on its own branch. Fan targets therefore all hold write access simultaneously, and a fan produces N real diffs rather than N opinions. `disler/fusion-harness`'s writer lease is kept underneath, unchanged in principle, as the backstop for consoles that genuinely share a path.

**Status:** accepted

## Context

The plan had adopted fusion-harness's single-writer invariant: one checkout, one write token, every other fan target launched read-only. That inherited a constraint rather than a decision. Reading `writer-lease.ts` showed why:

- The lock is `/tmp/fusion-harness-writer-locks/<sha256(cwd)[0:24]>.lock`, taken with `fs.openSync(path, "wx", 0o600)` so exactly one process wins the create.
- Owner is pid + uuid + label; release unlinks only when the owner still matches; a lock held by a dead pid is reclaimed and retried.
- **The key is the canonical working directory.** Concurrent modification of different checkouts is explicitly allowed. There is no git awareness anywhere in the module.

So the lease does not forbid parallel writing. It forbids parallel writing *to the same path*. Fusion-harness only ever needed that half because it never gave its children separate checkouts.

`/agent-loop` already solves the other half in this repo: one lane, one worktree, one branch, merged one at a time.

## Considered Options

- **One checkout with a single write token** (fusion-harness's shape). Rejected: a five-way fan can then produce five opinions but only one build, because four targets are read-only by construction. If the question is "which model actually solved it", this shape structurally cannot answer it.
- **Per-console choice — read-only consoles in the main checkout, writers in worktrees.** Rejected as a default because it makes a console's isolation another thing to reason about mid-session. A read-only console in its own worktree costs almost nothing.

## Consequences

- **The read-only enforcement apparatus is largely retired.** The unverified vendor read-only flags, the loud startup check, and the risk that an agent lifts its own restriction stop being load-bearing for safety. They remain useful for cheap research consoles, not as the thing standing between four agents and one checkout.
- The Hub owns worktree lifecycle: create on open, track, prune on close, and reconcile orphans left by a crash. This is new surface area and the largest cost of the decision.
- **A fan's results are branches, not files.** The merge compares diffs, and the architect console reasons about branches. What a merge produces is a separate decision.
- The lease is retained and cheap. Two consoles pointed at the same path still serialise correctly instead of racing.
- The Hub now overlaps `/agent-loop`'s dispatch phase substantially — same worktree-per-lane model, drawn and watched rather than scripted. It does **not** cover agent-loop's export or re-entry: the file-disjoint split, type-overlap tracing, blocker ordering, the manifest, and the review-and-merge sequence remain that skill's. A fan duplicates one brief across models; agent-loop divides one plan across lanes. Different operations that happen to share a runtime.
