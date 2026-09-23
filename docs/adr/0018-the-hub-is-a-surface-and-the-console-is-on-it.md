# The Hub is a surface, and the console stops being an overlay

The Console Hub arrives as a fifth plate surface beside `rest`, `explorer`, `sheet` and `editor`, entered through a door plate on `rest` and left with a two-stage `Esc`. The question fan and the console both live on it as plates. The free canvas with pan, zoom and card sizes stays where the plan put it — phase 2, once there are wires to arrange.

**Status:** accepted

## Context

Phase 1 deliberately shipped the question fan as a layer-1 plate on `rest` ([the plan's D10](../plans/2026-08-27-console-hub.md)): a question fan has no wires, no handoffs and no spatial arrangement, so the canvas machinery was not load-bearing. That reasoning still holds for the canvas. It does not hold for the surface.

Running the finished plate showed the cost. `rest` carries Vault Health, Atlas, Skills, Cockpit Status and Tune, and the fan is by far the largest object among them — a full working surface competing for space with status instruments. The plan already anticipated the resolution in step 13: "The Hub surface... The plate graduates onto it," and step 14, a door plate carrying console count and a click into the Hub.

Two facts about the code decided the rest of it.

**The surface machinery already exists.** `PlateLayoutProvider` carries a current surface, plates declare which one they belong to, and arrangements are persisted per surface. Pressing the brain already flies from `rest` to `explorer`, with `Esc` returning. A fifth surface is a small, well-trodden change.

**The console is already a full-screen page, built a different way.** `ConsoleView` renders at `position: fixed; inset: 0; z-index: 10` with its own back button, and its CSS class is literally named `.hub`. It is a dedicated page that predates the surface system and sits outside it.

So the application already had two mechanisms for "a dedicated page". Adding a `hub` surface without addressing that would have made three.

## Decision

**A fifth surface, `hub`, on the existing machinery.** Not the free canvas. Pan, zoom, three card sizes and focus mode exist to *arrange* things spatially, and until wires and build-fan cards exist there is nothing to arrange — a single plate that fills the screen does not need to be panned.

**Entry is a door plate on `rest`**, as the plan specified: a chip carrying live fan and console status, so a run is visible without leaving whatever surface you are on, and so the fan stops occupying `rest` at full size. When nothing is running it shows the last run's outcome rather than reading as a dead button.

**The console migrates onto the surface as a plate**, and the fixed-position overlay is deleted. This is mostly the removal of an ad-hoc mechanism: the console is already shaped like a page. It also makes the name honest — a Console Hub containing no consoles would be a page named after its future.

The decisive argument is phase 2: wires connect a console to a fan slot. Two things cannot be wired together when one is a plate on a surface and the other is a layer painted over the top of it.

**Leaving is a two-stage `Esc`, plus a visible return control.** The console is a real terminal and `Esc` is a key programs consume — vim, less, an interactive prompt, an agent's own interrupt. A surface that eats `Esc` breaks the terminal; a terminal that eats `Esc` silently breaks the way out. With focus in the console, `Esc` belongs to the terminal; pressed twice, or pressed with focus outside it, it returns to `rest`. The return control stays on screen so the keyboard rule is never the only way out.

## Consequences

- The fan plate's home moves from `rest` to `hub`. Its behaviour is unchanged: the machine lives in main, so a running fan keeps running while you are on another surface, and the plate reads the state when you come back.
- `ConsoleView` loses its own back button and its `position: fixed` frame, and gains a surface.
- How the fan and console are arranged *on* the surface is deliberately not decided here. The behaviour — the flight in, the flight out — is what [the flight mockup](../mockups/2026-09-01-hub-surface-flight.html) records; its two-pane split is a placeholder, and the real arrangement is the phase-2 canvas question.
- The plan's step 13 shrinks to what remains once this lands: the free canvas, card sizes, focus mode and the status rail.

## Ruled out

- **Keeping the console as an overlay and putting only the fan on `hub`.** Ships a Console Hub with no consoles, keeps two mechanisms for the same thing, and leaves phase 2 unable to wire the two together.
- **Building the free canvas now.** A second spatial grammar beside layer 1's 8px grid is a real decision, and the plan records it as one. Making it for a single plate would be inventing the Hub's spatial rules before there is anything spatial to rule on.
- **One-stage `Esc` on focus alone.** Simpler, and it makes leaving mouse-only whenever the last thing you touched was the terminal.
