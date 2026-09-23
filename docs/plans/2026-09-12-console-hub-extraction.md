---
title: Extract Console Hub into an independent application
date: 2026-09-12
status: In Progress
summary: Move the complete Console Hub into its own repository and leave Cockpit with a launch-only seam.
spec:
---

## Goal

Create an independently installable Console Hub at `C:\FIles\Console-Hub`, preserve the current
Hub experience and durable state, let Cockpit launch or focus it with an optional Workspace, then
remove every embedded Hub runtime and surface from Cockpit.

The split is complete only when Console Hub runs without Cockpit, survives Cockpit shutdown, and
Cockpit knows nothing beyond the `consolehub://` launch contract.

## Approach

### Product destination

The user identified [Fusion Hub](https://github.com/disler/fusion-harness) as Console Hub's
feature target on 2026-09-12. Its documented workflows map to Explore (independent opinions),
Synthesize (fusion and acknowledged context synchronization), Debate, Coordinate (dependency-driven
collaboration), Direct, and Validate (gate-first build loops). Supporting capabilities include model
and reasoning selection, effective-instruction inspection, persistent per-slot sessions with reset,
streaming output, telemetry, inspectable run artifacts, and enforced writer exclusion.

This is the destination beyond extraction. Existing Recipe declarations are not proof of feature
completion. After extraction, audit each target against runtime evidence and create a gap roadmap
in Console Hub's repository. Retain the agreed Electron app, Console, and Mission capabilities.

Fusion Hub uses Pi and serializes writers in a shared checkout. Adopting its features does not
settle replacing Console Hub's vendor CLIs, isolated worktrees, or explicit Apply Result policy.
Those remain the accepted design unless deliberately revisited. The extraction milestone continues
to preserve existing behavior, with feature completion following in the independent repository.

### Confirmed user interaction

The Orchestrator and workers handle planning, delegation, dependency tracking, progress checks,
validation, and final review within the approved work. The user primarily reviews the resulting
output and evidence and explicitly decides whether to Apply Result. Routine checks must not require
the user to manage workers or relay their results.

Failures remain an explicit human decision point: report the failure and evidence, preserve completed
and partial work, recommend recovery, and wait for approval before retrying or taking corrective
action. Independent work may continue while dependants remain held. The proposed automatic retry
policy was rejected. Material changes to scope or permissions and unresolved product decisions also
return to the user. This confirms the report-first rule in the existing Mission workflow.

### Current implementation scope

The current Hub is not one removable module. Verified inspection shows it spans:

- renderer modules `hub-shell`, `recipe-selection`, `live-stack`, `question-fan-plate`,
  `orchestrator-terminal`, `console-view`, and `console-orchestrator`;
- main-process modules `consoles`, `console-conversation`, `fan`, `fan-arrangement`, `fan-runtime`,
  `harness`, `orchestrator-conversation`, `turn-signal`, and `workspace-tree`;
- preload IPC, shared Fan, Console, Mission, Recipe, conversation, harness, skill-name, and Workspace
  types; and
- Cockpit configuration, Electron storage, run records, design assets, scripts, tests, and shutdown
  hooks.

Use a parity-first extraction rather than redesigning while moving the seam.

- **D1**: Console Hub is a sibling product with its own repository, build, installer, executable,
  storage, and releases.
- **D2**: It owns Explorer, Live Stack, all seven Recipes, Console, and Mission.
- **D3**: Cockpit retains launch affordances only. It exposes no Hub state, controls, monitoring, or
  embedded fallback.
- **D4**: Cockpit invokes a versioned `consolehub://` protocol with an optional encoded Workspace.
- **D4a**: A project launch handoff starts Console Hub's configured default agent after its Workspace
  is accepted. Cockpit passes the project and does not choose or launch the agent. Opening Console
  Hub without a project handoff does not start an agent.
- **D4b**: A project handoff for a Workspace with an open agent session focuses that session after
  the Workspace is active.
  If several agent sessions are open there, it focuses the most recently active one. Console Hub
  starts its configured default agent only when that Workspace has no open agent session.
- **D4c**: The default launch agent is a Console Hub-wide setting with a selectable Vendor, model,
  and effort. During extraction it is editable in Hub-owned configuration; a settings screen follows
  after the standalone parity gate. Claude is only its initial Vendor. Cockpit passes no Vendor or
  model, and the launch path does not hardcode a model or assume one provider.
- **D4d**: If that saved Vendor or model is unavailable when a new session would start, Console Hub
  shows the reason and lets the user choose another. It does not silently substitute an agent or
  open a session until the user makes a valid choice. An existing session is still focused under D4b.
- **D4e**: Editing the default launch agent affects future sessions only. An open session retains
  the Vendor, model, and effort it started with.
- **D4f**: Choosing an alternative because the saved default is unavailable applies to that new
  session only. The Hub-wide default changes only through an explicit configuration edit during
  extraction or an explicit save in Console Hub settings afterward.
- **D4g, post-extraction**: Console Hub settings provide a Vendor-specific model list that the user
  can extend, as well as the default launch agent selection. Adding a model to the list does not
  silently make it the default or change an open session.
- **D4h, post-extraction**: Add model accepts a manually entered model ID for a supported Vendor
  even when discovery does not list it. The list records a launch choice, not proof of account
  access; the Vendor's installed client and its authentication remain authoritative when used.
- **D4i, post-extraction**: Console availability and Mission availability are separate. Adding a
  model can make it a Console choice, but it does not make it a Mission choice until the controlled
  Mission runner's access to that model is verified. Hub settings show these two statuses separately.
- **D4j**: The launch seam and Hub-owned default configuration remain Vendor and model independent
  during extraction. The settings screen, manual model addition, and Mission eligibility checks
  are the first feature milestone after the standalone parity gate passes.
- **D4k, post-extraction**: Mission access verification runs only on an explicit Test Mission access
  action. It sends a small real request through the controlled runner, consumes the selected
  account's usage, and records the result and time. Success makes that model eligible for Missions;
  failure shows the reason and leaves it ineligible. No background test spends usage.
- **D4l, post-extraction**: If a previously verified model later fails a Mission turn because access
  was lost, mark it unavailable for new Mission selection, report the cause, and fail the affected
  lane without a silent substitute. Preserve completed lanes, the failed lane's worktree, brief,
  partial output, progress, and evidence so the user can read what happened and direct recovery.
  Require a new successful access check before selecting that model again.
- **D4m, post-extraction**: Picking up an access-failed lane is a user-released new attempt in the
  same saved worktree and Run Snapshot. Give the new worker the original brief and the previous
  attempt's partial output, progress, and evidence as context. Keep both attempts inspectable and
  repeat the lane's full validation. Do not claim to resume the dead worker process or silently
  restart it.
- **D4n, post-extraction**: If the original model remains unavailable, the user may explicitly
  choose another Mission-verified Vendor and model for the new attempt. Preserve the original
  assignment and record the Vendor, model, and effort used by each attempt. Do not silently change
  the model of a released Mission lane.
- **D4o, post-extraction**: Each supported Vendor's own CLI handles subscription sign-in and stores
  its credentials. Console Hub settings show that CLI's sign-in status and open its native login
  flow; Console Hub does not copy or store subscription credentials. Controlled Mission runner
  access remains a separate check and is never inferred from CLI sign-in alone.
- **D4p, post-extraction**: Test Mission access uses the same controlled runner and account path as
  an actual Mission. When Hub can detect that this runner account signed out or changed, clear its
  successful model checks and require a new explicit test. Keep the saved model IDs. If an account
  change is not detectable, a real Mission access failure follows D4l.
- **D4q, revised 2026-09-22**: Remove the Hub billing-route classifier and its paid/unknown
  holds. Console, Recipe, Orchestrator, and Skill launches use each Vendor's configured CLI and
  its own subscription sign-in. Clear inherited API-key and alternate-provider environment
  overrides from Hub-initiated agent processes. The Vendor CLI reports its own authentication,
  access, and usage errors. This replaces the former D4q–D4x billing-gate decisions.
- **D4r, revised 2026-09-22**: The controlled Mission runner is separate from those Vendor CLIs.
  Keep Mission release unavailable until its runner can use a confirmed subscription account
  path. Do not route a Mission through Pi's API provider merely because a Vendor CLI is signed in.
- **D5**: A running Console Hub instance is focused. A different incoming Workspace waits for
  explicit acceptance and never interrupts active work.
- **D5a**: If a Mission is running in the current Workspace, a project handoff for another Workspace
  remains pending until that Mission is Applied or Rejected and its cleanup completes. A stopped
  Mission still holds worktrees and evidence, so Stop alone does not release the handoff. Console
  Hub then asks whether to switch. The incoming handoff never stops the Mission or switches Workspace
  on its own.
- **D5b**: An ordinary agent turn in another Workspace does not hold a project handoff. After the
  user accepts the new Workspace, Console Hub opens or focuses its agent session while the existing
  turn continues in its original terminal and folder.
- **D6**: Console Hub alone owns its installation and updates.
- **D7**: The new repository starts fresh, with one migration commit and a pointer to the source
  Cockpit commit rather than filtered Cockpit history.
- **D8**: The current visual system is copied and independently owned under the Console Hub identity;
  Cockpit branding is removed.
- **D9**: Durable Hub state is imported once by copy. Live Consoles and agent Sessions start closed.
- **D10**: Cockpit legacy state remains untouched and is never deleted automatically.
- **D11**: Hub-specific active documentation moves to Console Hub. Cockpit retains historical records
  and [ADR 0056](../adr/0056-console-hub-is-an-independent-application.md) as the ownership pointer.
- **D12**: No workflow or visual redesign is part of the extraction.

`PRODUCT.md` and `DESIGN.md` outrank this plan, so they had to be amended to the accepted boundary
before application code moved. **Done on 2026-09-21** (step 2): both now describe Cockpit launching
an independent companion. `PRODUCT.md` carries the `consolehub://` launch verb, the Console Hub
commitment, and an achromatic shell with no exception; `DESIGN.md` retains the Hub design text under
a transferred-ownership banner per D11. Reference-brief delivery into a session is recorded as
planned rather than working, with the delivery boundary held as an open decision until after the
parity gate.

## Steps

1. **Freeze and prove the source behavior.** Isolate the reviewed Console Hub changes from unrelated
   working-tree changes and create a reproducible source baseline commit. Record that Cockpit revision, run the full tests
   and build, and capture the existing Hub screenshot scenarios. Inventory the exact import and IPC
   closure before copying files. Do not treat the failed semantic Graphify run as evidence: code AST
   extraction completed, but document extraction failed with HTTP 401 and direct source inspection
   supplied this plan's facts.
2. **Amend the product truth.** Update `PRODUCT.md` so Cockpit launches the companion instead of
   owning the Hub. Mark the Console Hub section of `DESIGN.md` as transferred ownership and copy the
   complete applicable design rules, accepted ADRs, current plans, glossary, fonts, SVGs, and visual
   fixtures into the new repository. Console Hub becomes the only active source of truth for them.
3. **Create the standalone shell.** Initialize `C:\FIles\Console-Hub` as a fresh Electron, React 19,
   and TypeScript application that follows the repository module contract. Give it its own app ID,
   user-data directory, installer metadata, single-instance lock, window lifecycle, and local error
   handling. Record the Cockpit source revision in its initial migration documentation.
4. **Extract the renderer with parity.** Move the Hub renderer closure into the standalone root.
   Replace Cockpit's `surface === 'hub'` and Rest-return assumptions with a Console Hub application
   shell. Preserve current DOM verification attributes, layout, Recipes, terminal behavior, reduced
   motion, authored icons, fonts, and visual tokens. Do not bring Cockpit's Second Brain, Vault
   plates, Tune panel, or Rest surface with it.
5. **Extract the runtime behind one preload seam.** Move the Hub main-process modules, their shared
   types, and the relevant IPC handlers. Split the current Cockpit config module so Console Hub owns
   vendor binaries, model rosters, skill roots, shell definitions, Stack arrangement, Workspace,
   run timeout, Mission worktree root, conversations, and run records. Remove dependencies on
   Cockpit corpus and config internals, including giving Workspace tree pruning an owned policy.
   Launch Consoles, Recipes, Stack slots, Orchestrator turns, and Skills through the configured
   Vendor CLIs and their native sign-in. Remove the billing-route classifier and clear inherited
   API-key and alternate-provider environment overrides for Hub-started agents. Keep the separate
   controlled Mission runner unavailable until it has a confirmed subscription account path.
   Keep the model settings screen and access-test UI in the later milestone.
6. **Add the launch protocol test-first.** Register `consolehub://` in the Console Hub installer and
   implement a versioned, strictly parsed launch payload. A cold launch opens the supplied Workspace.
   A warm launch focuses the existing instance and presents a different Workspace for explicit
   acceptance. A project handoff starts the Hub-configured default agent only after acceptance;
   a handoff to a Workspace focuses its open agent session or starts the default
   agent if no session is open; multiple open sessions resolve to the most recently active one.
   The default agent's Vendor, model, and effort come from Hub-owned configuration, editable during
   extraction without a new settings screen.
   If the saved Vendor or model is unavailable, show the reason and a choice before opening a new
   session; do not substitute one silently. An open session remains focusable regardless of the
   current default setting. Changing the default does not change an open session's Vendor, model,
   or effort; new sessions use the updated choice. A replacement chosen after an unavailable default
   is one-time unless the Hub-owned configuration is explicitly edited. Preserve the existing
   model sources during extraction: a fixed Claude picker, configured Codex IDs, and AGY CLI
   discovery. Surface the Vendor's rejection if its client or signed-in account cannot use a saved
   choice. Before Hub starts a new agent Console, check that the configured Vendor CLI exists;
   that CLI handles subscription sign-in and reports account or model rejection. An existing
   session may still be focused.
   A generic Hub launch opens without an agent. Reject malformed,
   relative, missing, or unsupported payloads without changing state. A different-Workspace handoff
   stays pending while a Mission is unresolved and asks for acceptance only after Apply or Reject
   completes cleanup. An ordinary agent turn in the prior Workspace continues in its original
   terminal after the new Workspace is accepted.
7. **Import durable state test-first.** On first launch, discover Cockpit's legacy user-data directory
   without sharing it at runtime. Copy and validate Hub-owned fields from `cockpit.config.json`, both
   Orchestrator conversation files, Mission and Console run records, evidence, and Hub pane settings
   where they can be read safely. Write a migration receipt. Never alter the source. An interrupted
   import must be retryable and idempotent; corrupt records are reported and skipped individually.
8. **Prove standalone parity.** Port all relevant unit, integration, and Electron verification tests.
   Add lifecycle checks proving direct launch, single-instance focus, Workspace acceptance, state
   import, terminal and agent survival after Cockpit exits, and independent uninstall or update
   behavior. Verify that Hub-started Console agents and harnessed Recipes, Orchestrator turns, and
   Skills use the configured Vendor CLI with inherited API-key overrides cleared. Verify that
   Mission remains held and launches no controlled worker until a subscription runner is available.
   Run the standalone
   typecheck, full test suite, production build, installer smoke test, and every migrated screenshot scenario.
9. **Replace Cockpit's embedded entry test-first.** Add a small launch module with one interface:
   open Console Hub with an optional Workspace and return a typed launch result. Its adapter opens
   the protocol URL. Project launch requests the Hub's default-agent start after Workspace acceptance;
   generic Rest launch does not. Change the existing Rest and project launch affordances to call it and show a
   clear unavailable-app result. Do not add status polling, installation, updates, or reverse IPC.
10. **Remove the embedded implementation.** After steps 1-9 pass together, delete the Hub renderer
    modules and providers, Hub main-process modules, Hub preload methods, shared Hub-only types,
    Hub configuration fields, Hub shutdown hooks, and obsolete screenshot scripts from Cockpit.
    Preserve historical docs and legacy user data. Update Cockpit tests to prove no embedded Hub
    runtime is reachable or packaged.
11. **Verify the cutover.** Install both release builds on a clean Windows 11 test profile. Exercise
    direct launch, generic Cockpit launch, selected-project handoff, repeated launch during an active
    run, Cockpit quit, Console Hub quit, missing Console Hub, malformed protocol input, migration
    retry, and an existing Mission record. Inspect both packaged file sets for accidental shared
    runtime assets or Hub code remaining in Cockpit.

## First follow-up after the parity gate

In the independent Console Hub repository, add the model settings screen. It edits the Hub-wide
default and Vendor-specific model lists, accepts manually entered model IDs even when discovery
does not list them, and keeps a replacement choice one-time unless explicitly saved. Show Console
and Mission availability separately. A newly added model is not offered to automated Missions
until the controlled runner's access to it is verified. Test Mission access is an explicit action
that sends a small real request through a verified included-subscription route and records its
result and time. Paid and unknown routes cannot be tested or run. No background access test spends
usage. Adding a model does not grant subscription or
API access. If access fails during a Mission, the affected lane fails visibly, the model loses its
Mission eligibility, and completed work and readable per-attempt progress remain. Recovery is an
explicit user action after access is restored and retested. Picking up starts a new attempt in the
same worktree with the saved brief, partial output, progress, and evidence supplied as context;
keep both attempts readable and run full validation again. If the original model remains
unavailable, the user may explicitly choose another Mission-verified Vendor and model for that
attempt; record its identity without changing the original assignment. Show each Vendor CLI's
subscription sign-in status and provide its native login flow without storing credentials in Hub;
continue to verify controlled Mission runner access separately. A sign-out or account change
detected on the runner side invalidates its prior successful model checks, while the saved model
IDs remain. This milestone begins only after step 11 passes.

The controlled runner's bundled Pi runtime has its own `/login` and credential store, separate
from the Vendor CLI used for interactive Consoles. Its [provider guidance](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/providers.md)
currently says Claude Pro/Max use through Pi draws from Extra Usage billed per token. Anthropic's
[Agent SDK guidance](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
describes a different third-party route that currently draws from subscription limits, so do not
generalize one route to another. Verify the bundled Pi route before enabling Mission access, and
show its sign-in and billing basis before a test or run. A Vendor CLI subscription login alone
proves neither Mission access nor included-plan billing.

## Risks

- **R1, hidden coupling**: `workspace-tree` currently imports Cockpit corpus pruning and Hub runtimes
  read Cockpit config directly. Close the full dependency graph before deletion and replace these
  with Console Hub-owned modules, not adapter layers back into Cockpit.
- **R2, dual sources of truth**: a long compatibility period would allow behavior and documentation
  to diverge. Freeze Hub feature work during extraction and remove the embedded copy immediately
  after the parity gate passes.
- **R3, protocol injection**: Workspace paths are untrusted launch input. Parse one versioned shape,
  decode once, require an absolute existing directory, and never construct a shell command.
- **R4, state loss**: Electron local storage and partially written Run Records may not import cleanly.
  Keep the source read-only, migrate atomically into a staging directory, produce a receipt, and
  allow idempotent retry.
- **R5, false parity**: unit tests cannot prove the xterm and Electron window behavior. Keep the
  existing visual fixtures and add packaged cross-process lifecycle checks.
- **R6, process ownership regression**: copied Cockpit shutdown hooks could still kill Hub children
  from the wrong process. Tests must prove only Console Hub owns and closes its Consoles and agents.
- **R7, missing companion**: Cockpit launch may target a machine without Console Hub installed.
  Return a visible unavailable result without attempting installation or opening a web page.
- **R8, truth conflict** — **retired 2026-09-21**: `PRODUCT.md` and `DESIGN.md` pinned an embedded
  surface and blocked code work until amended. Both now state the independent-product model, so this
  risk is closed. It stays recorded because any later edit that reintroduces an embedded-Hub claim
  re-opens it.
- **R9, unreadable failed turn**: `missionTerminals` currently writes only the error to its result
  file when the controlled runner fails, discarding returned partial text; streamed progress is
  terminal output rather than durable per-attempt evidence. Retry reuses the worktree but does not
  pass that failed attempt's output to the next worker. The post-extraction recovery milestone must
  persist and supply this context before claiming a failed lane can be read and picked up.
- **R10, separate Mission account**: interactive Vendor CLIs and the controlled Pi runner have
  separate authentication. Keep Mission unavailable until its controlled runner has a subscription
  account path; a successful Vendor CLI sign-in does not enable Mission.
- **R11, CLI account overrides**: inherited API-key or alternate-provider environment variables
  can redirect a Hub-started Vendor CLI away from its subscription sign-in. Clear common overrides
  at every Hub-started agent process boundary. Vendor-owned config and account settings remain
  authoritative and can still affect usage.
- **R12, alternate launch path**: Recipes, Orchestrator turns, and Skills start agents through
  harnesses rather than Console buttons. Use the same subscription environment at those launches.

## Checks to run

Cockpit baseline and final checks:

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run shoot -- out/shot.png 3000`
- Existing Hub Electron verification scripts before extraction; replacement launch verification
  after removal.

Console Hub checks, once the new repository exists:

- Typecheck, full Vitest suite, and production Electron build.
- Direct executable and installer smoke tests on Windows 11.
- Cold and warm `consolehub://` protocol tests, including invalid payloads.
- State-import unit, corruption, interruption, and idempotency tests against copied fixtures.
- Electron screenshot parity for every current Hub scenario.
- Process-lifetime test proving Cockpit can quit while Console Hub Consoles and agents continue.
- Packaged-artifact inspection proving Console Hub carries no Cockpit surfaces and Cockpit carries no
  embedded Hub runtime.

## Changelog

### 2026-09-21 (step 2 complete)
- **Step 2 done.** `PRODUCT.md` and `DESIGN.md` now state the independent-product boundary, so code
  movement is unblocked and R8 is retired.
- `PRODUCT.md`: Stack moves terminal embedding to Console Hub; the Launch verb becomes the
  `consolehub://` Workspace handoff and states that the window switch is a deliberate loss against
  the embedded-terminal promise; a Console Hub commitment names it a separate product with a
  launch-only seam; the achromatic shell pin loses its exception; the vendor-rim rule is marked
  transferred.
- `DESIGN.md`: agent rims and `## The Console Hub` carry transferred-ownership banners under D11
  rather than being deleted; the question-fan graduation rule and the five Hub icons are marked as
  Console Hub's.
- **Retrieval delivery deferred.** Outside-session vault search and cited reference briefs remain a
  Cockpit commitment, but writing a brief into a running session is recorded as planned rather than
  working. No reverse IPC and no widening of `consolehub://` during extraction. The delivery
  boundary — move retrieval to Hub, extend the launch contract one-way, or leave it manual — is an
  open decision for after the parity gate.
- **Step 1 baseline shape decided.** The Hub baseline is current behavior, not a claim that Mission
  is finished. It includes the Mission, Console, and controlled-runner changes plus the
  `src/main/index.ts`, `config/`, and `package.json` changes they require to build; `index.ts:85`
  imports `ControlledRunner` and `package.json` adds `@earendil-works/pi-coding-agent`, so a
  Hub-only commit is not an available shape. `second-brain/_internal/paint.ts` and other unrelated
  work stay out. `graphify-out/` is gitignored as generated cache; `.claude/settings.json` stays
  untracked rather than ignoring the directory, since its worktree setting may be intentional.

### 2026-09-22
- The user removed the Hub billing-route gate and chose to rely on native Vendor CLI subscription
  sign-in for Consoles, Recipes, Orchestrator turns, and Skills. Common inherited API-key and
  alternate-provider environment overrides are removed from Hub-started agents.
- The controlled Mission runner does not share those CLI sign-ins. Mission release remains
  unavailable until a subscription-backed controlled path is implemented and verified.

### 2026-09-21 (superseded billing decision)
- Extended the no-paid-use gate to every Hub-initiated agent run, including harnessed Recipes,
  Stack slots, Orchestrator turns, and Skills. Paid or unknown routes hold; verified included
  subscription routes proceed. Existing sessions remain focusable.
- A Recipe preflights all participating slots. One paid or unknown route holds the whole Recipe
  before any slot starts; the blocked slots are shown for correction or removal.
- A running Recipe rechecks the billing route before each model request. If it becomes paid or
  unknown, all new requests across the Recipe wait. Already-sent requests may finish and their
  output stays readable.
- After correcting a route, the user selects Continue. Hub rechecks every participating slot
  before continuing the held Recipe and does not repeat completed requests.

### 2026-09-20
- Reconfirmed parity-first extraction: move current Console Hub behavior before pursuing Fusion Hub
  feature parity. The extraction source is a reviewed Console Hub baseline commit, isolated from
  unrelated uncommitted work.
- Current controlled Mission workers remain non-interactive during extraction. Their plates show
  progress, while Stop and Retry stay with the Orchestrator. Pi session continuation and direct
  worker intervention belong to the post-extraction feature work.
- Project launch preserves one-click agent startup: Cockpit hands off the project Workspace and
  Console Hub starts its configured default agent after acceptance. Generic Hub launch starts no
  agent. The [agreed flow comparison](../mockups/2026-09-20-project-launch-handoff.html) records
  the difference from the prior embedded-terminal product promise.
- Repeated project launch into the already active Workspace focuses its existing agent session;
  when several are open, it focuses the most recently active one. Only an empty Workspace starts
  the configured default agent.
- The default launch agent is a Hub-wide, editable Vendor/model/effort selection. Claude is the
  initial Vendor, not a hardcoded provider or model in the handoff protocol.
- An unavailable saved Vendor or model prompts for a valid choice and opens no new session until
  chosen. Existing sessions remain focusable without consulting the current default.
- Changing the default launch agent changes future sessions only; existing sessions retain their
  chosen Vendor, model, and effort.
- An alternative chosen when the saved default is unavailable is one-time unless explicitly saved
  as the new default. Hub settings let the user add models by Vendor; additions alone do not change
  the default or open sessions.
- Add model accepts a manually entered model ID even when discovery does not list it. The saved ID
  is a choice, not an entitlement; the Vendor client and signed-in account determine access.
- Hub settings show separate Console and Mission availability. A newly added model remains absent
  from Mission choices until the controlled runner's access is verified.
- Test Mission access is an explicit user action that sends a small real request, records the result
  and time, and makes the model a Mission choice only on success. No background tests spend usage.
- Lost access during a Mission visibly fails that lane and removes the model from new Mission
  choices until retested. Preserve its worktree, brief, partial output, progress, and evidence for
  inspection and user-directed recovery; do not silently substitute a model.
- Picking up an access-failed lane starts a user-released new worker attempt in the same worktree
  and Run Snapshot, with the prior brief, partial output, progress, and evidence as context. The
  dead process is not resumed; both attempts stay readable and full validation runs again.
- If the original model is still unavailable, the user can choose another Mission-verified Vendor
  and model for the new attempt. Record each attempt's Vendor, model, and effort; preserve the
  original lane assignment.
- Vendor CLIs retain ownership of subscription login and credentials. Hub settings show sign-in
  status and open native Vendor login, while Mission runner access requires its separate test.
- A detected sign-out or account change for the Mission runner clears its successful model checks
  without removing saved model IDs. The check uses the same runner and account as real Missions.
- Bundled Pi uses separate subscription login for Missions. Its provider guidance currently says
  Claude Pro/Max usage through Pi draws from per-token Extra Usage, while Anthropic's Agent SDK
  guidance describes a different route. Verify and show the bundled Pi billing basis before a
  test or Mission run.
- Mission requests must show the runner account and verified billing basis before sending. An
  unknown billing basis holds the request; Vendor CLI subscription login proves neither access
  nor Mission billing.
- The billing preflight ships in the first standalone release as a narrow parity-first exception.
  It shows the account and route before Mission release and holds unknown routes; no payment
  integration or per-lane approval flow is added.
- Paid Mission routes, including paid access tests, are disabled for now. The first standalone
  release allows only routes verified as included with the signed-in subscription; this is
  Vendor-neutral and has no paid override.
- Hub-initiated new agent Consoles also hold when the effective Vendor CLI route is known to be
  paid, including API-key environment overrides. Focusing an existing session remains available;
  manually typed commands in a plain shell are outside this launch gate.
- An unknown effective Vendor CLI billing route also holds new Hub-initiated agent Consoles, with
  an explanation and native sign-in path. No silent Vendor or model substitution occurs.
- Sequenced model management after the extraction parity gate. Extraction keeps a Vendor-neutral
  launch seam and Hub-owned editable default configuration; the settings screen, manual model IDs,
  and Mission access checks are the first follow-up milestone.
- A project handoff to another Workspace waits while the current Workspace has a running Mission.
  Stop retains worktrees, evidence, and assigned terminals, so the handoff remains pending until
  Apply or Reject completes cleanup. Only then does Console Hub ask to switch. This corrects the
  earlier "finishes or stops" wording after checking the current Mission lifecycle.
- Ordinary agent turns do not block a different-Workspace handoff. After acceptance, the previous
  terminal continues in its original folder while Console Hub opens or focuses the new Workspace's
  session.

### 2026-09-12
- Confirmed automatic routine orchestration with human output review and explicit Apply Result.
- Retained failure reporting and user-approved recovery. Automatic retries were rejected.
- Recorded Fusion Hub as the eventual feature target, separate from extraction acceptance.
- Selected Fusion Hub as the default orchestration design reference. Automated Recipe workers move
  to its Pi-compatible structured runner and explicit tool lists; interactive Vendor CLIs remain a
  Console-only capability. Console Hub retains isolated worktrees, explicit Apply Result, and
  user-approved retries where those deliberate decisions differ from Fusion Hub.
- Plan created from the confirmed `grill-with-docs` decisions.
- Recorded the current cross-renderer, main, preload, shared-type, configuration, storage, and
  process-lifecycle coupling.
- Added ADR 0056 and the Console Hub, Launch handoff, and Hub state migration glossary terms.
