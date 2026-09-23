# Consoles run in the selected checkout

Each Console targets one Stack slot, defaulting to Primary, and requires a selected Workspace. It opens a real PowerShell or Git Bash PTY in that Workspace's current checkout and starts the slot's vendor CLI interactively with its configured model and effort. Exiting the agent returns to the underlying shell, so the Console remains general-purpose.

A Console does not create a worktree: automated Recipes receive isolation, while the user-operated Console works on the checkout the user deliberately selected. Multiple Consoles may remain open, and their processes survive movement between Hub surfaces. Closing a Console with a live foreground process requires confirmation; closing its plate or exiting Cockpit ends the process.

**Status:** accepted
