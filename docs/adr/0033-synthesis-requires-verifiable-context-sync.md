# Synthesis requires verifiable Context Sync

After Synthesize or Coordinate produces its final result, every participating persistent Session receives the exact result, branch identity, and common content hash in a no-tools turn. Each slot must return an exact acknowledgement containing the run ID and hash; a malformed or missing acknowledgement retries once. A successful result remains available when acknowledgement fails, but the run is visibly marked `Sync incomplete`, and an unacknowledged slot cannot join a continuation until reset or successfully resynchronized.

For Coordinate, each clean source worktree moves onto the integrated branch before acknowledgement. A dirty worktree refuses rather than discarding changes. Explore, Debate, Validate, Direct, and Console perform no fan-wide Context Sync. This sharpens the acknowledgement rule already established by [ADR 0011](0011-fan-consoles-persist-across-rounds.md) around the new Recipe model.

**Status:** accepted
