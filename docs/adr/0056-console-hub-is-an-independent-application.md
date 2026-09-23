# Console Hub is an independent application

Console Hub is a separate desktop product in `C:\FIles\Console-Hub`, with its own repository,
installer, executable, configuration, storage, process lifetime, and release cycle. It owns the
complete current Hub experience: Explorer, Live Stack, all seven Recipes, Console, and Mission.
Cockpit retains launch affordances only and opens the installed app through a versioned
`consolehub://` protocol, optionally handing off a selected Workspace. If Console Hub is already
running, the handoff focuses it and requires explicit acceptance before changing Workspace.

This replaces the current embedded surface because process separation inside the Cockpit repository
would still couple source, dependencies, storage, and releases. Console Hub keeps an independently
owned copy of its established instrument design but drops Cockpit branding. The extraction begins
from the current implementation without redesign, imports durable Hub state by copying it, never
migrates live Consoles or agent Sessions, and never automatically deletes Cockpit's legacy data.
Cockpit does not install, update, monitor, or control Console Hub after launch.

## Consequences

- Console Hub becomes the sole source of truth for its product, domain, design, runtime, and history.
- Cockpit and Console Hub share no source package, configuration file, storage directory, or runtime
  interface beyond the launch protocol.
- The embedded implementation remains only until standalone parity, migration, and launch behavior
  are verified. It is then removed rather than retained as a fallback.
- Hub-specific accepted ADRs and active plans are copied to Console Hub. Cockpit keeps its historical
  records unchanged and this ADR as the ownership pointer.

