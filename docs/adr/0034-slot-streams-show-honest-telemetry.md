# Slot streams show honest telemetry

The Hub lays out one to five slot streams responsively and keeps each slot's live text, tool activity, and complete final output visible and scrollable. Every stream identifies slot name, Role, vendor, model, and reasoning effort, then reports duration, input tokens, cached input, output tokens, measured output throughput, and context-window percentage only where the vendor supplies enough data. Missing measurements remain unavailable rather than estimated, and subscription-backed CLI runs show no invented marginal dollar cost.

Slot identity uses authored glyphs, labels, and position rather than vendor colour. This supersedes [ADR 0014](0014-slot-colour-is-vendor-identity-only.md)'s bounded colour exception and restores the current product commitment that colour belongs only to the second brain. The responsive information architecture carries over from Fusion Harness; its TUI styling does not.

**Status:** superseded in part by [ADR 0048](0048-vendor-rims-are-bounded-identity.md) — its colour clause only
