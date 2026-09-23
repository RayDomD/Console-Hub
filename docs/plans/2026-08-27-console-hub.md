---
title: Console Hub — fans of models, and consoles wired to each other
date: 2026-08-27
status: In Progress
summary: Ask four models one question and get one scored comparison, then hand the same brief to four models in four worktrees and get four real diffs. Phase 1 is a plate. Phase 2 is the full canvas with wires, loops and worktrees. The Console Recipe separately gained the same Orchestrator-plus-grid shape for real terminals (2026-09-04), reversing ADR 0028.
spec: ../mockups/2026-09-01-console-hub-workspace-rail.html
---

## Goal

Cockpit plan step 7 (`node-pty` terminal launch) grown into two surfaces that share one runtime.

**The first problem is picking.** Model rankings move monthly, and choosing one executor per task is
a bet placed with no information. `disler/fusion-harness` answers this by running 2–5 models on the
same problem and merging — *AND, not OR* — with one model acting as architect and a single-writer
invariant keeping them from overwriting each other. This plan takes that model and changes the two
things that do not fit Cockpit: fusion spawns headless children into a TUI grid, and it serialises
writers because its children share one checkout.

**The second problem is handoff.** Running Claude in one pane and Codex in another already works;
people do it today inside the Codex desktop app, using it as a window manager. What it cannot do is
move the work between them. Every handoff is select, copy, paste, retype the filename. **Cockpit
beats that setup by exactly one feature: the wire.**

Secondary, and the reason it matters to this user: when Claude usage runs out mid-task, there is
somewhere to keep working that spends quota already paid for.

## Approach

### The runtime

**A console is a shell, not an agent** — a real pty running PowerShell or Git Bash. Cockpit opens
it, so Cockpit knows its folder; that is the whole reason consoles live here rather than in Windows
Terminal.

**A console has a mode** ([ADR 0008](../adr/0008-consoles-have-a-mode.md)). *Interactive* is the
default: the pty you type into and can answer. *Harnessed* launches the agent headless with a
structured event stream — `claude -p --output-format stream-json`, `codex exec --json` — and renders
that stream on the card instead of a terminal screen. Fusion's `child-runner.ts` treats
`message_end` with an assistant role as the turn boundary; a pty has no such boundary, only bytes
meant for a screen. Fusion gets the clean signal **because it gave up interactivity**. Cockpit keeps
both by choosing per console.

The cost is real and stated once: **a harnessed console cannot ask a question.** It either has
enough context or it fails. That makes brief quality a hard requirement rather than a convention.

**Every harnessed console spends a subscription you already pay for.** It runs the vendor's own CLI
with the login already on this machine. `docs/research/2026-08-27-claude-code-model-harness.md`
settles why this matters: a gateway credential *replaces* the subscription login and bills per
token, and no gateway mints non-Anthropic inference out of a Claude subscription. Harnessed mode
replaces nothing. No gateway, no API keys, no metered billing.

### Two kinds of fan

A fan is one payload to many consoles. Its kind is chosen at creation and determines everything
downstream ([ADR 0012](../adr/0012-two-kinds-of-fan.md)).

| | Question fan | Build fan |
|---|---|---|
| Answers | "What should we do?" | "Do it" |
| Payload | Raw prompt, verbatim to all | `docs/briefs/<file>.md` |
| Worker scope | `NONE` | `CODE` |
| Architect scope | `DOCS` | `CODE` |
| Isolation | None, shared checkout | One worktree per console |
| Produces | A document in `docs/` | N branches plus a synthesised branch |
| Merge does | Scores against criteria, recommends | Synthesises, notes what it took from where |
| Rounds | One | Up to five, gate-driven |
| Sessions | Discarded | Workers persist, architect re-seeds |
| Rough cost | ~60–80k tokens | ~900k tokens |
| Guard | The `wx` lockfile | Worktrees, lockfile underneath |

**The raw prompt goes to every slot unrewritten.** `prompt-library.ts` does exactly this —
`fill("USER_PROMPT_OPINION.md", { PROMPT: prompt })` — and the architect appears only on the return.
Pre-digesting through one model collapses the independent interpretation four models are being paid
to produce. A build fan is the opposite case: four agents given a loose sentence build four
unrelated things, so its payload is a compiled brief.

**Write access is a path scope, not a boolean** — `NONE`, `DOCS`, or `CODE`. `CLAUDE.md` makes
documents the deliverable, so an architect that cannot write cannot produce the artifact the
convention requires. Scope is a chip visible on every card without opening anything.

**The control between them is `promote`, not a toggle.** They are two objects, not two settings of
one: flipping a running build fan raises four questions with no good answers — uncommitted
worktrees, live sessions, a round counter mid-flight, and an input control that must swap from a
file path to a text box. A finished question fan's comparison is the *input* to a build fan, so the
button on a completed question fan opens a build fan with the same models and a brief seeded from
that comparison. The canvas shows the lineage.

### Acceptance is fixed before the answers

A fan's failure mode is rewarding persuasiveness ([ADR 0013](../adr/0013-acceptance-is-fixed-before-the-answers.md)).
Four answers compared against each other rank by how convincingly they read, and the articulate
wrong answer is the expensive one.

Fusion solves this for code in `cmd-build.ts`: a `VALIDATOR` writes an executable gate at a path the
harness dictates **before any work happens**; the gate runs first as a baseline and is *expected to
fail*; it is immutable during the loop; pass/fail is `ok = lastGate.code === 0` with **no model
judging anything**; on failure the gate's output feeds back verbatim as the correction; on the third
failure the validator may repair a defective gate once, free; the run halts after five.

That is where the round cap of five comes from, and it supersedes the old three. **It also replaces
an agent reviewing the synthesis** — round two's instruction is stdout from a failing script, not a
judgement, so the architect never grades its own work.

A question fan cannot have a gate; there is no exit code for "SQLite or Postgres". It gets the
weaker form: the architect writes a checklist of what a good answer must cover **before the answers
exist**, then scores each against criteria fixed in advance. Not an exit code, but reproducible
rather than impressionistic. The RED baseline transfers too — criteria the current state already
satisfies are bad criteria.

**The two fans do not have equal signal and the plan says so.** A build fan ranks by what compiles.
A question fan ranks by coverage of a checklist one model wrote, and remains exposed to four models
trained on overlapping data agreeing with each other, which reads like confirmation and is not
evidence. Its output is advisory and is presented that way.

### Isolation, not a mutex

Fusion's `writer-lease.ts` keys its lock to a hash of the canonical working directory, taken with
`fs.openSync(path, "wx", 0o600)`, with pid-based stale reclaim. It does not forbid parallel writing;
it forbids parallel writing *to the same path*. Fusion only ever needed that half because it never
gave its children separate checkouts.

So a harnessed build-fan console **gets its own worktree**
([ADR 0009](../adr/0009-a-harnessed-console-gets-its-own-worktree.md)), and the lease is kept
underneath for consoles that genuinely share a path. All four write at once, and a fan produces four
real diffs rather than four opinions. With one checkout and a mutex, a five-way fan can only ever
produce five opinions and one build — it structurally cannot answer "which model actually solved
it".

This largely retires the read-only enforcement apparatus as a safety mechanism, and it is what makes
the Hub overlap `/agent-loop`'s dispatch phase. It does **not** cover agent-loop's export or
re-entry: the file-disjoint split, type-overlap tracing, blocker ordering, the manifest and the
merge sequence stay there. A fan duplicates one brief across models; agent-loop divides one plan
across lanes.

### What fires, and what does not

**Armed relations fire themselves** ([ADR 0007](../adr/0007-armed-relations-fire-themselves.md)).
Drawing and arming is the standing consent — the graph is the authorisation — and Cockpit types the
payload into the target *and submits it*. A bare console is never typed into unattended, and a
console holding the write token is never auto-fired.

**Firing is automatic because it is reversible; landing is not.** A merge synthesises into its own
branch and writes a comparison note beside it ([ADR 0010](../adr/0010-a-merge-synthesises-into-its-own-branch.md));
merging into the branch the user ships from stays one deliberate click.

On the question fan plate this collapses to nothing at all: **`Enter` fires.** No arm ceremony, no
countdown, no held state, and `Stop` is an ordinary sidebar control. The criteria turn is sequencing
inside the run rather than a gate — it is tool-less, about two seconds and ~2k, and the ordering
guarantee holds because the architect genuinely wrote the checklist before anyone answered. A gate
nobody uses is worse than no gate: it trains you to click through the one time it mattered.

### Rounds

A round is one full cycle: fan fires → each worker commits to its branch → architect synthesises →
workers resume onto the synthesised branch and acknowledge. Up to five, gate-driven.

Workers persist across rounds; **the architect is exempt and re-seeds each round**
([ADR 0011](../adr/0011-fan-consoles-persist-across-rounds.md)). It is the only console that reads
all four diffs every round, so it carries twelve by round three while each worker carries three of
its own commits — and what it carries is diffs from rounds that have since been superseded, while
the branches those diffs came from sit on disk as current truth.

The checkout is the authority. Session memory is an accelerator, never a source of truth.

**A fan is per ticket.** `CLAUDE.md` requires one ticket per fresh context window, so persistence
holds across fix rounds within a ticket and ends at the ticket boundary. A five-ticket plan is five
sequential fans.

### The wire, still

Everything above is fan-shaped. The original one-to-one handoff survives unchanged underneath it.

**The wire is generic and persists.** Any console to any console, either direction. It is part of
the saved layout, not a one-time animation. **Wires are editable, and detaching one never touches a
process** — click to select, drag an endpoint to reroute or detach, `Del` to remove, `flip` to
reverse. This must be unmistakable: on a canvas, deleting a box usually destroys what is inside it.

**A return leg makes a Loop**, and the Loop is the Codex loop — `/codex-brief` out,
`/codex-review` back, `Fix round N` out again, all against one file. A Loop is derived, never
declared: detach a leg and the survivor demotes. Its legs are distinguished by form, never colour,
per `DESIGN.md`.

**The payload is a file, not scrollback.** `/codex-brief` compiles a plan into
`docs/briefs/YYYY-MM-DD-<topic>.md` — self-contained by design — so the wire carries a **path** and
the terminal-scraping problem never arises. A fanned brief is the one exception: each target writes
to its own result path, because N executors appending to one file concurrently is where the
shared-ledger idea breaks.

### Status, and zero footprint

**Status is reported, never inferred.**

| Tier | Covers | Source |
|---|---|---|
| 1 | Any command: start, end, exit code | Shell prompt markers, injected per console |
| 2 | An agent turn finishing; "it asked you something" | The agent reports itself — Claude `Stop` hook, Codex `notify` |
| 3 | Mid-run progress | Not built. Unknowable from outside, and unnecessary |

Tier 1 is blind to an agent finishing a turn: `claude` and `codex` are long-running foreground
REPLs, so the prompt does not return until the agent *exits*. That is what Tier 2 is for in
interactive mode, and what `message_end` replaces in harnessed mode. An idle-timeout heuristic was
considered and rejected: from outside, an agent thinking hard and an agent waiting look identical.

**Zero footprint.** Cockpit writes nothing to the machine. Shell setup is passed to each console at
launch and dies with the process. Inside a Cockpit console, `claude` and `codex` are shell functions
adding `--settings <cockpit-hook>` / `-c notify=...`; both flags are **additive** — verified against
the installed CLIs — so skills, `CLAUDE.md` and auth are untouched. Outside Cockpit the commands are
completely unchanged.

Harnessed codex runs additionally pass `--ephemeral`, so a question fan leaves no session rollout
behind either. **Step 12 cannot keep that**: a session with no rollout cannot be resumed, measured
2026-09-02 below. Rounds and the collaborate fan therefore buy resumability with codex's own session
files on disk — written by codex in its own directory, as it would outside Cockpit, but no longer
nothing.

### The surface

Phase 1 is a **layer-1 plate**, not the Hub ([D10](#decisions)). A question fan has no wires, no
handoffs and no spatial arrangement — four cards and a comparison panel that appear and disappear
together. The free canvas, pan/zoom, three card sizes and two-stage `Esc` are all wire and build-fan
machinery, and none of it is load-bearing for phase 1. What moves later is layout, not logic: the
harnessed console, the scope chips, `message_end` detection and the model bar are all card-level and
travel unchanged.

The plate carries an internal **docked sidebar** — an exception recorded in `DESIGN.md`, since a
plate is otherwise never docked. It holds fan controls, then the slot list, then the existing
`skills[]` registry **rendered unchanged**: one registry, two presentations, so adding a workflow
button stays a config edit against `docs/recipes/adding-a-skill-button.md`. The main column reads
causally: **ask → criteria → answers → comparison**.

**Slot colour is vendor identity only** ([ADR 0014](../adr/0014-slot-colour-is-vendor-identity-only.md)):
a 2px cap on the card, a 3px bar in the sidebar, keyed to vendor rather than slot so two Anthropic
slots share a hue and quota pressure reads at a glance. Effort stays achromatic in the `▮▮▮▯` glyph
run, because effort is ordinal and colour encodes ordinal badly. Status stays achromatic. Wires stay
achromatic.

**The Hub, when it arrives, is a full-screen free canvas** — a deliberate second spatial grammar
beside layer 1's 8px plate grid, recorded so it is a decision rather than a drift.

**Amended 2026-09-01.** The Hub's *surface* is separated from its *canvas* and comes first
([ADR 0018](../adr/0018-the-hub-is-a-surface-and-the-console-is-on-it.md), flight recorded in
[2026-09-01-hub-surface-flight.html](../mockups/2026-09-01-hub-surface-flight.html)). `hub` joins the
four existing plate surfaces, the fan graduates onto it, the door plate of step 14 is what you enter
through, and `ConsoleView` stops being a `position: fixed` overlay and becomes a plate on it —
otherwise phase 2 has to wire together a plate and a layer painted over the top of it. Step 13
shrinks to what remains: the free canvas, card sizes, focus mode and the status rail.

**Also amended 2026-09-01:** a slot is an answerer, not a coding agent restrained from writing
([ADR 0017](../adr/0017-a-fan-slot-is-an-answerer.md)). Read-only is enforced by removing write
tools rather than by plan mode, the fan may be pointed at a workspace or none, and no slot reads the
user's personal instruction file.

### Ruled out, and why

- **Headless child agents in an agent grid.** Fusion's own shape. Adopting it wholesale would put a
  second, non-interactive execution path beside the consoles, and the console's advantage is that a
  stuck agent can be answered. Harnessed mode takes the event stream without taking the grid.
- **A declared model stack in config.** Fusion's 2–5 YAML slots. A declared stack and a saved canvas
  hold the same information, and two places a fan can be defined will disagree. Presets instead;
  `executors` stays the defaults a new console starts from. Fusion's validation — exactly one
  architect, unique names, registered models — becomes canvas rules enforced as you draw, which
  reports the mistake at the moment you make it.
- **A toggle between fan kinds on a live fan.** See above; a picker at creation, conversion only
  while idle.
- **Colour for effort.** Ordinal data, wrong encoding, and a third colour system beside the vendor
  hues and the seven-hue cluster palette.
- **Gateway / "swappable brain".** While a gateway credential is active the Claude subscription is
  not used — it is replaced and billed per token. ChatGPT Plus/Pro grants no API access, so there is
  no subscription-backed credential to point at.
- **Copilot-backed proxies.** Self-described as reverse-engineered; the owner warns automated use
  can suspend Copilot access.
- **`cmd`.** Cannot emit prompt markers reliably.
- **Live cross-console state reads.** Handoff wants a clean artifact at a moment in time, not a live
  feed.

## Steps

### Phase 1 — the question fan plate

1. ~~**`node-pty` spawn + `xterm.js` render.**~~ **Done.** One console end to end: open, type, resize,
   close. Consoles die with the app; no orphan on Windows.
2. **Harnessed runner (main).** Launch a vendor CLI headless with its JSON stream, parse events, and
   emit a turn boundary on `message_end` with process exit as the buffer-flush fallback. Capture the
   session id, token counts and observed throughput from the stream. Kill-tree teardown, mirroring
   `skill-runner`. Mode lives beside the console record; the pty path is untouched.
3. **`fan` module (main).** Slot registry, fan lifecycle, and the run sequence: criteria turn →
   N workers in parallel → architect comparison after every worker is terminal and at least two
   produced a valid `message_end`. Process exit, quota exhaustion, and a malformed stream are
   terminal slot faults rather than reasons to wait forever. Event stream across the preload seam
   in `skill-runner`'s shape. Owns the kind, the scopes, the run id, and the fan's cumulative token
   count.
4. **Scopes, enforced by Cockpit rather than trusted to the agent.** `NONE` launches with the
   vendor's read-only mode. **`DOCS` is implemented by Cockpit writing the file** — the architect
   returns document text on its stream and the main process writes it to the target path under
   `docs/`, so no agent needs write tools and nothing has to be verified about what it might touch.
   `CODE` is phase 2 and needs a worktree.
5. **Slot configuration.** ~~Per-slot model and effort~~ **Done.** Per-slot model, effort and scope,
   defaulting from the existing `executors` block; a vendor field driving the hue. Validation as the
   fan is built: unique slot names, one architect, one criteria slot, 2–5 workers, a model the CLI
   will accept.
6. **The plate.** Sidebar — fan controls, slots, `<SkillsPlate />`'s registry reused — and the main
   column: ask box firing on `Enter`, criteria panel, slot cards with status glyph and model bar,
   architect panel stating its output path before it runs. `DESIGN.md` tokens throughout, the four
   slot hues among them. Built to `docs/mockups/2026-08-31-question-fan-plate.html`, as amended by
   `2026-08-31-criteria-gate.html` and `2026-08-31-slot-count.html`. Specifically:

   - **The run holds after criteria** ([ADR 0015](../adr/0015-the-question-fan-holds-for-a-human.md)).
     A held lifecycle state between `criteria` and `workers`, a `release` verb beside
     `enter` / `retry` / `stop`, and `Run workers` / `Redo criteria` on the criteria panel.
     `Redo criteria` is `retry` on the criteria slot and needs nothing new.
   - **Criteria are typed, drafted or skipped.** The panel starts empty and editable; `Draft criteria`
     hands it to the criteria slot. A fan that skipped says so in the document it produces. The
     architect never writes the criteria it grades against.
   - **Cards are live output views**, not excerpts. A finished card keeps its scrollback until the
     plate closes; the scrollback is not written to the architect's document, so closing discards it.
   - **Slots are edited on the card**, while idle only. Model and effort become controls in place and
     freeze the moment a run starts; the architect panel gets the same treatment. No mid-run retune,
     which would also require `retry` to accept a changed config.
   - **Slot count is 2–5, adjusted on the row.** A dashed `+ add slot` ghost follows the last card and
     is absent at five; a card-header `×` is absent at two. The limits show as controls appearing and
     vanishing rather than as the validation error. Cards are fixed at 248px in a centred wrapping
     row, replacing `repeat(4,1fr)`.
   - **The arrangement persists on its own.** No explicit save; reopening Cockpit restores what you
     last built.
7. ~~**Presets.**~~ **Dropped**, not deferred. Step 6's persistent arrangement already delivers
   "pick up where I left off"; presets solve the different problem of switching between several
   named arrangements, which is not a need that has appeared. Adding them would also put a third
   claimant beside the arrangement and `executors` on "where a fan is defined", which this plan
   already rejected once when it ruled out a declared model stack in config. The signal to add them
   is concrete: the first time an arrangement has to be rebuilt back to something used previously.
8. **`Promote to build`.** Present and disabled in phase 1, with the reason stated on hover. It is
   the seam phase 2 opens. **Deferred** — the button exists in the mockup; the hover string is the
   only open decision and it can be settled when phase 2 is briefed.

### Phase 2 — the build fan and the Hub

Designed, not built. Every decision below is recorded; none of it is coded.

9. **Worktrees.** One per harnessed build-fan console: create on open, track, prune on close,
   reconcile orphans left by a crash. Fusion's `wx` lease underneath for same-path consoles.
10. **The acceptance gate.** A validator writes an executable gate before any work; RED baseline
    check; immutable during the loop; pass/fail by exit code; failure output fed back verbatim; one
    free gate repair on the third failure; halt at five.
11. **Synthesis and adoption.** Architect reads N diffs in its own worktree, writes its branch plus
    the comparison note. `Adopt` merges one branch into the working branch — the only manual git
    write in the system.
12. **Rounds and sync.** **Gates the collaborate fan** — see step 20 and
    [ADR 0016](../adr/0016-collaboration-is-a-skill-until-sessions-resume.md); nothing DAG-shaped is
    buildable until a slot can take a second turn on its own session.
    Workers resume with sessions intact, worktrees reset onto the synthesised
    branch, acknowledgement required with no tool calls; a console that fails to acknowledge is
    marked failed and sits out the next round. Architect re-seeds. Uncommitted worktree work is
    committed to its own branch before any reset, or the reset refuses.
13. **The Hub surface.** Full-screen free canvas with pan, zoom and `Esc` return. Cards placed
    freely; strip / card / focus, focus taking the keyboard; two-stage `Esc` plus an explicit release
    control. Layout, view and card sizes persisted. Status rail. The plate graduates onto it.
14. **Canvas door plate.** Layer-1 plate: console count and a click into the Hub, reading the same
    event stream.
15. **Shell integration.** Per-console prompt markers for PowerShell and Git Bash: cwd, and command
    start/end/exit code. Tier 1 status and live cwd fall out of it.
16. **Process-tree labelling.** Per-console timer identifying the running program, torn down with
    the console.
17. **Wires and Loops.** Drag to connect; bowed routing; persisted with the layout; select, reroute,
    detach, `Del`, `flip`. Firing types the brief line into the target. An opposed pair braces into a
    Loop with a `LOOP · ROUND n / 5` badge, legs distinguished by form.
18. **Tier 2 turn reporting.** A notifier in Cockpit; scoped `claude` / `codex` functions adding
    `--settings` / `-c notify=`, with a startup check that both flags still exist.
19. **Auto-forward.** Per-wire toggle, off by default, capped at five rounds, with the pending
    payload visible and the write-console block.
20. **The collaborate fan.** A third fan kind, after step 12 and not before
    ([ADR 0016](../adr/0016-collaboration-is-a-skill-until-sessions-resume.md)). Every slot plans
    independently and read-only; the architect merges the proposals into one validated dependency
    DAG; tasks execute on readiness, a slot owning several and running them one at a time on its
    session; one final architect integration turn. Remaining work once step 12 lands: the multi-task
    slot model (`FanState` currently holds one attempt and one outcome per slot), proposal merge with
    cycle and reachability checks, the `● ◌ ○ ✓` board, and Fusion's ACK context sync.
    **Until then it is a skill button**, not a fan — one harnessed agent running the whole graph
    through its own child agents, per `docs/recipes/adding-a-skill-button.md`. That interim costs one
    config line and no code, and gives up per-task cards, per-task scope, split token accounting and
    any use of a second vendor.

## Decisions

Eight ADRs came out of the `/grill-with-docs` session on 2026-08-31.

| | Decision | Recorded |
|---|---|---|
| D1 | Armed relations fire themselves; a write-token console never does | [0007](../adr/0007-armed-relations-fire-themselves.md) |
| D2 | A console has a mode — interactive or harnessed | [0008](../adr/0008-consoles-have-a-mode.md) |
| D3 | No stack config; canvas arrangements save as presets | — |
| D4 | One worktree per harnessed console; the lease kept underneath | [0009](../adr/0009-a-harnessed-console-gets-its-own-worktree.md) |
| D5 | A merge synthesises into its own branch; adoption is manual | [0010](../adr/0010-a-merge-synthesises-into-its-own-branch.md) |
| D6 | Workers persist across rounds; the architect re-seeds | [0011](../adr/0011-fan-consoles-persist-across-rounds.md) |
| D7 | Two fan kinds; three write scopes | [0012](../adr/0012-two-kinds-of-fan.md) |
| D8 | Acceptance fixed before the answers | [0013](../adr/0013-acceptance-is-fixed-before-the-answers.md) |
| D9 | Round cap five, one free round on gate repair | [0013](../adr/0013-acceptance-is-fixed-before-the-answers.md) |
| D10 | The question fan ships first, as a plate | — |
| D11 | Slot colour is vendor identity only | [0014](../adr/0014-slot-colour-is-vendor-identity-only.md) |

`DESIGN.md` carries three amendments from these: the slot-colour exception with its bounds, the fan
plate's docked sidebar, and `LOOP · ROUND n / 5` replacing the old cap of three.

### Owed before phase 2 starts

- **Read-only and session-resume flags — verified 2026-09-02.** See
  [the measurement below](#read-only-and-session-resume-measured-2026-09-02). Two of three vendors
  resume cleanly and hold read-only; **agy holds neither restraint and cannot be a read-only
  worker**, which is a constraint on the build fan's shape rather than a defect to fix.
- **The slot hex values are approximations** and must be checked against each vendor's published
  palette.
- **The cost figures are estimates**, not measurements. Instrument a real fan before trusting them.

### Read-only and session resume, measured 2026-09-02

Measured against the installed CLIs — claude 2.1.258, codex-cli 0.151.0, agy 1.1.23 — by spawning
each vendor with the runner's own argv against a scratch workspace, asking it to write a file, and
reading the filesystem afterwards rather than trusting the agent's own report. Resume was measured
by telling turn one a random codeword and asking turn two to repeat it.

| Vendor | Read-only | Resume by id |
|---|---|---|
| claude | **holds** | **holds** — `--session-id <uuid>` then `--resume <uuid>` |
| codex | **holds, but only with `approval_policy="never"`** | **holds, but only without `--ephemeral`** |
| agy | **does not hold, by any means available** | holds — `--conversation <id>` |

**claude.** `--restricted` plus the tool lists refused the write with `permission_denials` empty and
answered `BLOCKED` honestly. Its documented behaviour is the property this section asks for: it
refuses `bypassPermissions` and ignores user, project and local settings files, so the restraint is
not reachable from inside the session.

**codex — the finding that changed the code.** `--sandbox read-only` on its own does **not** hold.
The default approval policy reads a sandbox denial as a request to escalate, so the same PowerShell
write was denied and then allowed on the immediate retry, and the built-in patch tool wrote without
consulting the sandbox at all. The sandbox mechanism itself is sound — `codex sandbox powershell
-Command "Set-Content …"` is denied while the identical command outside the wrapper succeeds — so
the gap was the policy, not the jail. Adding `-c approval_policy="never"` closes both paths:
`patch rejected: writing is blocked by read-only sandbox; rejected by user approval settings`, no
file on disk, even when the prompt explicitly invites a shell fallback. Now carried in
`CODEX_READ_ONLY_ARGS` (`src/main/modules/harness/_internal/runner.ts`) with the argv asserted in
`runner.test.ts`.

**codex resume conflicts with `--ephemeral`, which the runner passes today.** With it, resume fails
`no rollout found for thread id`; without it, the codeword comes back. `--ephemeral` is what makes
the "zero footprint" claim in §Status true, so **step 12 requires trading that footprint for
resumability** — a decision, not a fix. Note also that `codex exec resume` accepts neither
`--sandbox` nor `--cd`, so read-only has to be re-asserted through `-c` on every resumed turn.

**agy cannot be restrained per invocation.** `--sandbox` is terminal restrictions, not a read-only
mode: `write_to_file` was refused but `run_command` wrote the file through PowerShell. `--mode plan`
does not block it either — it wrote the file while calling it a plan. What actually governs the
behaviour is `toolPermission` in `~/.gemini/antigravity-cli/settings.json`, currently
`always-proceed`, and there is no flag to pin it for one run. A settings file an agy worker's own
shell could edit is the exact opposite of a restraint it cannot lift, so agy fails this requirement
by construction, not by configuration. **A build-fan slot that must be read-only cannot run on agy**
— it stays usable for the question fan, where Cockpit performs every write itself.

## Risks

- **A question fan buys the weaker signal.** It ranks answers by how well they read; only a build fan
  ranks by what compiles. The criteria checklist is the mitigation and it is a weak one. Present the
  output as advisory.
- **Consensus theatre.** Four frontier models trained on overlapping data agreeing is not evidence,
  and it reads like confirmation. A build fan is immune — four passing test suites are four passing
  test suites — and a question fan is fully exposed.
- **Five consoles is five quotas.** A fan spends every subscription it touches on the same problem
  and discards most of the answers by design. Fan deliberately, not by default.
- **Four Claude slots drain one subscription four times.** Nothing in the design enforces vendor
  diversity, and the 5-hour windows are the real ceiling rather than any token count. Spreading a fan
  across Anthropic, OpenAI and AGY spreads the pressure across separately-paid quotas.
- **A console can run out mid-fan.** One lane can go dark while three keep going. Cockpit waits until
  every lane is terminal, allows an explicitly partial advisory comparison with at least two valid
  answers, and blocks comparison below two. Quota never retries automatically; retry reruns only the
  failed lane and then supersedes the partial comparison.
- **A harnessed console cannot ask a question.** Under-specification becomes failure rather than
  conversation, which raises the stakes on every brief.
- **Concurrent writes if the read-only flags are wrong.** The worst failure in this plan and the one
  that is silent. The startup check must fail loud and closed.
- **Worktree lifecycle is new surface area** and the largest cost of D4. A crash leaves worktrees git
  still tracks.
- **A synthesis may combine code never tested together.** The note must say what was combined, and
  the synthesised branch is not privileged until it has been run.
- **Two carriers of state can disagree.** An agent may remember a decision the merge overruled; the
  worktree wins, and the resume message names the branch rather than describing the change.
- **Orphaned processes.** A console outliving the window is invisible and keeps working. Reuse
  `skill-runner`'s `taskkill /t /f`.
- **Shell integration is best-effort.** Launch `claude` by full path and the scoped function is
  bypassed, degrading Tier 2 to Tier 1 *without announcing it*.
- **CLI flags are a moving target.** `--settings` and `-c` were verified once. The startup check
  exists to make a rename loud rather than silent.
- **Interactive Codex is not bound by `/codex-run`'s flags.** "Codex never touches git" becomes a rule
  it follows because `AGENTS.md` says so. Accepted knowingly.
- **The Hub could become a place to admire.** Opened at the start of a session it launches the work,
  or it has failed.

## Checks to run

### Phase 1

- Fan a real question at four slots; confirm all four receive the **same text verbatim**, with no
  rewriting anywhere between the box and the CLI.
- Confirm the criteria turn runs **before** any worker starts, makes no tool calls, and costs on the
  order of 2k.
- Confirm the architect's document is written by Cockpit, not by the agent, and that the path is
  under `docs/` and was displayed before the run started.
- Point a worker at a file write; confirm the CLI refuses it and confirm the agent cannot lift the
  restriction when asked to.
- Press `Enter` with an empty ask; confirm nothing is spent.
- Press `Stop` mid-run; confirm every slot is killed with its process tree and the partial spend is
  reported honestly.
- Kill a slot's process externally; confirm the fan reports it rather than hanging on a merge that
  will never fire.
- Exhaust quota and corrupt one worker stream in separate runs; confirm each slot fails with a
  specific label, three valid answers produce a partial advisory comparison, and one valid answer
  cannot produce a comparison.
- Retry a failed worker; confirm completed workers do not run or spend again and the new comparison
  supersedes the partial one. Fail the architect; confirm its retry reuses the fixed criteria and
  retained answers and no partial document appears at the promised path.
- Stop, close, and shut down during separate live runs; confirm pending process trees die, completed
  output survives, and late events from the old run id cannot change the restarted run.
- Restore a stale run after a simulated crash; confirm it opens `INTERRUPTED`, does not assume any
  saved pid is live, and can only restart as a new run.
- Read the model bar against the stream: throughput and token counts must come from the stream, never
  be estimated.
- Confirm the sidebar's skills section is the same `skills[]` registry as the skills plate — add a
  button in config and confirm it appears in both.
- Confirm slot hues key to vendor, that two Anthropic slots share one, and that no hue appears on
  status, effort, or anything outside the fan surface.
- Save a preset, restart Cockpit, reload it; slots, models and efforts all return.

### Phase 2

- Open four build-fan consoles; confirm four worktrees exist, all four write simultaneously, and no
  console touches another's checkout.
- Run the gate before any work; confirm it fails RED and warns if it passes.
- Force three gate failures; confirm the free gate repair happens once and does not consume a round.
- Push to round six; confirm it refuses and hands back with the branches intact.
- Confirm the round-two instruction is the gate's stdout verbatim, not a model's summary of it.
- Resume a worker; confirm its session carried and its worktree is on the synthesised branch. Break
  the resume flag; confirm it says so rather than silently starting fresh.
- Leave uncommitted work in a worker's worktree at merge time; confirm the reset commits it or
  refuses, and never discards it.
- Adopt a branch; confirm it is the only git write Cockpit made to the working branch all session.
- Crash the app mid-fan; confirm orphaned worktrees are found and offered for pruning on restart.
- Round-trip a real brief through a wire: Claude writes it, the wire fires, Codex fills Test evidence
  and Deviations, `/codex-review` reads it back.
- Draw A→B then B→A; confirm the pair braces into a Loop and the badge reads `n / 5`. Detach one leg;
  confirm the survivor demotes cleanly.
- Detach a wire mid-run; confirm both consoles keep running and only the connection disappears.
- Run `claude` in Windows Terminal; confirm it launches completely unmodified. Grep `~/.claude` and
  `~/.codex` after a full session: no Cockpit-written entries anywhere.
- Kill the app with consoles running; confirm no orphan `pwsh`, `bash`, `claude` or `codex`.

## Changelog

### 2026-09-04 — the Console Recipe becomes an orchestrated terminal fan

A `/grill-with-docs` session, prompted by wanting the Synthesize surface's shape (Orchestrator on
top, worker grid below) for real terminals instead of harnessed slot streams. Reverses
[ADR 0028](../adr/0028-console-means-interactive-pty.md) deliberately rather than by drift —
recorded in [ADR 0050](../adr/0050-console-becomes-an-orchestrated-terminal-fan.md) and
[ADR 0051](../adr/0051-terminal-dependencies-are-cockpit-sequenced.md), mockup at
[2026-09-04-console-fan.html](../mockups/2026-09-04-console-fan.html).

- **Terminals stay independent of the Stack.** No vendor, model, or effort — a terminal is a shell,
  not an agent, per the `consoles` module's own doctrine. The lineup is fixed and manual (you
  add/drop terminals yourself, capped at six for grid readability, not cost — LLM workers cap at
  five for the opposite reason).
- **Delegation is conversational, not buttons.** The Orchestrator drafts a plan naming each
  terminal's launch command and task, and holds for a "go"/"yes" reply before typing anything in.
  `./goal <text>` plans and releases in one turn without skipping the shown plan — a fast path, not
  a silent one.
- **The Orchestrator picks what launches in each terminal** (bare shell, `claude`, `codex`, `agy`)
  as part of the plan, not a per-card preset you configure in advance.
- **Dependencies are Cockpit-sequenced, never terminal-watched.** A dependent terminal's task stays
  un-typed until what it depends on reports done, and the handoff is a file path the producer was
  told to write to — never scraped scrollback, matching the wire's existing rule.
- **Completion has two honest strengths.** Claude's `Stop` hook and Codex's `notify` are structural
  guarantees; agy and bare-shell terminals get a cooperative sentinel line instead, shown
  differently because it depends on the agent's compliance, not the CLI's architecture. A stuck
  wait can always be released by manually marking a terminal done.
- **This replaces the old single-terminal Console view**, not adds beside it. One terminal with no
  plan is this same surface with one card.
- **Scope stays narrow.** A terminal's task may itself be "invoke another Recipe" (runs as a
  background sub-run, compact status on the card, Hub stage stays put) — this does not extend to
  making the terminal a general launcher for the other six Recipes.
- **Still open, not blocking:** Tier-2 turn reporting (step 18) is a real prerequisite for the
  claude/codex completion signal and remains "designed, not built" as of this entry. The structured
  `dependsOn` shape on a delegation assignment is an implementation detail for the ticket that
  builds this, not decided here.

### 2026-09-02 — the phase 2 read-only and resume gate, measured

Closed the first of the three items owed before phase 2 by running each CLI rather than reading its
help text. Results and method in
[Read-only and session resume](#read-only-and-session-resume-measured-2026-09-02).

Three things came out of it that the plan did not previously know:

1. **`--sandbox read-only` did not hold for codex**, because the default approval policy escalated
   past a denial and retried the write outside the sandbox. Fixed in `runner.ts` by pinning
   `approval_policy="never"`; verified against the real CLI, with the argv asserted in
   `runner.test.ts`. This was a live gap in the shipped question fan, not only a phase 2 concern.
2. **`--ephemeral` makes codex sessions unresumable**, so step 12 has to trade the zero-footprint
   claim for resumability. Recorded as a decision still owed, not silently resolved.
3. **agy cannot hold a read-only restraint at all**, so a read-only build-fan slot cannot run on it.
   That bounds phase 2's vendor set rather than adding work to it.

The other two owed items — slot hex values against published palettes, and cost figures against a
real instrumented fan — remain open. Phase 2 stays unticketed.

### 2026-09-01 — staged migration to explicit Recipes

The current single orchestrated fan remains usable while the new runtime is built beside it. Shared
foundations land first: Vendor Adapters, Run Records, Run Snapshots, Sessions, and the Workspace
lease. Recipes then arrive in increasing complexity: Direct, Explore, Synthesize, Debate, Validate,
and Coordinate. The saved arrangement migrates automatically: the existing orchestrator becomes
Orchestrator, the first worker becomes Primary, and remaining workers become Contributors.

There is no user-facing Legacy Recipe. Cutover waits for Direct, Explore, and Synthesize to pass
tests, build, screenshot review, and live Claude Code, Codex, and AGY probes. The old one-flow
machine is removed only after its saved runs remain readable through the new Run Record model.

### 2026-08-31 — S6 grilled: the criteria gate, editable cards, and presets dropped

A second `/grill-with-docs` session, against the decided plate mockup and `disler/fusion-harness`.
Phase 1 is now steps 1–6; step 7 is dropped and step 8 deferred.

- **The run holds after criteria** ([ADR 0015](../adr/0015-the-question-fan-holds-for-a-human.md)).
  The mockup argued no gate was needed because criteria precede any answer. True, and it answers
  tampering rather than spend: bad criteria previously cost four worker turns to discover.
  fusion-harness solves the same problem with a RED baseline run on an executable gate, which does
  not transfer to prose criteria. Drawn in `docs/mockups/2026-08-31-criteria-gate.html`.
- **Criteria may be typed, drafted or skipped.** Writing them yourself *before* a run satisfies
  ADR 0013 completely; only editing a draft after seeing it does not. A skipped fan says so in its
  document.
- **The architect does not write the criteria.** The mockup said it did; the code has always used a
  dedicated criteria slot. The mockup was wrong and is corrected.
- **Cards are live output views with scrollback**, kept until the plate closes and never appended to
  the architect's document.
- **Slots are edited on the card while idle**, not in the 172px sidebar and not on a second screen.
  No mid-run retune.
- **2–5 slots, adjusted on the row.** Ghost card adds, card-header `×` removes; the limits are shown
  by controls vanishing. Cards fixed at 248px in a centred wrapping row.
  Drawn in `docs/mockups/2026-08-31-slot-count.html`.
- **The working arrangement persists on its own**, and **presets are dropped** as a result.
- **Fixed while checking the above:** `enter` asserted that `validateConfig` "already guarantees
  exactly one criteria slot" when it checked nothing of the sort — zero died mid-launch with an
  internal error and two was silently ignored. Now validated, with tests.
- **Console `Clear` built, and scoped down to what is honest.** The ask was "clear the context of all
  terminals, like `/clear`". Cockpit cannot do that: a console is a shell, not an agent, and the
  module *"neither knows about nor treats specially"* whatever runs inside it, so typing `/clear` into
  every pty would be `command not found` in a bare shell and arbitrary keystrokes into whatever else
  is running. `Ctrl+L` already clears the shell's own screen, since keystrokes reach the pty verbatim.
  What neither reaches is the emulator's scrollback, so that is what the control clears — no keystroke
  is sent and nothing running in the shell sees anything happen. There is one console today
  (`App.tsx` holds a single `<ConsoleView />`), so "all" arrives with the Hub at step 13; the call is
  per-terminal either way. The version originally asked for — send `/clear` only to consoles actually
  running Claude — becomes buildable at step 16, where process-tree labelling supplies the missing
  knowledge.
- **Collaboration resolved** ([ADR 0016](../adr/0016-collaboration-is-a-skill-until-sessions-resume.md)).
  A `/fh-collaborate`-style dependency DAG is a legitimate third fan kind; ADR 0012 forbids
  *converting* a live fan between kinds, not having a third, and the earlier reading of it here was
  wrong. It is blocked outright by session resume — the harness captures `sessionId` and never passes
  it back, so a slot cannot take a second turn — which step 12 already owes phase 2 regardless. Until
  then it is a skill button and no Cockpit code. Added as step 20.

### 2026-08-31 — restructured around fans

A `/grill-with-docs` session against `disler/fusion-harness` produced eleven decisions and eight
ADRs, and split the plan into two phases.

- **The plan's centre moved from handoff to fan-out.** One-to-one wires remain; one-to-many and
  many-to-one are now the primary operations, and they are the reason the Hub exists.
- **Harnessed mode adopted** after reading `child-runner.ts`. Fusion detects a turn ending via
  `message_end` on a JSON stream, which a pty structurally cannot provide. The earlier blanket
  rejection of headless children was too broad — it protected the console the user drives by also
  crippling the four they do not. This also revived the model bar, previously rejected as
  unobservable.
- **Worktrees replaced the single-writer token** after reading `writer-lease.ts`, whose lock keys to
  the canonical CWD and explicitly permits concurrent work in different checkouts. With one checkout
  and a mutex a five-way fan can only produce opinions. Fusion's lease is kept underneath.
- **The round cap moved from three to five** with one free round on gate repair, after reading
  `cmd-build.ts`. The gate also replaced an agent reviewing the synthesis: round two's instruction is
  a failing script's stdout, so the architect never grades its own work.
- **The architect was exempted from session persistence** on a cost estimate — it is the only console
  reading all four diffs every round, reaching ~165k by round three, and what it carries is
  superseded diffs while the branches sit on disk as truth.
- **Two fan kinds and three write scopes** replaced a single fan and a write boolean, after the
  observation that `CLAUDE.md` makes documents the deliverable and a write-less architect cannot
  produce them. `promote` replaced a mode toggle: the fans are sequential, not interchangeable.
- **`DOCS` scope is implemented by Cockpit writing the file**, not by granting an agent write tools.
  Nothing has to be verified about what the agent might touch.
- **Phase 1 was cut to a plate.** A question fan has no wires and no spatial arrangement, so the free
  canvas is build-fan machinery. What moves later is layout, not logic.
- **The arm ceremony was removed entirely.** A timed hold and a countdown were designed, previewed
  and cut: `Enter` fires. The criteria turn stayed as sequencing rather than a gate, on the grounds
  that a gate nobody uses trains you to click through the one time it mattered.
- **Slot colour admitted as a bounded exception** to the achromatic shell, keyed to vendor rather
  than slot. Effort stayed achromatic because it is ordinal.
- Design promoted to `docs/mockups/2026-08-31-question-fan-plate.html`; `DESIGN.md` amended in three
  places.
- Confirmed against `docs/research/2026-08-27-claude-code-model-harness.md` that harnessed mode
  spends existing subscriptions: it runs the vendor CLI with the machine's own login, and it is the
  gateway *credential* that replaces a subscription, not the CLI.

### 2026-08-27
- **Step 1 built and verified live.** `node-pty` + `xterm.js`, a `consoles` module in main mirroring
  `skill-runner`'s registry shape, the console half of the preload seam, and a `console-view`
  renderer module. Verified in the running app: a real `powershell.exe` under Electron, and no orphan
  after either a graceful quit or a force-kill.
- The native-module ABI risk was **retired rather than mitigated** — node-pty 1.1.0 ships N-API
  prebuilds, ABI-stable across Node and Electron, so no `electron-rebuild` step is needed.
- Plan created from a `/grill-with-docs` session with `/ui-preview`.
- `/research` established that no gateway spends an existing subscription inside Claude Code; the
  "swappable brain" was dropped and the harness became the executor handoff.
- Tier 2 turn reporting replaced an idle-timeout heuristic after the user rejected guessing; scoping
  it via `--settings` / `-c` preserved the zero-footprint decision.
- Free-canvas Hub decided in `/ui-preview`: pan/zoom, three card sizes, focus mode owning the
  keyboard, two-stage `Esc`.
- Wire editing added (select, reroute, detach, flip) with the rule that detaching never touches a
  process.
- **Return leg promoted to a feature**: an opposed wire pair is a Loop, mapping onto `/codex-brief` →
  `/codex-review` → Fix round N against one file.
- Legs distinguished by form rather than colour, per the achromatic shell rule.
- Five-state extension **approved by the user**; `DONE` and `EXIT n` moved from owed to decided.
