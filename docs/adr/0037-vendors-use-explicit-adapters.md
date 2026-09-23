# Vendors use explicit adapters

The initial Hub supports Claude Code, Codex, and AGY as subscription-backed Vendors. A Stack may repeat a Vendor with different configured models or reasoning effort, and each Vendor's model list is configuration rather than a Cockpit release. Cockpit does not introduce an API gateway or per-token API credentials.

Adding a wholly new Vendor requires one explicit adapter covering availability and model discovery, harnessed invocation by access level, structured-event normalization, authoritative success and failure verdicts, usage, Session continuation, interactive Console launch, and process-tree stopping. This boundary is necessary because the CLIs are observably different: AGY emits structured NDJSON and supports conversation resume, but reports terminal success through `result.status` and may exit zero on failure. An arbitrary executable plus model string cannot preserve the Hub's guarantees.

**Status:** accepted
