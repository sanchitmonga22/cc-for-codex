# Safety model

CC for Codex launches a separate local process. Claude Code is not embedded in Codex and does not inherit Codex's approvals or sandbox.

## Default boundary

The executable shell launcher resolves Node outside the current repository before loading JavaScript. Foreground prompts then go over stdin to a process spawned without a shell. The default consultation profile uses Claude's safe mode, restricted mode, strict empty MCP set, no Chrome, `dontAsk`, no permission prompts, and only `Read`, `Glob`, and `Grep`. Reviews construct the selected git diff with a separate argv-only Git process and disable Claude's tools entirely, so `--path` is an enforced, matched data boundary rather than only an instruction. Every automatic Claude launch receives hardened Git settings. Repository-selection variables, optional index writes, hooks, fsmonitor, textconv, global attributes, lazy fetch, and submodule recursion are disabled; `.git` markers and common-directory/object-store containment are authenticated; initialized submodules are recursively preflighted; and tracked content filters, alternate/shared object stores, or partial/promisor repositories at any level make automatic launches fail closed. Reviews also reject hidden index flags and use a disposable index snapshot so collecting evidence does not refresh the user's index.

The wrapper strips terminal control sequences, caps prompt/output sizes, uses bounded timeouts, validates model/effort/ref/path/ID inputs, and returns only an allowlist from `claude auth status`.

## Claude session import archive

`import-session` requires a unique local Claude JSONL transcript before it
makes a model request. It copies that exact transcript plus same-session
subagent/tool-result sidecars into
`$CODEX_HOME/claude-session-archives/<session-id>/` (default
`~/.codex/claude-session-archives/<session-id>/`) with mode `0700` directories
and `0600` files. Each snapshot includes a SHA-256 and source-path metadata;
Codex receives the archive path and can consult the full record when its
summary omits context. The archive is unencrypted plaintext, may contain
credentials or sensitive repository content, and persists until the user
removes it. Missing, ambiguous, symlinked, or oversized local session data
fails closed before the billed summary request. The ordinary active-session
guard still runs before the archive is created.

## Explicit risk gates

- Native local customizations can add hooks, plugins, or other executable behavior.
- Background sessions lack the foreground max-budget control and can continue after Codex returns.
- Background prompts are passed in argv by Claude's interface and can be visible to same-account local process inspection.
- Write delegation defaults to dangerous permission bypass after a separate exact confirmation. Its built-in tools remain file-only, but Edit/Write can reach host paths because a worktree is not an operating-system sandbox. `--write-permissions guarded` keeps the same zero-prompt behavior with Claude's restricted boundary.
- Submodules, untracked contents, and changed binary bytes are omitted from reviews and make the result explicitly partial.
- Git LFS/custom-filter repositories need a separately prepared trusted worktree; automatic review/write refuses them rather than executing filters or changing their content semantics.
- `.worktreeinclude` can copy ignored secrets into a Claude worktree.
- Ultrareview uploads code and may bill usage credits; its local repository collection receives the same filter, partial-clone, sparse-checkout, hidden-index, and Git-helper preflight.
- Removing a Claude job can remove its Claude-created worktree.
- Enterprise-managed Claude settings and hooks can still apply under safe mode and cannot be disabled by these CLI flags.
- Permission bypass can affect the host. Prefer guarded mode; use a separate hardened container or VM for untrusted repositories.

Never put credentials in prompts or command-line arguments. Never treat generated text as trusted terminal instructions.
