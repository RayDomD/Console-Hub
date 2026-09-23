# Vendor rims are bounded identity

An automated slot or stream carries a 2px top rim keyed only to its vendor: Codex blue `#5AA9F0`,
Claude orange `#F0871F`, AGY a seven-stop gradient. This supersedes the colour clause of
[ADR 0034](0034-slot-streams-show-honest-telemetry.md), which removed vendor colour entirely. ADR
0034's telemetry decision - honest, per-vendor measurements with missing values left unavailable -
stands unchanged.

The rim is identity, never status. It does not change on run, completion, fault, hold, queue, or
wants-you, and it never reaches text, a button, a border below 2px, a wire, or a state treatment.
Authored glyph, label, and stable position remain the non-colour identity channels, so the rim is
evidence added to them rather than a replacement for them. It vanishes when a slot has no vendor.

At five slots the vendor is the thing being scanned - which quota a run is spending, and whether two
slots spend the same one - and a word is slower to scan than a mark. The gradient exists because AGY
fronts several model families and no single hue is honest about that; it is the only gradient
permitted in chrome.

This keeps the shell's achromatic rule intact everywhere else, and it keeps the second brain's seven
cluster hues the only other colour in the application. A cluster hue never appears on a slot, and a
vendor rim never appears in layer 0.

**Status:** accepted
