# Two kinds of fan, and three write scopes

A fan is either a **question fan** or a **build fan**. The kind is chosen when the fan is created and determines everything downstream. Write access is not a boolean but a path scope: `NONE`, `DOCS` (`docs/**` only), or `CODE` (everything, inside the console's own worktree).

**Status:** superseded by ADR 0021

## Context

`prompt-library.ts` shows fusion-harness sends the user's raw text to every slot verbatim — `fill("USER_PROMPT_OPINION.md", { PROMPT: prompt })` — with no architect pre-digest anywhere. The architect appears only on the return, merging transcripts or proposals. That is deliberate: pre-digesting through one model collapses the independent interpretation four models are being paid to produce.

Cockpit's payload is a compiled brief, not a raw prompt, which is right for building — four agents given a loose sentence produce four unrelated diffs — and wrong for asking, where divergence is the product.

`CLAUDE.md` also makes documents the deliverable: research, plans, ADRs and session summaries are all required artifacts. An architect that cannot write cannot produce them, leaving the user to copy a panel into a file by hand — the manual joining this system exists to remove.

## The two kinds

| | Question fan | Build fan |
|---|---|---|
| Answers | "What should we do?" | "Do it" |
| Payload | Raw prompt, verbatim to all | `docs/briefs/<file>.md` |
| Worker scope | `NONE` | `CODE` |
| Architect scope | `DOCS` | `CODE` |
| Isolation | None, shared checkout | One worktree per console |
| Produces | A plan in `docs/plans/` | N branches plus a synthesised branch |
| Merge does | Scores against criteria, recommends | Synthesises, notes what it took from where |
| Rounds | One | Up to five, gate-driven |
| Sessions | Discarded | Workers persist, architect re-seeds |
| Rough cost | ~60–80k tokens | ~900k tokens |
| Guard | The `wx` lockfile | Worktrees, lockfile underneath |

## Considered Options

- **Briefs only** — rejected: every idle question would first cost a brief-writing session.
- **Raw prompts only** (fusion's shape) — rejected: four agents reading one loose sentence produce four unrelated diffs.
- **A toggle between the two on an existing fan** — rejected. They are two objects, not two settings. Flipping a running build fan raises four questions with no good answers: uncommitted worktrees, live sessions, a round counter mid-flight, and an input control that must swap from a file path to a text box. A picker at creation is fine; conversion is legal only while idle.

## Consequences

- **The control the user reaches for is `promote`, not a toggle.** A finished question fan's comparison is the input to a build fan, so the button on a completed question fan opens a build fan with the same models and a brief seeded from the comparison. The two run in sequence and the canvas shows the lineage.
- Scope is a chip visible on every card without opening anything. Three values is the limit of what a glance carries.
- The fan kind sets scope defaults; a single console may be overridden. A build fan with three `CODE` workers and one `DOCS` console writing up the run is legitimate.
- Two fans of different kinds can run on one canvas at once, each with its own architect.
- `DOCS` writes land in the main checkout rather than a worktree, which is exactly the case fusion-harness's `wx` lockfile guards.
- **A fan is per ticket.** `CLAUDE.md` requires one ticket per fresh context window, so session persistence ([ADR 0011](0011-fan-consoles-persist-across-rounds.md)) holds across fix rounds within a ticket and ends at the ticket boundary. A five-ticket plan is five sequential fans.
