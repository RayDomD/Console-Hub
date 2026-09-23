# Recipes are gated by proven Capabilities

Every Vendor Adapter declares Capabilities proven by adapter tests, including enforced read-only access, structured streaming, writing, Session continuation, telemetry, and interactive Console support. Before launch, a Recipe checks every selected slot against its required Capabilities. An incompatible slot makes the Recipe visibly unavailable with the missing Capability named; Cockpit never silently changes flags, drops the slot, or weakens the Recipe's guarantee.

AGY remains a supported Vendor, but `--mode plan` is not accepted as read-only merely because it prevents ordinary editing: it reframes the task and therefore changes the Recipe. Capability may also be model-specific, so a listed AGY model that cannot read files can be disabled without disabling every AGY model.

**Status:** accepted
