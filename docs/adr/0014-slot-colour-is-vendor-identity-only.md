# Slot colour is vendor identity only

Model slots carry a vendor hue: a 2px cap on the card and a 3px bar in the sidebar. Effort stays achromatic in the existing `▮▮▮▯` glyph run. Status, wires, and everything else in the shell stay achromatic.

This is a bounded exception to the achromatic-shell rule, recorded here and in `DESIGN.md`.

**Status:** superseded by ADR 0034

## Context

`DESIGN.md` states: *"The shell is achromatic. The second brain is not, and it is the only thing that is not,"* and immediately after: *"An ember-lit variant of this composition was drawn and rejected… Do not reintroduce warm light as an accent anywhere in the shell."* The wire-leg table distinguishes legs *"by form, never colour"* for the same reason.

Anthropic's brand colour is precisely that warm ember, so a vendor palette is an amendment to the rulebook rather than a detail. The user asked for it deliberately after the conflict was stated.

## Considered Options

- **Stay achromatic**, vendor as a dim word under the model name. Costs nothing and changes no rules; rejected because at four slots the vendor is the thing being scanned, and a word is slower to scan than a mark.
- **Colour for effort as well as identity.** Rejected. Effort is ordinal — off through max — and colour encodes ordinal badly, while the `▮▮▮▯` / `▮▮▯▯` run already encodes it correctly and is in the rulebook. Seven effort levels in colour beside four vendor hues beside the seven-hue cluster palette is three colour systems in one app.

## The palette

| Token | Value | Vendor |
|---|---|---|
| `--slot-anthropic` | `#C8785C` | Anthropic |
| `--slot-openai` | `#4FA88B` | OpenAI |
| `--slot-google` | `#6E97D8` | Google |
| `--slot-spare` | `#9B87C4` | unassigned |

Pulled to one mid-luminance band — the rule the cluster palette already follows — so the two systems sit together rather than competing. **The hex values are approximations and must be checked against each vendor's published palette before they ship.**

## Consequences

- **The bound is the decision.** Colour marks which vendor a slot belongs to and nothing else. It never carries status, never carries effort, never appears on a wire, and never leaves the fan surface. Without the bound it leaks and the achromatic shell is gone.
- **Colour keys to vendor, not slot.** Two Anthropic slots share the clay. That is the useful grouping: it makes "two of these drain the same subscription" legible at a glance, which is the thing worth seeing when a fan is running.
- `#C8785C` is the ember that was previously drawn and rejected. The rejection stands everywhere except here; the promoted "not taken" mockup remains valid for the composition it was about.
- The cluster palette keeps its seven hues and its meaning. A fan hue never appears in layer 0 and a cluster hue never appears on a slot.
- The light theme remains undesigned, and these four hues will need checking against it when it is.
