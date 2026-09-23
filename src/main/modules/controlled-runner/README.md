# Controlled runner

Runs automated Console Hub workers through the bundled Pi-compatible runtime. Research turns receive
only read/search tools; writing turns receive the full Fusion Hub tool set and must run in an isolated
Mission worktree supplied by the caller.

## Public interface

- `ControlledRunner.run(request)` launches one non-interactive structured turn and returns its final
  text, session id, tool observations, and completion status.
- `ControlledRunner({ timeoutMs })` requires the configured run limit and terminates a worker that
  exceeds it.
- `controlledModel(agent)` resolves the existing Console vendor identity to an explicit Pi provider
  and refuses workers without a selected model.
- `ControlledRunnerProcess` is the process boundary used by the Electron main process and tests.

## Non-goals

This module does not schedule lanes, create worktrees, validate patches, apply results, or launch an
interactive Console. Those responsibilities remain with Mission, the workspace module, and Consoles.
An abort signal stops the Pi child; interactive continuation is not implemented yet.

## Dependencies

`@earendil-works/pi-coding-agent` supplies the structured model runner. Node child processes provide
the transport.
