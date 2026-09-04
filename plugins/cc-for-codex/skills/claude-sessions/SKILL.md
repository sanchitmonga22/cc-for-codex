---
name: claude-sessions
description: "Inspect and manage Claude Code background sessions from Codex. Use for repository-scoped status, recent logs, best-effort results, stopping, respawning, removing, or attaching to a known Claude background job."
---

# Claude Sessions

Use the executable bridge launcher at the sibling skill path `../claude-code/scripts/cc-for-codex`, resolved to an absolute path. Invoke it directly, never through a bare `node` lookup.

## Safe operations

- `status --all`: list sanitized jobs scoped to the canonical working directory.
- `logs <id>`: show recent terminal output.
- `result <id>`: alias to recent logs; Claude has no dedicated structured result subcommand.

## State-changing operations

Resolve the exact 8-hex ID with `status --all` immediately before acting.

- Stop: `stop <id> --confirm-stop stop:<id>`. This preserves the conversation.
- Respawn: `respawn <id> --confirm-respawn respawn:<id>`. Warn that usage can resume.
- Remove: only for `done`, `failed`, or `stopped`; use `remove <id> --confirm-remove remove:<id>`. Removal can delete a safely removable Claude-created worktree. Never retry with `--discard-unpushed`.
- Attach: requires a real TTY. Open it in the Codex terminal; do not treat Ctrl-C as a request to stop the background session.

Never act on an ID outside the current repository scope. Never use `respawn --all`, daemon-wide stop, or global cleanup through this skill.

Read [references/lifecycle.md](references/lifecycle.md) for state semantics and resume behavior.
