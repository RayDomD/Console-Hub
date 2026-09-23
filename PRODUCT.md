# Console Hub product

Console Hub is a local Windows 11 Electron application for one user. It owns Workspace Explorer,
Live Stack, all seven Recipes, interactive Consoles, and Mission. It has its own installation,
updates, configuration, user data, and releases. Cockpit can launch or focus it through the
versioned `consolehub://` contract with an optional Workspace; Console Hub continues after Cockpit
closes.

The user reviews work and evidence and explicitly decides whether to Apply Result. The
Orchestrator and workers handle approved planning, delegation, dependencies, progress, validation,
and review. Failures preserve work and evidence, report a recovery recommendation, and wait for a
human decision. A different incoming Workspace waits for acceptance and never interrupts active
work. An unresolved Mission holds that handoff until Apply or Reject and cleanup complete.

The launch agent is a Hub-wide Vendor, model, and effort setting. A project handoff focuses the
most recently active agent session in its Workspace, or starts that default agent if none is open.
A generic launch starts no agent. Cockpit does not select an agent. Hub-started Consoles, Recipes,
Orchestrator turns, and Skills use the configured Vendor CLIs and their native subscription
sign-in. Console Hub clears common inherited API-key overrides from those launches, then the
Vendor CLI handles account access and usage limits. Existing sessions remain focusable. Mission's
separate controlled runner remains unavailable until it can use a subscription account path.

The extraction preserves the existing experience before adding Fusion Hub feature targets. Its
current decisions and the parity gate are in
[the extraction plan](docs/plans/2026-09-12-console-hub-extraction.md). The accepted architectural
decisions are in [docs/adr](docs/adr). This file wins if it conflicts with `DESIGN.md`.
