# Architecture

## Decision

CC for Codex is a Codex plugin with nine skills, one optional Stop hook, and a shared local process runner. Six skills integrate with Claude Code; three (`heavy-track`, `heavy-plan`, and `heavy-build`) provide the Codex-first workflow. This deliberately combines the components the project needs:

- The **plugin** is the versioned, installable marketplace package.
- The **skills** are the discoverable workflows Codex invokes.
- The **runner** turns those model-authored workflows into validated Claude CLI argument arrays.
- The **hook** optionally runs the same guarded review at Codex Stop after separate trust and billing opt-ins.

No MCP server is required in v0.2. A local MCP server would add lifecycle and protocol complexity without removing the local Claude CLI/auth dependency. Anthropic's `claude mcp serve` exposes Claude Code tools to an MCP client; it is not a supported “Claude as a model” endpoint.

## Repository shape

```text
.agents/plugins/marketplace.json        Git/local Codex marketplace
plugins/cc-for-codex/
  .codex-plugin/plugin.json             Codex package manifest
  hooks/hooks.json                      Auto-discovered optional Stop hook
  hooks/stop-review-gate                Hook launcher
  skills/                               Six Claude integration + three Codex workflow skills
  scripts/cc-for-codex                  Safe executable launcher
  scripts/install-global-workflow.mjs   Required, idempotent global instruction setup
  scripts/uninstall-global-workflow.mjs Reversible removal of only managed blocks
  LICENSE
scripts/                                Repository validation/audit tools
tests/                                  Fake-Claude integration tests
docs/                                   Architecture, parity, security, release docs
reference/codex-plugin-cc/              Ignored local upstream comparison clone
```

The executable implementation lives inside `skills/claude-code/scripts/`, so the primary skill remains self-contained. The plugin-level shell launcher delegates to that package-local launcher, which resolves a non-workspace Node binary before importing the internal `.mjs` entrypoint; there is one JavaScript behavior path to test.

## Execution paths

### Guarded foreground call

```text
Codex skill
  -> shell bootstrap resolves Node outside the workspace
  -> validate cwd, prompt, model, effort, budget, timeout
  -> resolve an absolute executable from absolute PATH entries
  -> remove PATH entries that live in or link into the selected workspace
  -> recursively preflight includes, executable diff/filter config, and partial clones in initialized submodules; harden Claude's Git environment
  -> capability preflight (`claude --help`, no model call)
  -> spawn Claude with shell:false
  -> send the prompt through stdin
  -> parse bounded JSON output
  -> sanitize and render result/session metadata
```

The read profile fixes the relevant Claude options. User/project Claude customizations, MCP, Chrome, Bash, network tools, edits, subagents, and interactive approvals are unavailable.

### Review

The runner resolves the git root, authenticates the nearest `.git` marker as a canonical main checkout, registered linked worktree, or registered submodule, and rejects common-directory and external object-store redirects. It clears inherited Git repository-selection variables, validates and matches optional paths/base refs, rejects hidden index flags, and builds porcelain status and diff context through argv-only Git calls. Those calls disable optional index writes, hooks, fsmonitor, external diff/textconv, global attributes, lazy fetching, and submodule recursion; diffing uses a timestamp-preserving disposable index snapshot, including split-index support. Partial/promisor or shared/alternate-object repositories, repository include/includeIf directives, executable diff drivers, and repositories with selected tracked content filters are refused recursively across initialized submodules. The runner visibly encodes dangerous source control characters, marks the resulting content as untrusted, and sends it to the same read-only Claude profile with a strict non-empty JSON schema. Untracked contents, binary bytes, changed/explicitly selected submodules, and truncation are reported as partial evidence. It never assumes an undocumented `claude review` subcommand.

### Isolated write delegation

Write mode requires Git, a self-contained full non-sparse/non-promisor checkout with no alternate/shared object store, no repository include/includeIf indirection, safe real-directory ancestry for `.claude/worktrees`, inspection of `.worktreeinclude`, and no selected content filter in the index, working attributes, or `HEAD`. It generates a unique Claude worktree name, requests `worktree.baseRef=head`, neutralizes Git checkout hooks/fsmonitor/global attributes, and exposes only read/file-edit built-ins. Claude creates `.claude/worktrees/<name>` on `worktree-<name>`; the bridge parses Git's NUL-delimited worktree metadata, rejects locked/prunable entries, and verifies an existing canonical directory, regular `.git` marker, exact path, branch, and base commit. The bridge never exposes Bash or WebFetch and never merges, pushes, or removes the worktree.

The default write permission profile is `dangerous`, per the project requirement. It adds `--dangerously-skip-permissions`, omits incompatible `--restricted`, and requires two explicit bridge tokens: `isolated-worktree` and `bypass-host-safety`. The `guarded` profile instead combines `--restricted`, `dontAsk`, and `--allowedTools Edit,Write`; it is also zero-prompt but cannot edit Claude/Git/protected configuration paths. Both retain safe mode, strict empty MCP configuration, no Chrome, and the exact built-in tool list. A worktree is not an OS sandbox, especially in dangerous mode, and managed policy hooks cannot be disabled by these flags. Codex remains responsible for inspecting and validating the resulting diff.

### Background sessions

The runner launches `claude --bg`, extracts exactly one short ID, and verifies that ID with `claude agents --json --cwd <canonical-root>`. If launch ends ambiguously after printing a valid ID, the bridge preserves that ID with status/stop guidance; write failures also report the verified or deterministic worktree. All later lifecycle commands repeat the scoped lookup before acting, and respawn re-runs repository preflight in the session directory. Claude's own supervisor remains the source of truth; the bridge does not maintain a second job database.

### Optional Stop hook

Codex auto-discovers `hooks/hooks.json`, but skips the command until the user reviews and trusts its current definition. Repository enablement is separately stored as a small regular file under the Git common directory. The hook has one 570-second end-to-end deadline inside Codex's 600-second host timeout, performs at most one guarded structured review per Stop cycle, blocks findings or partial evidence, and fails open with a visible warning on runtime failure. Silent success emits no stdout. It intentionally reviews the full current dirty tree because Stop input does not provide reliable per-turn file attribution.

### Native escape hatch

`native` passes a finite argv array and optional bounded stdin to the installed CLI only after an explicit confirmation. Its conservative classifier cumulatively gates command families/stateful flags, permission authorization, and cloud/network surfaces. Live stream-JSON protocols and `--post` are rejected. A native TTY is an explicit interactive escape: once it starts, the wrapper cannot inspect later keystrokes or mediate features chosen inside Claude. This gives advanced users access to newly added finite Claude CLI flags without silently weakening normal skill behavior.

## Trust boundaries

1. Repository content is untrusted input. A diff can contain prompt injection.
2. Claude output is untrusted terminal data. ANSI/OSC/control sequences are stripped and output is capped.
3. User/project Claude configuration is disabled in automatic profiles, but enterprise-managed settings and hooks can still apply.
4. A worktree separates checkout files, not the host or shared Git metadata; dangerous write permission bypass can authorize paths outside it.
5. Background sessions can outlive the Codex turn and lack print-mode budget flags.
6. Ultrareview crosses a local-to-cloud data and billing boundary.

See [threat-model.md](threat-model.md) for the enforced controls.

## Future richer transport

A custom MCP server or the Claude Agent SDK becomes justified if the project needs structured streaming, permission callbacks, reliable nested-agent events, or cross-platform background result storage. That would be a separate architecture version—not a reason to hide a local subprocess behind an unnecessary v0.2 server.
