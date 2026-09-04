---
name: claude-delegate
description: "Delegate a bounded task from Codex to the local Claude Code CLI. Use when the user explicitly asks Claude to investigate, implement, rescue, or continue work. Defaults to read-only; write delegation is confined to a generated git worktree."
---

# Claude Delegate

Use the executable bridge launcher at the sibling skill path `../claude-code/scripts/cc-for-codex`, resolved to an absolute path. Invoke it directly, never through a bare `node` lookup.

## Modes

- Foreground read-only: `delegate <prompt>`.
- Background read-only: after screening the prompt for secrets, disclose that background sessions have no supported max-budget guard and that the full prompt is temporarily visible to same-account local process inspection. After the user accepts both, add `--background --confirm-background unbounded-usage --confirm-background-data process-visible-prompt`.
- Foreground isolated write: the bridge defaults to `dangerous` zero-prompt permissions. Explain that a worktree is not a host sandbox and Claude file tools may reach host paths when permission checks are bypassed. After explicit authorization of both the edit and that risk, add `--write --confirm-write isolated-worktree --confirm-dangerous-permissions bypass-host-safety`.
- Foreground guarded write: when the user does not authorize bypass or requests the safer profile, add `--write --write-permissions guarded --confirm-write isolated-worktree`. This remains zero-prompt through `dontAsk` plus explicit `Edit,Write` preapproval, but protected Git/Claude/config paths are denied.
- Background isolated write: combine the chosen write-mode confirmation(s) with both background confirmations. The Claude agent receives only built-in file tools; it cannot run shell commands, tests, WebFetch, MCP, or GitHub actions through the automatic tool surface. Codex validates afterward.

## One-writer rule

Never let Claude and Codex edit the same checkout concurrently. Write mode always generates a Claude worktree based on current local `HEAD`; it never reuses the Codex checkout, merges, pushes, cleans up, or deletes the worktree.

Before write delegation:

1. Confirm the current directory is a git repository.
2. For background/non-`-p` worktree delegation only, confirm the user has opened Claude Code interactively in this repository and accepted its workspace-trust prompt. Foreground `-p --worktree` skips that prompt. The bridge cannot accept trust for the user.
3. Inspect `.worktreeinclude` if present. It can copy ignored files and secrets. Pass `--confirm-worktree-include copy-ignored-files` only after the user accepts the exact contents.
4. Confirm the repository is a self-contained, full, non-sparse checkout and does not depend on Git alternates/`git clone --shared`, Git LFS, or another selected content filter. The bridge refuses alternate/partial/promisor repos, sparse checkout, and filtered tracked files rather than reading a sibling object store, fetching, running repository-controlled drivers, or checking out encoded/pointer content.
5. For dangerous mode, obtain explicit host-safety-bypass authorization before adding its exact confirmation token. Do not infer this from ordinary permission to edit files. The user's standing instruction in the current task may supply this authorization; do not ask repeatedly within the same delegated run.
6. Put the narrow task, acceptance criteria, excluded files, and required handoff in the prompt.
7. Stop editing the overlapping area until Claude finishes.

Afterward, use the wrapper-verified worktree path and branch printed by the command, inspect the diff yourself, run repository validation from an appropriate safe checkout, and keep implemented/tested/merged status separate.

Read [references/isolation.md](references/isolation.md) before any write or background delegation.
