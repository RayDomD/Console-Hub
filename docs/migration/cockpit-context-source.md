# Cockpit

One window the working day starts in: the indexed corpus rendered as a living volume, with
instruments above it and a way down into any single note.

## Language

### The stacked view

**Layer 0**:
The second brain — the indexed corpus drawn full-bleed as the window's ground. Always live,
never chrome.
_Avoid_: background, canvas, the graph

**Layer 1**:
The instrument plates that sit above layer 0 and are dragged into place by the user.
_Avoid_: widgets, panels, cards

**Fragment Ground**:
The drifting mono debris field painted beneath layer 0. A separate canvas from the corpus and
not part of it.
_Avoid_: the background layer

There is no layer 2. A view that takes the whole window is a **surface**, not a layer.

**Surface**:
One full page of the cockpit, holding its own arrangement of plates: `rest`, `explorer`,
`sheet`, `editor`, and `hub`. You fly between them and there is exactly one way in and one way
back ([ADR 0018](docs/adr/0018-the-hub-is-a-surface-and-the-console-is-on-it.md)). A thing
painted over a surface at `position: fixed` is not a surface.
_Avoid_: page, screen, tab, view, mode

**Door plate**:
A small plate on one surface carrying live status from another, and entered by clicking it. The
Hub's door reports fan and console state so a run is readable without leaving `rest`.
_Avoid_: launcher, button, shortcut, tab

### The rungs

Pressing into the corpus walks a fixed chain, and Escape walks back down it one rung at a
time. These four names are the product's own, taken from the build reference.

**Rest**:
Layer 0 at rest — the corpus as a tumbling ball inside its geodesic cage, with layer 1's
plates above it. The default view.

**Explorer**:
The surface entered by pressing the second brain. The corpus is released from the ball into a
navigable field that fills the window.
_Avoid_: layer 2, expanded view, released state

**Sheet**:
The surface entered by pressing a cluster in the Explorer. That cluster's nodes fly out into
file rows grouped under their subfolders; the other clusters leave the frame.
_Avoid_: the file list, drill view

**Reader**:
The read-only surface entered by pressing a file row in the Sheet. It fills the window and shows
one file with metadata in a floating layer-1 plate; Markdown is read through CodeMirror 6, while
text, image, and video files use their appropriate read-only previews. The internal plate-layout
surface key remains `editor`; that implementation name is not product terminology.
_Avoid_: Editor (when naming the product rung), writable editor, note view

### The corpus

**Corpus**:
Every file under the configured roots, indexed read-only into one snapshot. Distinct from the
Vault, which is only one of those roots.
_Avoid_: the index, the vault (when the whole corpus is meant)

**Node**:
One real file in the corpus. File nodes are distinct from cluster anchors and the Vault Seed/Sentinel, which are visual guides rather than files.

**Cluster**:
One of the seven groupings a node belongs to, and the primary identity carried by colour in the product. Its colour also tints connected edges at low opacity.

**Cluster label**:
The name and count placed inside a cluster's node mass at Rest, identifying the grouping without adding a plate or enclosing frame.
_Avoid_: cluster card, cluster plate, annotation panel

**Cluster anchor**:
A single prominent center mark naming a cluster, without an enclosing box. In Explorer a click opens that cluster's entire Neighborhood; dragging repositions the cluster without opening it. In the Neighborhood the anchor repositions the close-up as a group without selecting or opening files. It is not a note, a MOC, or an additional member of the corpus.
_Avoid_: center file, artificial note, cluster card

**Anchor guide**:
A visual connection between a cluster anchor and the Vault center in Explorer. It expresses the view's organization, not a relationship between notes, and has no meaning for backlinks, reachability, or vault health.
_Avoid_: wikilink, corpus edge, backlink

**Effort**:
A real body of ongoing work, configured explicitly and ridden on the cage rather than indexed
into the ball. Not a cluster.

**Trust**:
How settled a note's content is, encoded in a node's fill rather than its shape or colour.

**Root**:
One configured top-level directory the corpus is indexed from.

**Vault Seed**:
The distinct monochrome graph mark for the configured Vault root at Rest. It sits within the Layer 0 corpus volume, moves with that volume, and reads as a peer in the graph while retaining its own shape. It is not a selected file or a relationship hub.
_Avoid_: Vault node, active focus, selected file, network hub

**Vault Sentinel**:
The full, animated visual-guide form of the Vault Seed, rendered only in Explorer where the corpus relationships are visible. The Seed transforms into the Sentinel as Rest releases, initially at the graph's center. They are two representations of one Layer 0 identity. It can be repositioned without opening content or changing the configured roots. Anchor guides connect the cluster centers to it, but it owns no corpus edges and offers no navigation. Cluster anchors provide Explorer entry; file selection belongs inside a cluster visit. Its faceted plates and iris make subtle noise-driven corrections, but it never pulses or twinkles.
_Avoid_: separate mascot, Layer 1 plate, selected file, connected graph node

**Beacon response**:
The Vault node's temporary increase in glow when it receives pointer or keyboard focus.
_Avoid_: pulse, heartbeat, selection state

**Cockpit status plate**:
The single floating Rest instrument that groups corpus telemetry, Vault health, and the In Flight, Wants You, and Gather effort signals.
_Avoid_: dashboard, status rail, separate effort cards

**Movable plate**:
Any layer-1 instrument plate that the user may reposition anywhere in the window; its default home position is a starting point, not a reserved lane.
_Avoid_: fixed panel, reserved lane, draggable ground

**Plate grip**:
The dedicated top-right area of a movable plate that starts repositioning without interfering with the plate's controls.
_Avoid_: drag-anywhere surface, resize handle

**Plate arrangement reset**:
A current-surface action in the Tune plate that returns every movable plate on that surface to its default home position without changing corpus or visual settings.
_Avoid_: reset all settings, restore layout (when the surface itself is meant)

**Surface position**:
The persisted location of a movable plate within one product surface; the same plate may have a different position on another surface.
_Avoid_: global plate position, shared coordinates

**Surface plate set**:
The layer-1 instrument plates available on one product surface; different surfaces may expose different sets while sharing the same movable-plate behavior.
_Avoid_: global plate inventory, universal panel set

**Corpus edge**:
A visible relationship line between real corpus nodes, shown in Explorer where relationships can be inspected without obscuring Rest.
_Avoid_: connector, decorative line, link (when the visual relationship is meant)

**Relationship web**:
The complete visible set of corpus edges in Explorer. It is deliberately absent from Rest, whose job is orientation rather than relationship inspection.
_Avoid_: Rest web, background wiring

**Focused relationship**:
A corpus edge incident to the node currently hovered, keyboard-focused, selected, or matched by an active search in Explorer. It is strengthened while all other web edges recede to a near-background map.
_Avoid_: selected network, active graph

**Hover inspection**:
The temporary Explorer focus state produced by pointing at a node. It blooms the hovered node's direct neighborhood into a capped radial view: at most 24 relationships are drawn, with any remaining connections represented by a count. It never changes what a click does.
_Avoid_: click selection, pinned selection

**Search-result focus**:
The keyboard equivalent of hover inspection: the currently highlighted Explorer search result is emphasised in place, with the rest of the field dimmed. It is emphasis, not selection, and never reaches Linked Sheet. Enter opens that result's home Cluster Neighborhood with no file preselected.
_Avoid_: arrow-key graph navigation, keyboard cursor

**Explorer launch view**:
The default Explorer label mode. It shows one label and count for each cluster; Folder view is optional and file names are an opt-in inspection mode.
_Avoid_: filename field, folder-first explorer

**Focused filename**:
The single filename shown when File names mode is enabled and a node is hovered, search-result focused, or keyboard-focused in Explorer. It is not a label for every visible node.
_Avoid_: filename cloud, file labels mode

**Linked Sheet**:
A cluster’s complete file Sheet on the left paired with a persistent, close-up relationship view on the right, entered by selecting a file node in the Cluster Neighborhood. The selected node is the relationship focus and its matching file is revealed and highlighted in the Sheet, whose membership and ordering remain stable as selection changes.
_Avoid_: zoomed-out Sheet, Explorer background, file preview

**Linked selection**:
The file selected in the Linked Sheet, shared by the highlighted file row and the relationship focus. It persists through hover until another file is selected; opening the file in the Reader is a separate action.
_Avoid_: open file (when only selected), hover focus

**Cluster Neighborhood**:
The close-up view of an entire selected cluster, before the paired file list and relationship view. It presents the cluster without a file list.
_Avoid_: Linked Sheet, selected-file view

**Guest node**:
A connected file from another cluster explicitly selected into the current cluster view for inspection, retaining its home cluster's colour and membership without moving or copying the file. A visible external connection is not yet a guest: selecting it admits that file and reveals its direct connections for further exploration.
_Avoid_: imported file, moved node, recoloured member

**Guests section**:
The separate group beneath the current cluster's files listing guest nodes with their home cluster names. Its rows share the Linked Sheet's selection with the graph without becoming members of the current cluster.
_Avoid_: imported files, merged cluster

**Cluster visit**:
The exploration of one chosen cluster across its close-up, Linked Sheet, and Reader, ending on return to the full Explorer. Guests belong to this visit and are cleared when it ends.
_Avoid_: permanent guest collection, saved cluster membership

**Back navigation**:
The return through enclosing views: Reader → Linked Sheet → Cluster Neighborhood → Explorer. Individual file selections and guest admissions are not navigation steps.
_Avoid_: selection history, guest trail (when describing Back)

**Relationship Sheet**:
The earlier design's filtered Linked Sheet for external connections or collapsed relationships, superseded by guest nodes and the Connections popover in the revised cluster interaction.
_Avoid_: expanded graph, second list view, modal relationship list

**Connections popover**:
The searchable list of relationships collapsed behind +N more, separate from the cluster's file list. Choosing a result focuses that file and admits it as a guest if external, without filtering or replacing the cluster list.
_Avoid_: Relationship Sheet, expanded graph

**Edge tint**:
A low-opacity blend of the endpoint cluster colours applied to a corpus edge, subordinate to the nodes and labels.
_Avoid_: edge colour as primary identity, rainbow web

### Editing

**Guarded save**:
A write that re-checks the file's modified-time immediately before writing and refuses if it
changed underneath. Cockpit performs no unguarded writes to corpus files.
_Avoid_: safe save, atomic save

### Vault health

**Defect**:
One violation of the vault standard. Cockpit displays the authoritative script's six report
buckets: Missing required properties (the script's combined missing-type-or-summary and
missing-required-property bucket), Type outside vocabulary, Failing connectivity, Session debt,
Duplicate basenames, and Link rot. The script owns those rules and buckets; Cockpit does not
split or invent them.
_Avoid_: error, warning, issue

**Active defect filter**:
An Explorer filter entered from a Vault-health defect class. Matching node marks retain their cluster colour and receive a subdued red dashed outline whose visibility is controlled in Explorer Tune.
_Avoid_: defect colour replacing cluster colour, red cluster

**Stray**:
A note carrying at least one defect.

**In scope**:
The notes the standard is enforced over — `ATLAS` and `Sessions` only. Much narrower than the
corpus, which spans three roots and includes files no standard governs.

### The fan

**Console Hub**:
An independent desktop application for configuring and running agent-assisted work. It can be
opened directly; Cockpit may launch it but does not own its lifetime. It owns the complete
orchestration experience: Explorer, Live Stack, every Recipe, Console, and Mission. It has its own
repository, build, installer, executable, and release lifecycle. After migration, Cockpit retains
only its Console Hub launch affordances and optional Workspace handoff; it exposes no Hub status or
controls and contains no fallback Hub implementation. Console Hub keeps the established calibrated
instrument visual system under its own product identity, with independently owned design assets and
no Cockpit branding.
_Avoid_: Cockpit surface, embedded Hub, Console Recipe

**Launch handoff**:
The optional transfer of a selected Workspace when Cockpit opens Console Hub. Console Hub validates
and owns the Workspace after launch; the applications do not share configuration or runtime state.
For a project launch, Console Hub starts its configured default agent after accepting the Workspace;
a generic Hub launch starts no agent. Repeating a project handoff for a Workspace focuses
its most recently active agent session, starting the default agent only if none is open. Cockpit
does not choose or run the agent.
Cockpit may discover or be configured with the executable, but Console Hub alone owns installation
and updates. If Console Hub is already running, Cockpit focuses that instance and the incoming
Workspace waits for explicit acceptance; active work is never replaced or interrupted.
If a Mission is unresolved, a different-Workspace handoff remains pending until it is Applied or
Rejected and cleanup completes; stopping its processes does not release the handoff.
An ordinary agent turn in the prior Workspace continues in its original terminal after the new
Workspace handoff is accepted.
_Avoid_: shared state, embedded navigation, Cockpit-owned Workspace

**Default launch agent**:
Console Hub's editable Vendor, model, and effort choice for a project handoff whose Workspace has
no open agent session. It is Hub-wide and initially selects Claude, while Cockpit never chooses the
agent or model. If the saved choice is unavailable, Console Hub asks for another before starting a
new session; it never substitutes one silently. Existing sessions do not depend on this choice.
Changing this choice affects future sessions only; an open session retains the Vendor, model, and
effort it started with. A replacement chosen when the saved default is unavailable is one-time
unless the user explicitly changes the default.
_Avoid_: Cockpit default, hardcoded Claude, project-owned provider

**Model list**:
The models offered as launch choices for a supported Vendor in Console Hub settings. The user can
add models to a Vendor's list by entering a model ID, including one discovery has not listed.
Adding one does not select it as the default launch agent, change an open session, or grant access
to the model. Console and Mission availability are tracked separately; the model becomes a Mission
choice only after the controlled runner's access is verified.
_Avoid_: default model, Vendor, automatic session switch

**Mission access check**:
An explicit user-requested test of one Vendor and model through the controlled Mission runner. It
sends a small real request, may consume account usage, and records a timed success or failure.
A successful check makes that model a Mission choice; adding its name alone does not. A sign-out or
account change detected for that runner invalidates its successful checks without removing models.
_Avoid_: model discovery, subscription entitlement, background probe

**Mission access failure**:
The loss of access to a previously verified model during a Mission turn. The affected lane fails,
the model stops being a Mission choice until retested, and its prior work and readable progress
remain available for user-directed recovery.
_Avoid_: automatic model substitution, lost lane progress, automatic retry

**Mission billing basis**:
The account and charging route used by the controlled Mission runner for a model request. It is
independent of the interactive Vendor CLI's sign-in. If it cannot be verified and shown before a
request, that request waits. Paid Mission routes also wait under the current no-paid-use policy;
only a verified included-subscription route can run.
_Avoid_: assumed subscription allowance, Vendor CLI login status, hidden cost route

**Console billing basis**:
The effective sign-in and charging route of the Vendor CLI that Hub is about to launch as a new
agent Console. Known paid routes are held under the current no-paid-use policy; focusing an
existing session does not start another agent. An unknown route also holds a new agent Console
until it can be identified.
_Avoid_: Mission billing basis, selected model, plain shell command

**No-paid-use gate**:
Console Hub's rule for every agent run it starts, including Recipes, Stack slots, Orchestrator
turns, Skills, new agent Consoles, and Missions. Only an effective route verified as included in
the signed-in subscription may start. Paid or unknown routes wait with a reason and correction
path. A Recipe checks every participating slot before launch and waits as a whole if any slot is
blocked. During a Recipe, Hub checks again before each model request; if the route becomes paid
or unknown, all new requests across that Recipe wait while already-sent requests may finish and
completed work remains readable. To continue a held Recipe, the user explicitly selects Continue
and Hub rechecks every participating slot. Focusing an existing session does not launch another
agent; commands typed by the user in a plain shell are outside this gate.
_Avoid_: model-list membership, sign-in alone, silently substituted route

**Hub state migration**:
The one-time copy of durable Hub-owned state from Cockpit into Console Hub: Workspace, Stack,
provider and shell settings, conversations, Mission records, and run evidence. Live Consoles and
agent Sessions do not migrate. Cockpit's source remains untouched after verification as legacy
recovery data and is removed only by a later explicit user action.
_Avoid_: shared storage, moving live processes, destructive migration

**Fan**:
A set of harnessed agents participating in one Hub run. The chosen Recipe determines whether
they answer independently, synthesise, debate, coordinate, validate, or route directly.
_Avoid_: swarm, squad, ensemble, the grid

**Recipe**:
The explicit choreography chosen before a Hub run. Exactly seven are available: Explore,
Synthesize, Debate, Coordinate, Validate, Direct, and Console; none is preselected.
_Avoid_: mode, command, workflow type, smart routing

**Explore**:
The Recipe that sends one unchanged ask to every Stack slot in parallel and preserves the
responses separately. Slots cannot see one another, the Workspace is read-only, and no synthesis
is produced.
_Avoid_: opinion mode, comparison, synthesis

**Synthesize**:
The Recipe in which every Stack slot proposes independently under read-only access, then a fresh
Orchestrator turn performs one attributed merge in its own worktree after a human release. Project
changes become a result branch for explicit adoption; prose-only results remain in the Run Record.
_Avoid_: fusion mode, Coordinate, automatic merge

**Debate**:
The read-only Recipe in which every Stack slot opens independently, then receives every surviving
slot's attributed prior-round position before replying again. It closes with positions, not a
winner, judge, or synthesis.
_Avoid_: scored comparison, adversarial agents, Synthesize

**Coordinate**:
The Recipe that turns independent plans into a validated dependency graph, then dispatches ready
tasks across persistent slot sessions. Writing slots use separate worktrees; a fresh Orchestrator
integrates their branches without landing anything in the user's working branch.
_Avoid_: parallel fan, shared-checkout collaboration, automatic merge

**Validate**:
The two-slot Recipe in which the Orchestrator writes an executable gate before the selected Builder
works, then that fixed gate drives a bounded correction loop. A passing run leaves a proven branch
for explicit adoption.
_Avoid_: review, self-validation, test after implementation

**Direct**:
The Recipe that routes turns to one selected Stack slot without orchestration. Its structured agent
session and isolated worktree persist across turns until explicitly reset.
_Avoid_: Console, one-agent fan, quick mode

**Stack**:
The app-wide persistent lineup of one to five slots shared by every Hub Recipe. A Recipe decides
how the Stack participates; changing Recipes or Workspaces does not silently change the lineup.
_Avoid_: fan, preset, per-run lineup, model list

**Stack plate**:
The Hub instrument for editing the live Stack's slot order, names, Roles, Vendors, models, reasoning
effort, and Slot Instructions. A running Recipe keeps the immutable Stack snapshot it launched with.
_Avoid_: model picker, settings page, run editor

**Slot**:
One agent's seat in the Stack, carrying a vendor, a model, an effort and a role. A slot outlives
any single launch of it: retrying a slot is a second attempt at the same seat.
_Avoid_: agent, worker (as a general term), console, terminal

**Vendor**:
A subscription-backed agent CLI Cockpit can run through a Vendor Adapter. The initial Vendors are
Claude Code, Codex, and AGY; several Stack slots may use different models from one Vendor.
_Avoid_: model, provider API, gateway

**Vendor Adapter**:
The boundary that teaches Console Hub one Vendor's model discovery, sign-in status, native login
flow, and interactive Console launch. The Vendor CLI owns and stores subscription credentials;
Console Hub does not copy them. Automated Recipes use the controlled runner's common structured
event and tool contract instead of launching each Vendor CLI directly; their access is verified
separately.
_Avoid_: model configuration, generic shell wrapper

**Controlled runner**:
The Pi-compatible process used for automated Recipe workers. It launches every configured model
through one structured protocol and grants an explicit tool set per turn. Research receives only
read, grep, find, and list capabilities; writing receives full tools inside an isolated worktree.
Interactive Consoles do not use this runner.
_Avoid_: Windows sandbox, Vendor CLI wrapper, prompt-only restriction

**Capability**:
A Vendor or model behavior proven by its adapter, such as enforced read-only access, structured
streaming, writing, Session continuation, telemetry, or interactive Console support. Recipes never
assume or silently weaken a missing Capability.
_Avoid_: feature flag, best effort, advertised option

**Role**:
The standing responsibility a slot carries across Recipes: Primary, Orchestrator, or Contributor.
A one-slot Stack has only a Primary; a larger Stack has one distinct Primary, one Orchestrator,
and zero to three Contributors.
_Avoid_: type, Recipe

**Primary**:
The Stack's default hands-on slot for direct work, interactive use, and building. Direct may
target another slot deliberately; Primary names the default, not exclusive access.
_Avoid_: host, main, default model

**Orchestrator**:
The slot responsible for planning, synthesis, coordination, or validation when a Recipe needs
one. It is always distinct from the Primary so the hands-on agent does not become its own reviewer.
In the Fan it is one dedicated slot, selected through its vendor, model, and effort rather than by
repurposing a worker.
_Avoid_: architect, judge, merger, lead

**Orchestrator conversation**:
A persistent, interactive planning exchange with the selected Orchestrator. It is discardable until
the user proposes a delegation, then receives the automated run's final synthesis so work can continue.
During worker execution it remains writable for status questions, but cannot change the released run.
Its Orchestrator configuration locks after the first message; changing it starts a new conversation.
It may create multiple separate, immutable Run Records.
It survives an app restart as a local transcript, while the resumed agent session is explicitly new.
When it proposes a delegation, its prior transcript becomes an immutable part of that Run Record.
It accepts no new message while the Orchestrator is responding; messages are never queued.
An interrupted reply remains visible and may be retried only from a new session carrying the transcript.
_Avoid_: Console, slot stream, run transcript

**Orchestrator terminal**:
The full-width Hub instrument that renders the Orchestrator conversation. It replaces separate
question, delegation, and orchestrator displays; accepted assignments appear once inside the conversation.
_Avoid_: Console, shell, delegation panel, orchestrator panel

**Run-status snapshot**:
The clearly labeled, point-in-time worker state attached to an Orchestrator conversation message
during a run: phase, elapsed time, latest output excerpt, and available usage figures.
_Avoid_: live context, mutable run state, worker control

**Contributor**:
An additional independent slot in a Stack larger than two. Explore and Debate treat every slot
as an equal participant despite their standing Roles.
_Avoid_: secondary, subagent, worker

**Answerer**:
What a fan slot is. An agent whose situation is the question and whatever access the fan
deliberately grants it - not a coding agent restrained from writing
([ADR 0017](docs/adr/0017-a-fan-slot-is-an-answerer.md)). The build fan's slots are the other
thing, and the distinction is why one scope concept does not have to mean both.
_Avoid_: assistant, bot, model (which names what it runs on, not what it is)

**Workspace**:
The folder a Hub run may access, chosen by the user and belonging to the run rather than to any slot,
so every participating slot starts from the same place. Defaults to none. Always visible on the
plate, including when empty.
_Avoid_: cwd, repo, project, context

**Run Context**:
The complete visible material attached before an automated run: at most one Workspace, selected
files or folders, at most one explicit Skill, at most one cited Reference Packet, and selected
evidence from earlier Run Records.
_Avoid_: ambient context, hidden attachments, prompt

**Run Snapshot**:
The frozen Workspace file state every automated slot receives at launch, including selected
uncommitted and untracked work. Writing worktrees branch from it; later checkout edits do not alter it.
_Avoid_: backup, live Workspace, git revision alone

**Workspace lease**:
The exclusive right for one automated run to create writable work against a Workspace at a time.
Read-only runs may overlap; runs against other Workspaces remain independent.
_Avoid_: git lock, Console lock, global queue

**Workspace queue**:
The reorderable first-in, first-out list of write-capable runs waiting for one Workspace lease.
Each entry owns the Run Snapshot frozen when the user pressed Run.
_Avoid_: global queue, background scheduler, automatic retry

**Conventions**:
A project's standing instructions, read by each vendor from its own file - `CLAUDE.md`,
`AGENTS.md`, `GEMINI.md`. They describe the codebase. A *personal* instruction file describes
how its author wants an assistant to work with them, and never reaches a slot.
_Avoid_: rules, memory, system prompt, context file

**Recipe Contract**:
Cockpit's fixed instructions defining one Recipe's behavior and guarantees. It is the first layer
of every harnessed slot's effective instructions.
_Avoid_: system prompt, Slot Instructions, Conventions

**Slot Instructions**:
Optional user-authored guidance attached to one Stack slot and saved in Presets. It follows the
Recipe Contract and Workspace Conventions, and cannot silently import other personal configuration.
_Avoid_: persona, global instructions, Recipe Contract

**Effective instructions**:
The complete labeled instruction stack a slot will receive: Recipe Contract, Workspace Conventions,
Slot Instructions, and an explicitly selected Skill when present. It is inspectable before launch.
_Avoid_: hidden prompt, ambient context

**Held**:
A human-review state between two Recipe phases, in which the produced delegation, plan, or gate
is visible and nothing is running. Released deliberately before the expensive or mutating phase.
_Avoid_: paused, waiting, armed

**Scope**:
What Cockpit does with a slot's output, not what the agent may touch. Every phase-1 slot runs
read-only at the process level; `NONE` consumes the output, `DOCS` writes it to a file.
_Avoid_: permission, write access, sandbox

**Preset**:
A named Stack arrangement saved deliberately and reloaded. Distinct from the live Stack, which
persists on its own without being named; project Conventions are not part of a Preset.
_Avoid_: template, profile, stack

**Console**:
An interactive pty session running a shell, independent of the Stack — a Console has no vendor,
model, or effort of its own. The Console Recipe is a fixed, manually-managed lineup of up to six
Consoles plus an Orchestrator that drafts a delegation plan, holds for release, and types each
Console's task into it on release ([ADR 0050](adr/0050-console-becomes-an-orchestrated-terminal-fan.md)).
Structured output from a harnessed Recipe is a slot stream, never a Console, even when both appear
as plates on the Hub.
_Avoid_: slot stream, harnessed console, terminal (which reads as either), Stack slot

**Console run**:
A released delegation to the Console Recipe's terminals. Releasing it authorizes Cockpit to monitor
progress, collect completed results, and have the Orchestrator combine them automatically once all
assignments finish, without another release or manual progress report.
_Avoid_: manual check loop, terminal conversation

**Mission**:
A Vendor-neutral, Cockpit-scoped Console workflow that turns agreed implementation work into isolated
worker lanes, verifies their returned changes, and produces one reviewed Result for explicit adoption.
It is invoked as `/mission`; the user's global `/agent-loop` skill remains separate and unchanged.
_Avoid_: Agent Loop, ad hoc delegation, automatic merge

**Read-only Vault access**:
The worker's ability to read and search the Vault while being unable to create, modify, rename, or delete its contents. This access is required for Mission workers; the Vault is never their writable Workspace or output destination.
_Avoid_: unrestricted Vault access, prompt-only protection

**Mission crew**:
The agent-backed worker Consoles already open and observed available when a Mission is prepared.
Their vendor, model, and effort form the available participant pool without a second agent or
work-level choice. A Mission uses only workers with coherent lanes and names any unused crew. The
terminal plates remain and an assigned lane inherits a bounded excerpt of the worker's prior
transcript as untrusted context, but never its live process or session.
_Avoid_: agent picker, recommended fleet, resumed terminal conversation

**Observed Worker availability**:
What Cockpit actually knows about whether a worker can take a lane, derived only from evidence it
owns: a worker becomes Running when Cockpit sees input submitted to it, and returns to Available
only on a real vendor turn-complete signal. Rendered terminal output is never evidence, and a plain
shell makes no availability claim at all. A vendor without a turn-complete hook stays Running until
it reports through its result file, which keeps the Mission conservative rather than idle-guessing.
_Avoid_: idle prompt, quiet output, inferred completion, pixel state

**Mission hierarchy**:
The responsibility chain from the user through one Orchestrator to assigned workers. The
Orchestrator owns assignment, dependencies, progress, and diagnosis, so one approval carries the
work from plan to a reviewed Result. The user resolves design decisions, meaningful blockers,
recovery after a worker failure, and adoption of finished changes.
_Avoid_: user-managed dispatch, independent worker coordination, automatic recovery

**Mission reinforcement**:
An additional worker terminal proposed by the Orchestrator when the implementation has more coherent
lanes than the open Mission crew can cover. One worker owns one lane; a reinforcement is created only
when Run plan releases the visible Mission plan. Unlike existing crew, its Vendor, model, and effort
must be chosen by the user before the plan becomes releasable.
_Avoid_: sequential second lane, hidden process, inferred worker configuration

**Mission plan**:
The complete, reviewable division of planned implementation work across the Mission crew,
including lane briefs, dependencies, file ownership, and known overlaps. It is presented in the
Orchestrator terminal and Held there until one approval freezes the proposal and a Git Workspace Run
Snapshot, then authorizes every ready lane to start. The source checkout may be dirty; every lane
receives the same frozen state. The accepted plan remains in Cockpit's Run Record rather than being
written into the project. One Mission has at most six lanes and one worker per lane; a larger
indivisible plan must become separate Missions. Work that cannot be split coherently uses one worker
and names why the rest of the crew is unused.
_Avoid_: delegation prompt, agent selection, partially launched run, separate plan panel

**Queued Mission**:
A released Mission waiting for the Workspace's automated-writer lease. Its plan, crew configuration,
and Run Snapshot are already frozen, but reserved terminal sessions remain usable until Cockpit warns
and relaunches them when the lease becomes available.
_Avoid_: running Mission, frozen terminal input, live Workspace snapshot

**Mission brief copy**:
The temporary, read-only copy of one lane's instructions placed in its Mission worktree for reliable
Vendor access. The durable authority is the Mission plan in Cockpit storage; the copy is excluded
from the result diff. It, the temporary branch, and the worktree remain through every nonterminal
state and are cleaned only after a successful Apply Result or confirmed Reject Result.
_Avoid_: project documentation, canonical brief, implementation change

**Mission terminal**:
An assigned worker Console temporarily bound to one Mission lane and its isolated worktree. Its
compact header carries the whole assignment - worker, vendor, lane, and observed state, as in
"T1 · AGY · Layout preview · Running" - so the brief and its progress live in the terminal rather
than a separate Mission panel. It stays there through completion, review, and any retry. Applying or
rejecting the Mission restores the plate as a fresh session in its original Workspace and
configuration; an unused crew terminal is untouched.
_Avoid_: resumable prior conversation, permanent worktree, unused crew, worker brief card

**Mission intervention**:
Not supported for controlled Mission lanes until Pi session continuation is available. Human direction
occurs after Cockpit reports a failure, and a live exploratory exchange remains an ordinary Console
session rather than an unrecorded edit to an automated lane.
_Avoid_: invisible steering, concurrent terminal edits, unrecorded terminal input

**Mission workspace warning**:
The persistent notice on an unused crew Console that still targets the live Workspace while a Mission
uses its frozen snapshot. The Console remains interactive, but later edits may require reconciliation
before Apply Result.
_Avoid_: input lock, shared Mission worktree, guaranteed destination stability

**Returned Mission lane**:
A Mission lane backed by a successful vendor turn, structured worker evidence, its actual diff,
independently passing brief validation, and changes confined to its approved file set. Missing or
contradictory evidence fails closed; an empty diff is valid only for an explicitly review-only lane.
_Avoid_: result file alone, idle prompt, unchecked diff

**Mission retry**:
A user-released new attempt at one failed Mission lane in the same worktree and from the same Run
Snapshot. It preserves prior evidence, continues a healthy agent session or relaunches a dead one,
and repeats the lane's complete validation before it may return. When the prior process died after
an access failure, the new worker reads the saved brief, partial output, progress, and evidence as
context; the dead process itself does not resume. The user may explicitly select a different
Mission-verified Vendor and model for that attempt; each attempt keeps its own agent identity.
_Avoid_: automatic retry, replacement run, validation of only the fix

**Blocked Mission**:
A Mission with at least one failed required lane. Independent lanes continue and returned work is
preserved, while dependants remain Held. The Orchestrator reports the failure and its evidence in
its terminal before any corrective action, then waits: the user may retry, replan, or reject it.
Incomplete Mission work cannot become a partial Apply Result.
_Avoid_: stopped independent lane, partial adoption, silent omission, retry before the report

**Ready for Mission review**:
The state reached after every required lane has returned. Cockpit preserves the lane evidence and
starts review and integration itself, because the user already authorized the whole run once. It is
a transient state rather than a waiting one; natural review intent and `/mission review` remain
equivalent manual fallbacks, and there is no separate review control. Review producing a Result is
never adoption - Apply Result stays explicit.
_Avoid_: second approval, completed Mission, automatic apply

**Mission integration**:
The Orchestrator's review and assembly of returned lane changes in a separate worktree. It begins on
its own once the last required lane returns, and the Orchestrator fixes its findings there rather
than sending work back to a lane; Cockpit must validate the combined result before it can be offered
for adoption.
_Avoid_: worker retry, edit in the user's checkout, unvalidated reviewer fix

**Integration failed**:
A Mission whose combined validation failed in the isolated integration worktree. All worktrees and
evidence remain available, and no corrective model turn or adoption occurs until the user explicitly
directs recovery.
_Avoid_: automatic correction, rejected Mission, partially applicable result

**Interrupted Mission**:
A Mission whose Cockpit process ended before completion. Its plan, Run Snapshot, worktrees, diffs,
logs, and evidence remain durable, but its agent processes do not resume until the user explicitly
chooses the next action.
_Avoid_: background continuation, lost work, automatically resumed writer

**Stopped Mission**:
A user-stopped Mission whose active process trees ended while all plans, briefs, lane worktrees,
returned work, and partial diagnostics remain. Assigned terminals stay in Mission state until the
user resumes the stopped lanes or rejects the Mission.
_Avoid_: rejected Mission, failed lane, partial result

**Mission reconciliation**:
The temporary application and validation of a reviewed Mission Result against a destination that
changed after its Run Snapshot. A clean reconciled diff still requires a second explicit Apply;
conflicts leave the destination untouched.
_Avoid_: direct patch onto drift, implied approval, unvalidated three-way apply

**Console result handoff**:
Cockpit's delivery of a terminal's completed result contents and source identity to the Orchestrator,
without requiring the user to paste files or the Orchestrator to open the terminal's files itself.
_Avoid_: manual paste, shared file access

**Orchestrator draft**:
A local, editable prompt that has not been submitted to the Orchestrator's interactive session.
Drafting consumes no model tokens; submission sends the prompt directly to that session.
_Avoid_: queued model request, extra planning turn

**Blocked Console run**:
A Console run with an assignment that failed or ended without a completed result. Completed results
are preserved and automatic combination is held until the user chooses to retry the assignment or
explicitly requests a partial answer.
_Avoid_: completed run, silent partial answer

**Slot stream**:
The structured, observable output of a harnessed slot turn. Cockpit can detect its completion,
faults, and usage, but the user cannot type into it while the turn runs.
_Avoid_: Console, terminal output

**Slot telemetry**:
The measurements reported or directly observed for a slot turn: duration, input and cached-input
tokens, output tokens, output throughput, and context use when available. Missing values stay
unknown; subscription-backed runs have no claimed dollar cost.
_Avoid_: model score, estimated cost, benchmark

**Terminal outcome**:
The explicit end of one slot turn: completed, stopped, process crash, quota exhaustion, malformed
stream, timeout, or launch failure. Partial output from anything except completed is diagnostic.
_Avoid_: generic error, partial answer, silent retry

**Interrupted**:
The fail-closed state of a run whose Cockpit process ended before the Recipe completed. Its evidence
and worktrees survive, but its Sessions do not and no unfinished work resumes automatically.
_Avoid_: paused, crashed result, resumable run

**Run Record**:
The durable receipt for one automated Recipe run, stored by Cockpit outside the Vault and Workspace.
It preserves inputs, participants, events, outputs, evidence, and outcomes until explicitly deleted.
_Avoid_: Console history, transcript, project artifact

**Partial result**:
A completed Recipe outcome that remains useful despite named slot failures and still satisfies that
Recipe's minimum guarantee. Only Explore may finish below two completed slots; other Recipes stop
when their stated minimum cannot be met.
_Avoid_: degraded success, best effort, hidden omission

**Retry Slot**:
A new attempt at one failed or stopped turn using the same Recipe, ask, Run Snapshot, and Slot.
It cannot replace a completed turn.
_Avoid_: rerun, continue, overwrite result

**Continue Result**:
A new recorded round beginning from a successfully synchronized Synthesize or Coordinate result,
with participating Sessions retained during the current app launch.
_Avoid_: retry, resume stopped run, same Run Record

**Rerun**:
A new run created from an earlier Run Record, using either its original Run Snapshot for
reproduction or the Workspace's current state for fresh work.
_Avoid_: Retry Slot, Continue Result, resume

**Apply Result**:
The explicit transfer of an approved result diff into a chosen checkout as uncommitted working
changes after review. Cockpit never commits or pushes it.
_Avoid_: merge, deploy, automatic adoption

**Reject Result**:
The explicit decision not to transfer a result into a checkout. It may authorize cleanup of its
temporary branches and worktrees, while its Run Record remains.
_Avoid_: delete run, rollback, failed result

**Session**:
One slot's temporary agent memory for one vendor model and one Workspace. It may span Recipe turns
during one Cockpit launch, but never crosses models, Workspaces, or an app restart.
_Avoid_: Console, run, permanent memory

**Context Sync**:
The no-tools delivery of a Synthesize or Coordinate result and its content hash to every
participating persistent Session. Exact acknowledgements prove which slots share the new base.
_Avoid_: summary, notification, automatic continuation

**Scrollback**:
A finished slot card's complete output, kept and scrollable until the plate closes. It is not
automatically written into a Recipe's durable result, so closing the plate discards it.
