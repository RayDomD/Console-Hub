---
name: Cockpit
description: A local desktop cockpit over an indexed personal corpus.
colors:
  ground: "#000000"
  page: "#0A0A0B"
  plate: "rgba(6, 6, 7, 0.88)"
  ink: "#EDEDEA"
  ink-muted: "#8E8E88"
  ink-secondary: "#C4C4BE"
  hairline: "rgba(237, 237, 234, 0.22)"
  rule: "rgba(237, 237, 234, 0.14)"
  defect: "#B24545"
  agent-codex: "#5AA9F0"
  agent-claude: "#F0871F"
typography:
  display:
    fontFamily: "Anybody, system-ui, sans-serif"
  data:
    fontFamily: "Cascadia Mono, ui-monospace, Consolas, monospace"
rounded:
  none: "0px"
components:
  instrument-plate:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
---

# Design

<!-- impeccable:design-schema 2 -->

**Status.** Written from the locked direction, before the build. This is deliberate and against the
default flow, which produces DESIGN.md at finish from the built world. The consequence to watch: a
rulebook written first tends to get defended against reality. Where the build discovers that a rule
here is wrong, change the rule — do not bend the build to protect it. Every value below is a
decision, not a measurement, until the finish review confirms it.

**Viewable at** `docs/design-system/index.html` — the same rules rendered live, with the marks,
plates, controls and layouts drawn by the product's own code rather than pictured. If this file and
that page disagree, the page is telling the truth about the implementation and this file is telling
the truth about the intent; reconcile rather than pick.

**Source of truth.** The direction contract in
`docs/mockups/2026-08-27-cockpit-secondbrain.html` (first child of `<body>`) and its rendered,
running design. `2026-08-27-cockpit-fragment.html` holds the icon families and the rejected ember
variant; it is the earlier record, not the reference.
`PRODUCT.md` owns product truth and the brand pins. Where this file and PRODUCT.md disagree,
PRODUCT.md wins.

---

## The world

You look **out**, not down. Cockpit is a canopy onto the corpus: the second brain is a volume of
indexed knowledge inside a geodesic cage, every particle in it swimming, and the interface is a
small number of hard-edged instrument plates floating in your line of sight. You can turn the
volume with your hand. Pressing it flattens it into a map you can sort.

This refuses the category default it replaces — the agentic-OS panel grid on a dark canvas, which was
built, committed, and discarded. The distinction is not decoration. In the panel grid the corpus is
*content inside a widget*. Here the corpus is the ground you are looking at, and the widgets are
instruments over it.

**Two kinds of matter, and the orbit line divides them.**

- **Inside, in colour: the index.** One node per indexed file — 583 across Vault, Skills and The
  Brewery — coloured by cluster. This is knowledge Cockpit can retrieve from and pack into a session.
- **Outside, in mono: the efforts.** Seven hexagonal markers riding vertices of the geodesic cage.
  These are the repos Cockpit launches into but does not index — including the 115,215 files under
  Studybuddy's `FrontEnd` that PRODUCT.md excludes by name. They scale and fade with depth like
  everything else on the cage, so the boundary is a real object in the space rather than a frame
  drawn on top of it.

That division is the design's one real argument: you can see at a glance what the product knows and
what it merely launches into. **Every node must resolve to a real file.** The moment a node is drawn
that corresponds to nothing, the field is wallpaper and must be deleted rather than tuned.

---

## Colour

**The shell is achromatic.** Colour survives only in layer 0's cluster palette.

An ember-lit variant of this composition was drawn and rejected; it lives in the promoted mockup
marked "not taken". Do not reintroduce warm light as an accent anywhere in the shell.

### Agent rims — transferred to Console Hub

**Ownership moved.** Agent identity rims applied to Console Hub surfaces, and Console Hub is now an
independent application that owns its own `DESIGN.md`
([ADR 0056](docs/adr/0056-console-hub-is-an-independent-application.md)). The rule below is the
authored specification, retained here as the historical record and as the text Console Hub inherits.
**Cockpit no longer has a shell colour exception** — nothing in Cockpit renders an agent rim.

An automated slot or stream carries a **2px top rim** and a restrained vendor-tinted card surface,
keyed only to its vendor. The colour is a stable identity cue, not a status channel: it never
changes on run, completion, fault, hold, queue, or wants-you. Slot glyph, label, and stable position
remain the non-colour identity channels.

| Vendor | Rim | Token | Rule |
|---|---|---|---|
| Codex | blue `#5AA9F0` | `--agent-codex` | solid 2px top rim, 14% card tint |
| Claude | orange `#F0871F` | `--agent-claude` | solid 2px top rim, 14% card tint |
| AGY | rainbow | `--agent-agy` | seven-stop 2px top rim, restrained violet 14% card tint |

The AGY rim is the only gradient in chrome, and it exists to identify a multi-model vendor rather
than decorate a surface. It never appears in text, a button, a border below 2px, a wire, or a state
treatment. The rim vanishes only when the slot has no vendor.

### The cluster palette

Seven hues at one mid-luminance band, so no cluster dominates and each reads on both grounds.

| Cluster | Hue | Count |
|---|---|---|
| ATLAS · notes | `#C9A2F0` | 117 |
| Skills | `#F0871F` | 111 |
| Docs | `#E86FD0` | 93 |
| The Brewery | `#5AA9F0` | 82 |
| Sessions | `#3FD0C8` | 76 |
| Meta · standards | `#F0D24A` | 58 |
| Inbox | `#7BE38C` | 46 |

Cluster colour appears in exactly two places: the point cloud and the explorer legend that names the
clusters. It never appears in plates, buttons, state, icons, or agent rims.

**Colour never carries state.** Running, done, failed, wants-you and idle read as glyph form plus
label, regardless of hue. Nothing in the product requires colour vision to operate.

**Amended 2026-08-29.** The active Explorer defect filter is the one scoped exception: matching
marks retain their cluster colour and add a subdued red dashed outline. Its enablement and opacity
are tuned locally in Explorer; it is not a second palette or a general shell state hue.

| Token | Value | Role |
|---|---|---|
| `--ground` | `#000000` | The field. True black, not near-black — the ring's glow depends on it |
| `--page` | `#0A0A0B` | Application chrome outside the field |
| `--plate` | `rgba(6,6,7,.88)` | Instrument plate fill, matte |
| `--plate-edge` | `rgba(237,237,234,.22)` | Plate hairline, 1px |
| `--tick` | `rgba(237,237,234,.5)` | Corner tick on a plate |
| `--ink` | `#EDEDEA` | Primary text and the ring |
| `--ink-dim` | `#8E8E88` | Labels, paths, secondary data |
| `--ink-idle` | `#5A5A55` | Stalled or inactive content |
| `--rule` | `#2A2A2C` | Dividers in chrome |

**State never depends on tone alone.** Five states, each with a glyph form and label as well as an
ink value:

| State | Reads as | Never |
|---|---|---|
| Running | `▮▮▮▮ RUN 2m14`, full-weight `--ink`, filled glyph; shows when the shell marks command start | A green dot |
| Done | `▮▮▮▮ DONE 41s`, dimmed `--ink-dim`, filled glyph; shows on exit code 0 | A grey dot alone |
| Failed | `▯▮▯▮ EXIT 1`, full `--ink`, broken glyph in a 1px box; shows on a non-zero exit | A red badge |
| Wants you | `CALL` in a 1px stroked box; shows when the agent's own hook asks for attention | A red badge, and never a pulse |
| Idle | `▯▯▯▯ IDLE`, `--ink-idle`, hollow glyph; shows while sitting at a prompt | A grey dot alone |

Running and Done deliberately share a filled glyph: they are both completed or active command work.
They separate on their labels and ink level; Failed is the only broken glyph, so an error never
depends on tone alone.

The wants-you signal **arrives once and holds**. It does not pulse, breathe, or animate on a loop.
This survived from the discarded world and is binding.

## Both themes

Both themes are first-class and designed, not inverted. The dark theme is described above and is the
primary. The light theme is **not yet designed** — it is a real deliverable and an open decision, and
a naive inversion of a black field with a glowing ring will not work. Treat it as a design task, not
a token flip. Flagged here so it is not discovered at ship.

---

## Layer 0 — the second brain

**A 3D rest state and four flat layouts.** Every node carries all five coordinate sets and
interpolates between them. Nothing is spawned or destroyed at any boundary — that is what makes
every transition continuity rather than a cut. At rest, layer 0 is a **ball**: nodes carry 3D
coordinates and are projected through the tumble. Released, they flatten into one of four 2D
layouts, easing 560ms between any two. The rest state is not one of the four — it is the volume the
four are flattenings *of*.

### The four navigation rungs

The Second Brain surface operates through four continuous navigation rungs. Back walks back exactly one rung at a time. Escape does the same, except that an active Explorer search is a transient substate: the first Escape clears the query, and the next Escape leaves Explorer.

- **Rest** — Full-bleed 3D volume inside the geodesic cage. Drag turns the trackball; Enter, Space, or clicking releases the ball into the Explorer.
- **Neighborhood** — One cluster opened into a continuous, separated elliptical field. Real link
  degree orders files from the centre outward without confining orphans to a narrow rim. Idle links
  are a sparse subset of actual relationships. Hover reveals the focused file's direct links.
- **Explorer** — Full-screen 2D graph composition (Force, Circle, Hex, Rings). Search (`/` key focus) pulls matching nodes outward with labels while non-matches recede and dim. The 7-row legend displays live per-cluster counts and allows toggling cluster muting (dimming marks to `0.08` opacity). Stray notes flagged by the authoritative health script in `scope.enforced` draw a dashed `SECONDARY_INK` ring around their mark.
- **Sheet** — Nearest-node drill opens a cluster as a **column index**: one column per top-level
  folder, each heading carrying its true file count and a proportional degree bar, with its files
  listed beneath and still one press from the Reader. Non-matching filter entries dim in place
  without reordering rows, and `·CONT` continuations carry their folder's count. Amended 2026-08-31
  from a single flat list of rows: at Skills' scale a flat run of rows tells you nothing the number
  did not, while columns show which folders are heavy and which are stubs.
- **Reader** — Pressing a Sheet row opens a read-only surface portalled above layer 1. Markdown files open in CodeMirror 6 with live/dead wikilink resolution and metadata header strip; text files render with syntax highlighting; images/videos preview natively; binary types present a clear refusal notice and a Reveal in Explorer action. Back to Sheet and Escape return to the Sheet.

- **Ball (rest only)** — core-dense sphere at `r = rnd()^1.7 × 0.86` with a 5% outer halo, cluster
  direction blended `0.62` toward one of seven evenly-spread 3D axes, so clusters occupy soft
  regions of the volume. Drawn at `0.84 ×` layer radius against a `1.06 ×` cage.

  > **Amended 2026-08-31, from the composed rest state.** This was `0.52 ×` against a `1.30 ×` cage,
  > which left a dead ring of empty frame between the corpus and its own boundary and made the
  > volume read as a smear off to one side. The two values move together: changing one alone
  > reopens the gap. Three further composition rules landed with them — the corpus, cage and rim now
  > share **one origin** where they previously had three; the seven cluster axes spread evenly over
  > the sphere rather than crowding a hemisphere; and a cluster's share of the volume is weighted by
  > the **log** of its file count, so Skills stays visibly the largest without swamping the other
  > six. Density is biased toward the shell so the sentinel is never buried inside its own corpus.
  Painter-sorted back-to-front and depth-shaded, so it reads as a solid body, not a flat scatter.

- **Rings** — seven angular sectors, one per cluster, each filled with seven concentric arc bands
  (radius `0.335 → 0.650`; outer bands hold proportionally more nodes as arc length grows).
- **Force** — seven irregular cluster bodies at hand-placed centres, nodes in a disc around each.
  Reads as what the links say. The default on release.
- **Circle** — **two rings, and the split is an argument.** Not seven.

  **Skills is the inner ring** at `0.46 ×` layer radius, because it is what the OS actually runs
  on: the vault types skills as `reference`, "a procedure consulted and followed — operative".

  **Everything else shares one outer ring** at `1.00 ×`, divided into contiguous arcs sized by
  cluster count with a `0.05 rad` gap between them, so each cluster keeps its own span and its own
  label. Arc order runs `Meta · standards → ATLAS · notes → Sessions → Docs → The Brewery → Inbox`.

  Seven separate rings were built first and rejected: a gradient of seven radii reads as a ranking
  nobody can hold, and it diluted the one thing worth saying. Two rings say it — this is what runs
  the OS, and this is everything else. Changing the split is changing the claim.

- **Hex** — hex-spiral packing per cluster at `0.0295` cell pitch, giving solid cluster plates.
- **Outside, always mono.** The seven efforts ride vertices of the geodesic cage as hex markers,
  scaling and fading with depth like the cage itself, so the boundary is an object in the space
  rather than a frame on top of it. They fade out on release. (An earlier pass used three orbit
  ellipses; the cage replaced them.)
- **The geodesic cage.** An icosahedron subdivided once, rotating with the ball. Edge alpha follows
  depth (`0.030 + 0.115 × max(0, meanPerspective − 0.80)`), so the far shell recedes and the near
  shell reads. It fades out on release — flat layouts have no volume to bound.

  > **Amended 2026-08-29, from the composed production view.** With the Skills and Cockpit-status plates
  > present, that edge range competed with the corpus. The resting foundation uses
  > `0.020 + 0.080 × max(0, meanPerspective − 0.80)` so the cage remains a boundary while indexed
  > matter stays focal.
- **Ground.** A faint hex weave at `rgba(140,150,175,.055)`, 17px cells, dimmed 55% on release.
- **The Vault sentinel.** At Rest, a compact achromatic seed sits at the shared centre of the
  corpus, cage and rim. Opening Second Brain unfolds the full gimbal: three chamfered rings on
  independent value-noise axes, bearing pins, and a solid core. Its small independent canvas keeps
  the mechanism alive without repainting the entire settled graph. There is no warm shell mark.

### Quiet graph interaction

Approved 2026-08-31 after the working motion preview. This replaces segmented cluster shells,
620ms inward collapse, and narrow degree bands. The existing Rest composition and file type/trust
vocabulary remain in place.

Explorer anchors are simple outlined hexagons with a solid nucleus and one label. One rendered,
undimmed cluster owns one anchor; the separate achromatic Vault handle names positioning, never a
file or a navigation target. Pressing a cluster anchor opens its Neighborhood immediately with a
440ms arrival transition. No collapse gate holds up interaction. Idle connections stay faint and
sparse. Hover traces real direct links; unlinked files remain unlinked. Explorer and Neighborhood
retain the Layer 0 particle field, controlled through the same Tune settings. The luminous rim
remains Rest-only.

Dragging a file, cluster handle, or Sentinel temporarily displaces it. Explorer file motion stays
within 6 CSS px of its cluster anchor, scaled down with the viewport. Release returns the dragged
mark home over 420ms; regrabbing interrupts that return without changing home. Empty-space panning
persists, scrolling zooms around the pointer, and Reset positions restores the camera and handles.
Keyboard positioning remains available. Pause and reduced motion hold the current motion phase;
the settled Explorer canvas sleeps until an interaction, layout, snapshot, or data change requires
painting.

### Nodes are marks, not dots

A node encodes three things at once, and only one of them is colour. This is why the field stops
reading as generic particles: **shape is type, fill is trust, colour is cluster.**

The five types are the vault's own closed vocabulary, read from `.vault-standard.yml` — not
invented, and not extendable. The standard says in bold *"Do not invent a sixth."*

| Type | Mark | Trust, in the standard's own words |
|---|---|---|
| `resource` | hollow ring | "captured from outside — quotable, not endorsed" |
| `reference` | filled square | "a procedure consulted and followed — operative" |
| `concept` | filled diamond | "Ryan's own claim" |
| `session` | hollow hexagon | "a bounded effort" |
| `moc` | dot inside a ring | "entry point to a topic" |
| *off-vocabulary* | a cross | outside the standard — a violation the health check flags |

**Fill is the payload.** Filled means endorsed, operative, or owned. Hollow means captured but not
claimed. That is `PRODUCT.md`'s "cite or don't claim" made visible: you can see at a glance how much
of the corpus is genuinely yours. The real ratio is worth knowing — of 61 typed notes, **41 are
`resource` against 7 `concept`**, so the honest picture is a vault heavy with captured material and
light on original claims. The design should not flatter that; it should show it.

**Ring labels.** In the circle layout every cluster's centroid collapses onto the hub, so labels
would stack at the centre. Skills labels above its own ring; each outer cluster labels the midpoint
of its arc, pushed to `1.075 ×` the ring radius so text never sits on its own nodes. Both positions
are blended by how much the circle layout is active, so labels travel with the nodes rather than
jumping at the boundary.

**Rendering.** Each mark draws in two passes: an additive bloom **drawn from a pre-baked sprite** at `3.4 × r` and `0.30 α`, so
marks sit *in* light rather than on flat black, then the crisp mark. Filled marks above `2.6px` take
a small white specular at `(−0.34r, −0.38r)` so they read as objects rather than stickers. Stubs —
scaffolded but unwritten — render at `0.45 α`.

**Below `1.6px` every mark collapses to a plain dot.** This is deliberate. At rest the volume is
texture and no one is reading individual types; shape resolves as nodes grow, through the node-size
slider or the released layouts. A shape nobody can see is not information, and pretending otherwise
would be the decoration this file keeps warning about.

> **Amended 2026-08-28, from the production-density critique.** The live corpus made that collapse
> erase type and trust from most marks. Type glyphs now survive down to `0.9px` and rest marks clamp
> to `1.05px`; bloom still begins above `1.6px`, avoiding hundreds of tiny per-frame gradients.

The controller's type key is rasterised from the same `drawMark` function that draws the field, so
the key cannot drift from what it documents.

### Tuning it

The cockpit carries its own parameter panel, collapsed behind a **TUNE** control at the
**bottom-right**. It is collapsed by default and hidden entirely in the released layer, because
`PRODUCT.md`'s bar is *opened, not admired* — a cockpit that greets you with eight sliders has
already failed that test.

> **Amended 2026-08-31.** Tune defaults **bottom-right**, moved from bottom-left where the Skills
> plate covered it — the one control the panel is opened by was unclickable. Cockpit status lifts to
> make the room. Originally, from the approved layering composition on 2026-08-29:
> Skills is top-right, Cockpit status is bottom-right, and the on-demand health detail is top-left.
> These are starting homes, not protected lanes: every layer-1 instrument can be moved, and its
> surface-local position persists.

| Group | Parameter | Range | Default |
|---|---|---|---|
| Motion | Swim | 0 – 2.5 | 1.00 |
| Motion | Tumble | 0 – 2.5 | 1.00 |
| Volume | Radius | 0.24 – 0.92 | 0.84 |
| Volume | Node size | 0.2 – 1.6 | 0.59 |
| Volume | Bloom | 0 – 2.5 | 1.00 |
| Cage | Radius | 0.85 – 1.90 | 1.06 |
| Cage | Line weight | 0 – 2.5 | 1.00 |
| Composition | Shell bias | 0 – 1 | 0.72 |
| Composition | Cluster spread | 0 – 1 | 0.62 |
| Composition | Mass weighting | 0 – 1 | 1.00 |
| Explorer | Anchor size | 0.4 – 2 | 1.00 |
| Explorer | Segment gap | 0 – 0.4 | 0.16 |
| Explorer | Segment depth | 0.1 – 0.5 | 0.26 |
| Explorer | Sentinel size | 0.4 – 2 | 1.00 |
| Explorer | Collapse speed | 0.25 – 2.5 | 1.00 |
| Explorer | Bloom floor | 0.8 – 4 | 1.6 |

> **Amended 2026-08-31.** Seven rows became sixteen. **Composition** tunes how the corpus arranges
> itself rather than how large it is; **Explorer** tunes the released layer's own geometry and sits
> on the Corpus tab because a cluster anchor is the corpus gathered, not a different material.
>
> **Bloom floor is not a taste value.** Below it, per-mark bloom is not drawn at all. Live
> per-node radial gradients at corpus density hung the renderer outright — twice during the design
> pass — so bloom is baked into one sprite per hue and skipped beneath this radius. Raising it far
> is a legibility choice; lowering it toward zero is a performance cliff.
>
> **A rim radius and rim weight were added here and removed the same day.** The luminous boundary
> belongs to the ground layer, which has drawn it since the fragment field was built. A second arc
> in the corpus layer shipped two visible boundaries. The corpus copy was deleted rather than
> tuned, and its two sliders went with it: a control that drives nothing is the painted control
> this file bans. **The world has one boundary, and `ringR` on the Ground tab is the knob that
> moves it.**

The panel is **tabbed**, and Ground is a tab beside Corpus rather than a group inside one. The two
tune different things — the corpus is what Cockpit knows, the ground is the working matter outside
it — and they have eighteen and sixteen parameters respectively, which is more than one list can hold
without becoming a list nobody reads to the bottom of.

Ground's eighteen are recorded in `docs/plans/2026-08-27-fragment-ground.md` and shipped in
`shared/ground.ts`. The **Hex weave** row that stood here is retired with the honeycomb it drove.

Rules that make this a control panel rather than decoration:

- **Every slider drives the real render.** Same standing rule as the explorer's controller — a
  control that does nothing is a lie the rest of the product would have to keep.
- **Settings persist to `cockpit.config.json`**, through the same seam a hand edit of that file
  goes through. This is the config pin demonstrated rather than asserted: *"a folder move must not
  be a code change"* applies to appearance too.

  > **Amended 2026-08-28, from the build.** This said `localStorage` under `cockpit.layer0`, which
  > was right for a mockup served from a port that changes every session. It is wrong for the app:
  > two stores would mean a stored setting could silently outrank the file the user is reading, and
  > the panel and a hand edit would be two ways to do one thing. One file, one truth. The write is
  > coalesced and flushed on quit, because a slider drag fires at frame rate and a deferred write
  > that can be lost is worse than no persistence — it works until the one moment it matters.

- **Reset is scoped to the open tab.** Resetting the corpus because someone wanted the ground back
  would be the panel lying about what it did.

- **A destructive control is distinguished by weight and position, never by hue.** Reset is the
  quieter of the two actions, not the louder one. There is no red in this world to reach for.

- **Node size is shared** with the explorer's controller and the two stay in step, because they are
  one value, not two that happen to look alike.
- **Reset restores each tab's own tuned defaults** — Corpus's from the table above, Ground's from
  `shared/ground.ts`, which is where they are written down once and read by everything that needs
  them. Never a re-typed literal: a duplicated number is a drift waiting to happen.
- **The panel swallows its own pointer events**, so tuning never starts a drag on the trackball
  underneath.
- Scrollbars in both panels are restyled; a default light scrollbar on a matte plate is a hole in
  the world.

### Turning it by hand

The volume is a `role="button"` that is also a trackball. Both gestures live on one surface, so the
disambiguation is part of the spec, not an implementation detail:

- **Drag** (pointer events, so touch and pen work) rotates on X and Y at `0.0062 rad/px`.
- **Release throws it** — velocity carries and decays at `0.9955^dt`.
- **The hand wins.** Grabbing sets the noise-tumble gain to 0; on release it eases back to 1 over
  2.4s. The volume never fights your grip, and never freezes permanently either.
- **Arrow keys** turn it `0.09 rad` per press, so the gesture is not mouse-only.
- **Under 5px of travel is a click**, which opens the explorer. Above it, the drag consumed the
  gesture and nothing opens.
- Cursor is `grab`, then `grabbing`. Dragging is disabled once released into the flat layouts —
  there is no volume left to turn, and the controller owns motion there.

### Behaviour when pressed

The field is a `role="button"` with `tabindex="0"`, opened by click, Enter or Space, closed by
Escape or the explicit back control. Released rungs expose `Back to Rest`, `Back to Explorer`,
and the Reader exposes `Back to Sheet`; these controls use the same achromatic, chamfered plate
language as the rest of the cockpit.

| Moment | Timing | Rule |
|---|---|---|
| Launch assembly | 760ms, 55ms stagger per cluster | The cage draws, then nodes settle **inward from the rim** (`1.30 → 1.0`), largest cluster last. **Non-blocking** — plates are live from frame one |
| Ball → flat | 520ms `cubic-bezier(.16,1,.3,1)` | **Every node is a shared element**, staggered `0.035` per cluster so bodies pull apart in sequence. Plates leave in the direction they live; panel from the right at `+120ms`, back control from the left at `+100ms` |
| Flat → ball | 440ms | Regroups faster than it released |

### Motion grammar — noise-driven, never a loop

Binding, and the difference between a live organism and a screensaver. **Summed sines are
forbidden here**: they were tried, and a sum of sines is still periodic, so the eye learns it.
Everything below is driven by value noise over a 512-entry table, or by randomly scheduled events.

| Channel | Drive | Rule |
|---|---|---|
| **Particle swim** | three streams per node — `vns(t/(1900+w·2600))`, `vns(t/(2400+w·2100))`, `vns(t/(3100+w·1700))`, each offset by that node's phase, amplitude `0.135` | **This is the life.** Every particle wanders in X, Y and Z at its own tempo, so the volume is never still and never moves as one body. Flat layouts swim too, at `0.42 ×` in force and `0.22 ×` in hex, tight enough that structure stays readable |
| **Tumble** | three independent signed noise streams on X, Y, Z — `vns(t/3100+41)`, `0.34 + vns(t/2200+7)·1.30`, `vns(t/4300+83)` | The volume turns on all three axes at once, each on its own schedule, each able to reverse. The streams are independent, so no orientation recurs. **A single-axis constant spin is explicitly wrong** |
| **Wander** (flat) | `vns(t/2600+17)` scaled by spin | Signed noise centred on zero, so flat layouts drift, stall and reverse |

**Removed, deliberately: global breath and cluster pulse.** Both were built and both are gone. A
radius that swells and clusters that beat read as *one organism flexing*; the corpus is not one
organism, it is 583 things. Per-particle motion says that and the other two contradicted it. Do not
reintroduce either — and note the alpha twinkle went with them, because blinking is pulsing by
another name. Life here is displacement, not brightness.

`vn` is value noise with smoothstep interpolation; `vns` is the same, signed around zero.

Under `prefers-reduced-motion` all three channels stop dead. The field is completely still and
fully legible.

---

## The controller

Appears with the released layer. **Every control moves real nodes** — there are no painted controls
in this design, and adding one would be a lie the rest of the product would have to keep.

| Control | Binding |
|---|---|
| Layout | Switches among the four layouts above, easing 560ms |
| View | `Clusters` labels bodies by cluster name; `Folders` labels them by top-level path |
| Spin | Scales the tumble and the flat-layout wander only. At 0 the field holds its orientation and **the particles keep swimming**, because the swim is the life, not the rotation |
| File names | Draws filenames beside nodes above a size threshold. **Off by default**: at 583 nodes it is deliberately unreadable, which is the honest demonstration rather than a hidden failure |
| Link springs | Raises hub-link weight and opacity and pulls bodies inward by `1 − springs·3.2` |
| Node size | Global radius multiplier |
| Expand / Collapse | Steps the spread multiplier `±0.18`, clamped `0.5 → 1.5` |
| Bake settings | Writes the configuration into the corner readout, standing in for persisting to config |
| Legend rows | Click to mute a cluster: drops to 8% alpha, label and bloom removed |
| `/` | Focuses search while the explorer is open |

**The controller is achromatic.** The reference paints its sliders and active states orange. Colour
here is pinned to the corpus, and a controller is chrome, so the active state is a full white-on-black
inversion. Legend swatches keep their hues because they *name* clusters. Changing this would cost the
rule that colour means "this is the second brain".

**Why morph between layouts instead of zooming.** Scaling one arrangement says "closer". Morphing
between arrangements says "this is the same material, differently organised" — which is the actual
claim, because rings and circle are orderings imposed for scanning while the force bodies are what
the links really say.

---

## Type

| Role | Face | Setting |
|---|---|---|
| Wordmark | Anybody | `wdth 130`, `wght 620`, 13px, `letter-spacing .22em`, uppercase |
| Display / headings | Anybody | `wdth 112–130`, `wght 640–720` |
| UI text | Anybody | `wght 400–500` |
| Data, paths, counts, durations, readouts | Cascadia Mono | 9–11px, `letter-spacing .10em` for uppercase labels |
| Plate label | Cascadia Mono | 9px, `.16em`, uppercase, `--ink-dim` |

Both faces are **self-hosted**. The app opens offline and must not wait on a CDN — the mockup's
Google Fonts link is a mockup convenience and must not survive into the build.

The product argument for Cascadia: the embedded terminal renders in it, so widget data and terminal
output speak in one voice. This is not a habit choice and should not be revisited casually.

---

## Instrument plates

Plates are **not glass**. Glass — gradient body, specular top rim, dark bottom rim, soft cast shadow
— was built and discarded. Never reintroduce it.

- **Fill** matte `--plate`. No gradient, no backdrop blur, no inner glow.
- **Edge** 1px `--plate-edge`, uniform on all sides.
- **Corners cut, not rounded.** `clip-path: polygon(0 0, calc(100% - 11px) 0, 100% 11px, 100% 100%, 11px 100%, 0 calc(100% - 11px))` — the top-right and bottom-left corners are chamfered at 11px. This is the world's signature and applies to every plate.
- **One corner tick** — a 7px two-sided square in `--tick` at the corner opposite the widget's anchor edge.
- **Header** mono label, `.16em`, uppercase, with a 1px `rgba(237,237,234,.14)` rule beneath.
- **Radius is 0 everywhere.** Both the old sharp-edge commitment and the old large-radius commitment
  are spent; the chamfer replaces both and carries the softening on its own.

Plates are **movable and their positions persist** — that is the two-layer pin. A plate is never
docked to a fixed slot.

### The fan plate

One plate carries an internal **docked sidebar** on its leading edge: the question fan. The plate
itself still drags and persists like any other; the dock is inside it, not against the field. The
sidebar holds fan controls, then the slot list, then the existing `skills[]` registry rendered
unchanged — one registry, two presentations, so adding a workflow button stays a config edit.

Phase 1 opens the fan as a layer-1 plate. The graduation onto the Hub surface described here
**transferred to Console Hub** with the rest of the Hub, so it is that product's rule now: the plate
is not remade as a canvas card and is never a fixed overlay above the Hub, and moving it changes its
container, not its controls, lifecycle, or saved arrangement. In Cockpit the fan remains a layer-1
plate with nowhere further to graduate to.

Its main column reads causally top to bottom: **ask → criteria → answers → comparison**. `Enter`
fires; there is no arm ceremony, no countdown, and `Stop` is an ordinary control. Design at
`docs/mockups/2026-08-31-question-fan-plate.html`.

A slot is an **answerer**, not a coding agent temporarily constrained from writing. It may receive
a workspace or none; its read-only boundary comes from removing write tools, and it never reads the
user's personal instruction file.

#### Motion and tactile feel

The fan is one **mechanical relay**, not a field of independent loading animations. Motion follows
the causal column and is driven by real lifecycle events in production:

| Moment | Timing | Rule |
|---|---|---|
| Enter fires | 140ms | Ask travels 1px and a 1px achromatic cut crosses it once. This acknowledges the keystroke; it is not an arming state |
| Criteria fixed | 260ms `cubic-bezier(.16,1,.3,1)` | The written checklist cuts in from the leading edge. No answer card moves before this event |
| Workers start | 220ms, simultaneous | All cards pull apart from one centre. No sibling stagger: the four processes start in parallel, so the motion must not imply an order |
| Worker completes | 150ms | That card seats downward by 2px once, then holds. Status changes by glyph and label; slot identity does not brighten, travel or pulse |
| Architect starts | 280ms | The comparison panel closes the circuit from top to bottom only after every worker has completed |
| Stop | immediate | Cancel pending presentation motion and latch `STOPPED` with no eased tail. A safety action must not feel queued |

Controls provide visual tactility through a 1px press, a hard border response, and an immediate
state label. Cockpit targets mouse and keyboard on Windows, where a dependable haptic actuator is
not available, so this surface does not call vibration APIs or add confirmation sound. The visual
press is the haptic proxy.

Nothing in the sequence loops. There is no spinner, shimmer, bounce, breathing status, or animated
slot treatment. Live progress comes from stream events and changing data, not decorative motion.
The mockup's timers only rehearse those event boundaries. Under `prefers-reduced-motion`, travel and
cuts disappear while the same labels, ordering, and interruption semantics remain.

#### Failure, recovery, and interruption

The fan fails closed without discarding good work. Every lifecycle event carries a run id; after a
stop, restart, close, shutdown, or crash, events from an older run are ignored. `Enter` and Retry
also latch while their operation is live, so repeated input cannot spend twice.

| Event | Durable result | Recovery |
|---|---|---|
| Worker exits before `message_end` | That slot becomes `PROCESS CRASH`; any partial stream is diagnostic only, never an answer | Retry that slot only |
| Vendor quota is exhausted | That slot becomes `QUOTA`; there is no automatic retry or hidden wait | Retry deliberately when quota is available |
| Stream is malformed | That slot becomes `STREAM INVALID`; retain raw output for diagnosis and fail the slot closed | Retry that slot with a fresh process |
| Architect fails | Fixed criteria and every valid answer remain; Cockpit does not write a partial document | Retry the architect only from the retained inputs |
| Two or more workers succeed | The architect may run after every slot is terminal; output is labelled `PARTIAL ADVISORY` and names absent slots | A recovered slot causes a new comparison that supersedes the partial one |
| Fewer than two workers succeed | No comparison runs; agreement from one answer is not a fan | Retry failed slots or start a new run |

Retry never reruns a successful worker and never changes the original question or fixed criteria.
An architect document becomes visible only after a valid completed stream; production writes it
atomically so an architect failure cannot leave a plausible-looking partial file at the promised
path.

`Stop` cancels presentation motion and kills every pending process tree immediately. Completed
answers and measured spend remain visible, but Stop never launches a partial comparison. Pressing
Enter afterward starts a new run rather than resuming the stopped one. Closing the plate applies the
same teardown before removing it. Application shutdown kills all fan process trees and records the
last durable terminal snapshot before exit.

After an application or process crash, startup reconciliation never assumes a saved pid is still a
valid worker. A stale run opens as `INTERRUPTED`, restores completed answers and diagnostic streams,
and offers `Restart as new run`; it does not resume or merge automatically. These states remain
achromatic and readable through glyph plus specific label under reduced motion and high contrast.

## The Console Hub — transferred ownership

**This section no longer describes Cockpit.** Console Hub is an independent application with its own
repository, installer, storage, and design system
([ADR 0056](docs/adr/0056-console-hub-is-an-independent-application.md), and
[the extraction plan](docs/plans/2026-09-12-console-hub-extraction.md)). Everything below is the
authored specification as it stood when Console Hub was an embedded Cockpit surface. It is retained
under D11 as the historical record and as the text Console Hub's own `DESIGN.md` inherits.

Cockpit keeps no Hub surface. Its only relationship to Console Hub is the launch verb in
`PRODUCT.md`: hand over an optional Workspace via `consolehub://` and receive a typed result. Read
what follows as Console Hub's design, not as a rule binding on Cockpit, and make changes to it in
the Console Hub repository rather than here.

The Hub is a named full-screen **surface** for **Consoles** — shells in a pty, not agents. It is
not another name for the free canvas that later lives inside it. A layer-1 door plate is the
explicit entry point. Once inside, `ConsoleView` is a movable Console plate on the Hub, never a
`position: fixed` overlay painted above it; the question fan can live alongside it as the same
plate introduced in phase 1.

The Hub surface lands before its spatial machinery. The free canvas, pan and zoom, card sizes,
focus mode, and Rail are a subsequent capability of that surface, not prerequisites for entering it.

### Recipes, Stack, and the run plate

The Hub begins with an explicit **Recipe**: Explore, Synthesize, Debate, Coordinate, Validate,
Direct, or Console. No Recipe is preselected. The selected Workspace Explorer stays at the top of
the leading sidebar. Its lower **Ways to work** section names all seven choices in a fixed vertical
order. It is a chooser, not a second navigation system; one selected Recipe expands into the single
dominant run plate in the field.

One persistent **Live Stack** of one to five slots sits at the trailing edge. It is configuration,
not a scorecard: slot name, role, vendor, model, and effort are compact mono facts. The 2px vendor
rim joins authored glyph, label, and stable position as identity evidence, but never replaces them.
Changes persist for future runs; the run itself displays its frozen snapshot so a live result cannot
silently change meaning.

The run plate has one clear causal spine: **Ask → Recipe stage → slot streams → result**. The Ask is
the one large line of natural language. Recipe stages are one continuous ruled strip, with the
current stage inverted; they are not progress dots. Every slot stream is a full-height plate with
its output and raw tool activity scrollable in place. It reports only observed duration, tokens,
throughput, cache, and context data. Missing telemetry remains `UNAVAILABLE`; a subscription-backed
run never invents a dollar cost.

The recipe makes its guarantee visible in the plate, not in an explanatory tooltip: Explore keeps
answers separate; Synthesize holds before one fresh writer receives proposals; Debate ends with
attributed positions; Coordinate shows a held dependency graph and parallel worktrees; Validate
shows gate first, RED baseline, and Builder attempts; Direct is one resumable harnessed session;
Console is a user-driven interactive pty. Console plates and recipe-run plates can share the Hub,
but their runtime vocabulary never blurs.

**The Hub has one visual peak: the active run.** The rail, Explorer, Stack, and records are quiet
infrastructure. A held state uses a full-width 1px framed release bar in the causal gap, not a modal;
an active writer queue is a named mono state on the door and run plate. Recipe plates keep Stop Slot
and Stop Run as explicit controls. Mission is the terminal-first exception confirmed by D7: its exact
`stop` command is consumed locally by Cockpit and never forwarded to the agent. Escape only navigates
or releases focus and never cancels work.

### Wire legs

Wires are persistent connections between consoles. Their legs are distinguished by form, never
colour: the shell is achromatic, so hue cannot carry the difference.

| Cue | Out leg · brief | Return leg · review |
|---|---|---|
| Line | solid, `--ink`, 1.2px | broken stroke (`7 5` dash), `--ink-dim`, 1px |
| Head | filled triangle | open chevron, never filled |
| Label | above the line | below the line |
| Lane | upper (`-18px`) | lower (`+18px`) |

The broken return stroke is on-family: the Fragment icons are angular, with cut corners and
deliberately broken strokes. Its hollow head against the out leg's filled triangle makes the same
move as `▯▯▯▯` against `▮▮▮▮`. The legs are not mirror images: the out leg carries a brief file
path; the return leg carries a review command.

### Loops

A **Loop** is two opposed wires between the same pair of consoles. Its legs separate into their two
lanes, with a 1px brace on each side and a `LOOP · ROUND n / 5` badge above in `--ink`. A Loop is
derived, never declared: detach either leg and its survivor demotes to a plain Wire. It caps at
five fix rounds, with one free round when the acceptance gate itself is repaired
(`docs/adr/0013-acceptance-is-fixed-before-the-answers.md`).

### Canvas and Cards

When enabled, the Hub canvas supplies pan, zoom, free placement, and Wires that bow around
obstacles. This is a sanctioned second spatial grammar. Instrument plates still drag on an 8px grid
and never dock to fixed slots in layer 1; the Hub is its own full-screen surface, like the
Explorer, so its task is spatial routing rather than plate placement.

Cards have three sizes: **strip** is minimized but still running, wired, and present on the Rail;
**card** is the canvas default and peeks at output; **focus** fills the surface, dims the canvas,
and shows the full terminal. `Esc` is two-stage: inside a focused Console it releases to the canvas;
only a second `Esc` leaves the Hub. Focus mode owns the keyboard, so a persistent bar states that
fact and offers an explicit release control instead of relying on the user guessing `Esc`.

## Corner readouts

Four mono readouts sit at the field's corners at 9px `--ink-dim`, outside every plate: index scope
top-left, timestamp top-right, vault path bottom-left. They are ambient truth, never interactive.

---

## Icons

**The Fragment family**, chosen against five alternates. Authored SVG only — no icon library, no
unicode glyphs, no emoji.

- **14px viewBox**, `stroke-width: 1.4`, `fill: none`, round caps and joins.
- **Angular, with cut corners and deliberately broken strokes** — the same chamfer language as the
  plates. An icon that reads as a smooth rounded pictogram is off-family.
- The thirteen authored so far: Projects, Learning, Knowledge, Launch, Gather, Terminal, Search,
  Wants you, Wire, Loop, Minimize, Expand, Release. The reference geometry is split, and the split
  is easy to get wrong: the original eight are drawn in `docs/mockups/2026-08-27-cockpit-fragment.html`
  — **not** in the promoted mockup, which uses only two of them — and the five Console Hub icons are
  drawn in `docs/design-system/index.html`. Those five are **copied to Console Hub** under its own
  ownership; the family rules above bind both products, and the eight Cockpit icons stay here.

Any new icon is drawn into this family by hand. Reaching for Lucide or Heroicons for "just one
missing icon" is the specific failure this rule exists to prevent.

---

## Motion outside layer 0

Layer 0 owns its own grammar above; this covers everything else.

- **The gather** is the focal moment: marked notes leave their clusters, travel to the hub, and
  collapse into a cited brief. It is one pull — a single action deploys the brief, never a
  multi-step wizard.
- **Launch flight**, field to session, ~520ms, the effort's cage-vertex marker as the shared element.
- **The wants-you signal arrives once and holds.** It never pulses — and note this is the one thing
  in the product that must *not* breathe, precisely because everything in layer 0 does. Breathing is
  the corpus being alive; a breathing alert is an alarm that cannot be dismissed.
- Everything respects `prefers-reduced-motion`, which replaces travel with a state change.

---

## The field of fragments

**Decided 2026-08-27 — no longer owed.** Specified in
[`docs/plans/2026-08-27-fragment-ground.md`](plans/2026-08-27-fragment-ground.md), drawn in
`docs/mockups/2026-08-27-fragment-ground.html`, and not yet in `src/`. Three things changed from
the text below, which is kept because it is the reasoning the decision came from:

- **The coherence question is answered** the way this file guessed: the debris is **unindexed
  working matter**. Its count is therefore a density decision, *not* 583 — that number meant
  indexed files, and those are the corpus.
- **The hex weave is removed**, not dimmed. The ground is the debris field.
- **The luminous rim returns** from the fragment mockup, drawn at the corpus radius so the arc and
  the geodesic cage are one boundary rather than two. Strictly white and grey — the rejected ember
  variant stays rejected.

**Deferred, not dropped.** The world is called *the fragment field*, and the mono debris that named
it is currently absent — it was in the first pass and did not survive the layer 0 rework. It belongs
in the final design as the **background ground**, behind everything, and this is a commitment rather
than an idea.

What it was, from `2026-08-27-cockpit-fragment.html`: angular mono shards, 3–6 point polygons,
`1 + rnd()^2.3 × 8` px, alpha `0.08–0.58`, roughly a quarter of them white and the rest `#7E7E82`,
banded elliptically around the centre with specular scatter along the lower edge.

**The coherence question to resolve before building it.** The current design already assigns
meaning by position: colour inside the cage is the 583 indexed files, and the seven mono hexes on
cage vertices are the efforts. If fragments come back as a third population they need their own
honest referent, or they become the wallpaper this file keeps warning about. The likely answer is
the one already written into "The world": **unindexed working matter** — repo trees and vendored
dependencies, the 115,215 files under Studybuddy's `FrontEnd`. That reading makes the cage the
boundary of what Cockpit knows, with the uncounted mass drifting outside it, and it is worth the
build.

Constraints it must respect: strictly mono (colour stays pinned to the corpus); far enough back in
depth and low enough in alpha that it never competes with the volume or the plates; it must not
reintroduce a global pulse; and it must fade on release like the cage does, since the flat layouts
have no space behind them.

## What this file does not cover

- The light theme (open, see above).
- Terminal panel typography and how xterm's own theme reconciles with these tokens.
- Empty states, first run, and the state where the vault path is missing or unreadable.
- Error and permission states.
- The Learning and Projects custom panels, which PRODUCT.md says earn an exception.

These are unwritten because they are undesigned, not because they are unimportant. Do not invent
them from this file's tone; design them and then write them down.
