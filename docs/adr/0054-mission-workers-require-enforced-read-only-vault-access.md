# Mission research uses a tool-restricted runner

Mission research workers must be able to read and search the configured Vault while being unable to create, modify, rename, or delete its contents. Following Fusion Hub, Console Hub enforces this by launching automated workers through one controlled runner and exposing only `read`, `grep`, `find`, and `ls`. A read-only worker receives no shell, edit, or write tool. Prompt instructions alone do not satisfy this requirement.

Writing workers start in an isolated Mission worktree and receive full tools there. Following Fusion Hub, this is a working-directory and instruction boundary, not an operating-system filesystem sandbox: shell-capable writers are trusted not to escape by absolute path. They do not receive the Vault path; selected research evidence crosses into a writing lane through the Run Record. The Vault cannot be a Mission's writable Workspace or a destination for worktrees, outputs, or runtime records. The enforced Vault guarantee applies to research workers, which receive no shell, edit, or write tool.

Interactive Vendor CLI processes remain a Console capability and are not the execution backend for automated Mission lanes. Mission uses a Pi-compatible structured runner, matching Fusion Hub's capability boundary while retaining Console Hub's isolated worktrees and explicit Apply Result policy.

This supersedes the Windows filesystem-sandbox candidate accepted during the worktree-storage interview. Testing on Codex CLI 0.153.4 showed that its read grant still allowed deletion through the parent directory's `FILE_DELETE_CHILD` right. A worker-specific Windows account or persistent Vault ACL mutation was rejected as operationally excessive. The failed backend and its probe remain evidence; remove them only when the controlled runner has equivalent integration coverage.

Accepted 2026-09-13 after selecting Fusion Hub as the default design reference.
