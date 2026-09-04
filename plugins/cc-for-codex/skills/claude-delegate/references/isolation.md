# Delegation isolation

Read-only delegation is the default. Its Claude process cannot edit files, run Bash, browse the web, call MCP tools, or load local project customizations.

Background delegation additionally exposes its prompt in the local process argument list while launching. Screen out secrets and obtain the separate `process-visible-prompt` confirmation; a prompt file does not remove this boundary because Claude's background interface receives the assembled prompt as an argument.

Write delegation:

1. requires explicit user authorization and the exact `isolated-worktree` bridge confirmation;
2. requires a self-contained, full, non-sparse, non-promisor Git checkout with no alternate/shared object store;
3. refuses tracked Git LFS/custom-filter content in the working tree, index, or `HEAD`, because executing drivers is unsafe and disabling them changes file semantics;
4. asks Claude Code to create `.claude/worktrees/<name>` on branch `worktree-<name>` from current local `HEAD`, with Git checkout hooks and fsmonitor disabled;
5. exposes `Read`, `Glob`, `Grep`, `Edit`, and `Write`, but not Bash, WebFetch, MCP, Chrome, or subagents;
6. defaults to `dangerous` permissions, which additionally requires `--confirm-dangerous-permissions bypass-host-safety`; `guarded` uses restricted `dontAsk` plus pre-approved `Edit,Write` and needs no bypass token;
7. rejects symlinked or repository-external `.claude/worktrees` ancestry and always prints the wrapper-verified worktree path, branch, base commit, and selected permission mode; and
8. never merges, pushes, publishes, cleans, or removes the worktree.

Because Git worktrees share repository metadata, they prevent overlapping checkout edits but do not provide host isolation. In dangerous mode Claude's permission checks do not confine Edit/Write to that checkout, and enterprise-managed hooks/settings may still apply. Validate the diff separately. Prefer `--write-permissions guarded`; use a hardened container/VM for untrusted repositories or when full shell execution is genuinely required.
