# Direct is one persistent agent session

Direct targets any one Stack slot, defaulting to Primary, and runs no Orchestrator, gate, comparison, or synthesis. It uses the vendor's structured headless mode so Cockpit can observe turn boundaries, faults, token use, and completion. With no Workspace the slot can only return an answer; with a Workspace it receives full tools in its own worktree and branch, which requires explicit adoption.

Further Direct turns to that slot resume the same session and worktree. Reset explicitly starts fresh, while changing the slot's model selects a separate model-specific session rather than replaying one model's history as another's. Direct is not Console: Direct is a harnessed agent session Cockpit can observe and resume; Console is an interactive shell operated by the user.

**Status:** accepted
