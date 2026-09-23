# Console Hub design

Console Hub owns the Hub visual system transferred from Cockpit. The complete authored source at
the extraction baseline is preserved in
[cockpit-design-source.md](docs/migration/cockpit-design-source.md); the live Hub decisions are
collected here. Visual fixtures are in [docs/mockups](docs/mockups) and the authored icon geometry
is in [docs/design-system](docs/design-system/index.html).

## Shell and type

The shell is achromatic except for restrained Vendor identity rims. Colour never carries a run
state. Every state has a glyph and label. The ground is `#000000`, page `#0A0A0B`, plate
`rgba(6,6,7,.88)`, primary ink `#EDEDEA`, secondary ink `#8E8E88`, plate edge
`rgba(237,237,234,.22)`, and rule `#2A2A2C`. Plates are matte with a 1px uniform edge and
11px chamfers at top-right and bottom-left. Radius is zero. There is no glass effect, blur, or
specular gradient.

Anybody is display and UI text. Cascadia Mono is for data, paths, counts, durations, and terminal
output. Both fonts are self-hosted in `src/renderer/src/assets/fonts`. The primary theme is dark.
The light theme requires its own design and is not an automatic inversion.

Automated slots have a 2px top Vendor rim and restrained 14% card tint: Codex blue `#5AA9F0`,
Claude orange `#F0871F`, and AGY a seven-stop rim with violet tint. The rim is stable identity,
never a state indicator. Slot glyph, label, and position also identify the Vendor. The AGY rim is
the only gradient in chrome.

## Hub composition

The Hub starts with no Recipe selected. Workspace Explorer leads; Ways to work lists Explore,
Synthesize, Debate, Coordinate, Validate, Direct, and Console. The selected Recipe expands into
one dominant run plate. A persistent Live Stack of one to five slots sits at the trailing edge.
The run plate reads Ask → Recipe stage → slot streams → result. An active run is the visual peak;
the rail, Explorer, Stack, and records remain quiet. A held state uses a framed release bar in the
causal gap, not a modal.

Console plates and Recipe plates can share the Hub, but their runtime terms remain distinct.
ConsoleView is a movable plate, not a fixed overlay. A Recipe plate keeps Stop Slot and Stop Run.
Mission consumes its exact `stop` command locally. Escape navigates or releases focus; it never
cancels work.

The free canvas, pan and zoom, card sizes, focus mode, and Rail are the Hub's spatial grammar.
Cards have strip, card, and focus sizes. A focused Console owns the keyboard and provides an
explicit release control. Wires use line form, head form, label position, and lane to distinguish
brief from review; hue never distinguishes them. A Loop is derived from two opposed wires and
demotes when either leg is detached.

## Icons and motion

Icons are authored SVG in a 14px box with a 1.4px stroke, angular cuts, and deliberately broken
strokes. No icon library, emoji, or Unicode pictograms. Five Hub icon references are in the
copied design-system fixture.

Motion follows real events. The fan is one mechanical relay, with no spinner, shimmer, pulse,
breathing status, or decorative loop. Stop is immediate. The wants-you signal arrives once and
holds. Everything stops under `prefers-reduced-motion`; labels and ordering remain.
