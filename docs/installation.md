# Installation and updates

## Requirements

- Codex CLI/app with `codex plugin` marketplace support
- Node.js 20 or newer
- Claude Code 2.1.259 or newer, installed locally and authenticated through a Claude subscription, Anthropic API, or a supported provider. Capability-equivalent later builds must expose `--safe-mode`, `--restricted`, `--dangerously-skip-permissions`, `--strict-mcp-config`, `--no-chrome`, `--permission-mode`, `--permission-prompts`, `--tools`, and `--output-format`.
- Git for review and isolated write workflows
- macOS or standard Linux. WSL2 is a supported target but has not yet been independently qualified. V0.2 does not include a native Windows launcher or `commandWindows` hook and does not support native Windows.

Any repository you review or delegate into must be a self-contained clone. Repositories created with `git clone --shared`, `--reference`, or another nonempty Git alternate object store are intentionally refused because their commits and blobs can come from outside the selected checkout.

Verify the prerequisites without a model call:

```bash
codex --version
node --version
claude --version
claude auth status
```

## Install from GitHub

```bash
codex plugin marketplace add sanchitmonga22/cc-for-codex --ref main --json
codex plugin add cc-for-codex@cc-for-codex --json
```

Start a new Codex task, then invoke `$claude-setup`. Existing tasks do not dynamically reload newly installed skills.

Claude's noninteractive `-p --worktree` path skips workspace trust, so foreground writes do not require interactive onboarding. Before a background/non-`-p` worktree delegation, run `claude` interactively from that checkout, inspect the trust prompt, and accept it yourself. Exit after onboarding if no model work is needed. `doctor` checks binary/auth/capabilities but cannot establish or certify repository trust.

Add the generated worktree directory to the target repository's root `.gitignore`:

```gitignore
.claude/worktrees/
```

## Install from a local clone

```bash
git clone https://github.com/sanchitmonga22/cc-for-codex.git
codex plugin marketplace add /absolute/path/to/cc-for-codex --json
codex plugin add cc-for-codex@cc-for-codex --json
```

## Update a Git marketplace

```bash
codex plugin marketplace upgrade cc-for-codex --json
codex plugin add cc-for-codex@cc-for-codex --json
```

Start a new Codex task after an update.

## Refresh a local clone

`marketplace upgrade` refreshes Git marketplaces only. A local marketplace install runs from Codex's cached plugin copy, not directly from the source checkout, so pull and reinstall it:

```bash
git -C /absolute/path/to/cc-for-codex pull --ff-only
codex plugin remove cc-for-codex@cc-for-codex --json
codex plugin add cc-for-codex@cc-for-codex --json
```

Start a new Codex task. If the hook definition changed, review and trust its new hash through Codex `/hooks`.

## Configure write permissions

Read-only calls never prompt: they use `dontAsk` with a fixed read-only tool list. Write delegation defaults to the requested fast mode, `dangerous`, which activates Claude's permission bypass only after the bridge receives both `--confirm-write isolated-worktree` and `--confirm-dangerous-permissions bypass-host-safety`.

The `$claude-delegate` skill treats a user's standing dangerous-mode instruction as authorization and supplies that bridge token automatically for later writes in the same task. It does not turn ordinary edit permission into bypass consent.

For zero-prompt writes with Claude's restricted filesystem boundary and only `Edit,Write` pre-approved, ask the installed skill: “Use `$claude-delegate` with guarded write permissions to implement this change.”

Maintainers running from this source checkout can select the same profile directly:

```bash
plugins/cc-for-codex/scripts/cc-for-codex delegate --write \
  --write-permissions guarded \
  --confirm-write isolated-worktree \
  "implement the requested change"
```

Or configure the process environment used by Codex CLI (or a Codex app launched from that same shell):

```bash
export CC_FOR_CODEX_WRITE_PERMISSIONS=guarded
```

A macOS app opened from Finder will not inherit an `export` made later in Terminal. In the desktop app, the per-request `$claude-delegate` wording above is the reliable choice unless you deliberately launch Codex from the configured shell.

The dangerous default removes repeated Claude approval waits but is not a sandbox. A worktree shares Git metadata, file tools can reach host paths when permission checks are bypassed, and enterprise-managed hooks/settings still apply. Use a container or VM for untrusted code.

Claude's bypass mode has additional prerequisites:

- it is incompatible with `--restricted`, which the bridge intentionally omits only from the dangerous profile;
- the first interactive bypass launch shows a one-time responsibility dialog stored in Claude user settings; foreground `-p` does not show that dialog, and `--bg` refuses bypass until it has already been accepted interactively;
- Claude refuses bypass while running as root or through `sudo` on macOS/Linux outside a recognized sandbox;
- managed policy can prohibit it with `permissions.disableBypassPermissionsMode = "disable"`.

If any prerequisite blocks dangerous mode, use the `guarded` command above. It is also zero-prompt but retains Claude's restricted filesystem boundary.

## Optional Stop review gate

The plugin bundles an executable Stop hook, but Codex does not run untrusted plugin hooks and the review gate is disabled per repository by default. First inspect/trust the current hook in Codex `/hooks`, then explicitly enable billed review for the current Git repository:

```text
Use $claude-setup to show the Stop review gate status.
Use $claude-setup to enable the Stop review gate; I accept billed Claude reviews.
Use $claude-setup to disable the Stop review gate.
```

The following direct commands are for maintainers running from this source checkout:

```bash
RUNNER="plugins/cc-for-codex/scripts/cc-for-codex"

"$RUNNER" review-gate status
"$RUNNER" review-gate enable \
  --confirm-review-gate enable-billed-stop-review
"$RUNNER" review-gate disable
```

The setting lives in the Git common directory and is shared by linked worktrees. Each enabled Stop may invoke one bounded Claude review of the entire current dirty tree. Findings or omitted/partial evidence block one continuation; the continuation's `stop_hook_active` input prevents another review loop. Runtime failures fail open and show a warning. Clean, disabled, and loop-guard runs exit successfully without stdout. Hook source changes require trust review again.

## Remove

The required global workflow setup can be reversed without deleting either
instruction file. The command removes only the exact CC for Codex blocks
between the managed markers, preserves all surrounding prose, refuses symlink
and partial-marker targets, and creates a timestamped backup before changing an
existing file:

```bash
node plugins/cc-for-codex/scripts/uninstall-global-workflow.mjs --check
node plugins/cc-for-codex/scripts/uninstall-global-workflow.mjs --apply
```

Use the source checkout's runner when the plugin is loaded:

```bash
plugins/cc-for-codex/scripts/cc-for-codex workflow uninstall --check
plugins/cc-for-codex/scripts/cc-for-codex workflow uninstall --apply
```

These commands do not uninstall Claude Code, remove saved Claude sessions, or
disable per-repository review-gate state.

The optional review-gate setting belongs to each Git repository, not the plugin installation, and deliberately survives upgrades or reinstalls. Before removal, visit every repository where you enabled it and ask: “Use `$claude-setup` to disable the Stop review gate.” From a source checkout, the equivalent command is `plugins/cc-for-codex/scripts/cc-for-codex review-gate disable`. If you leave that state enabled, reinstalling and re-trusting the same hook can resume billed Stop reviews without another enable command; the state file is `<git-common-dir>/cc-for-codex/review-gate.json`.

```bash
codex plugin remove cc-for-codex@cc-for-codex
codex plugin marketplace remove cc-for-codex
```

Removal does not uninstall Claude Code, delete Claude's own saved sessions, or delete per-repository review-gate state.

## Claude executable resolution

The executable launcher first resolves `node` from an absolute PATH directory outside the current repository/workspace, before any JavaScript loads. The runner then checks `CC_FOR_CODEX_CLAUDE_BIN` and absolute entries in `PATH` for Claude and Git. It ignores empty/relative PATH entries and rejects executables located inside the current Git repository or non-Git working directory, even when that PATH entry is absolute. This prevents checkout-local `node`, `claude`, or `git` shims from taking over the safety boundary.

If Codex's non-interactive shell cannot see Claude:

```bash
export CC_FOR_CODEX_CLAUDE_BIN="/absolute/path/to/claude"
```

That export applies to Codex CLI or a Codex app launched from the same shell; a Finder-launched app does not inherit later Terminal exports. Use `$claude-setup` again. The target must live outside the current repository/workspace. Do not point this variable at a wrapper you do not trust; that executable receives the prompt and inherits the environment needed for Claude auth.

## Direct runner

The installed plugin's skills resolve the runner package-relatively. From a source checkout:

```bash
plugins/cc-for-codex/scripts/cc-for-codex help
plugins/cc-for-codex/scripts/cc-for-codex doctor --json
```

No global npm install is required.
