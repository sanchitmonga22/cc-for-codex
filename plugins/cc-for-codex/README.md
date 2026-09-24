<p align="center">
  <img src="assets/icon.png" alt="CC for Codex — copper Claude mark connected to an ivory Codex terminal" width="160" />
</p>

<p align="center">
  <img src="assets/logo.png" alt="CC for Codex — Claude Code, inside Codex" width="100%" />
</p>

# CC for Codex plugin package

This directory is the installable Codex plugin. For installation, architecture, security, official sources, and the complete feature matrix, see the repository [README](https://github.com/sanchitmonga22/cc-for-codex#readme).

The package contains ten Codex skills—seven Claude integration skills and three Codex-first workflow skills—one dependency-free local runner, and an optional Stop review hook that is disabled per repository until separately trusted and enabled. `$claude-import` archives a known session's full local JSONL transcript and same-session sidecars in a private Codex-home folder, then supplies a read-only summary plus an exact transcript reference. It does not create a new Codex task or pretend the summary is lossless. The archive is plaintext, may contain sensitive material, and persists until removed. `$claude-verify` separates installed state, local readiness, and an explicitly authorized live smoke test. The package requires a separately installed and authenticated Claude Code CLI. Ordinary reads are tool-limited and zero-prompt, but not filesystem-sandboxed; worktree writes offer a separately confirmed dangerous default plus a zero-prompt restricted alternative. V0.2 is tested on macOS and standard Linux; WSL2 is a target but is not yet independently qualified, and native Windows is not supported. It is unofficial and is not affiliated with Anthropic or OpenAI.

The bridge defaults to Claude Opus 5.5 (`claude-opus-5-5`) at `high` effort;
Sonnet 5 (`claude-sonnet-5`) uses `ultracode` when explicitly selected. Fable
5.1 is not a recommended route, but remains available on specific request.
`import-session --session <uuid>` preserves the full local source
transcript before creating the Codex-ready handoff summary. The complete
archive path, SHA-256, and original session UUID are returned for later review.
Reopen the saved conversation any time by opening the returned `transcriptPath`
in Codex or a text editor, or using `less '<transcriptPath>'` in a terminal.
Claude's source transcripts are plaintext and can be removed by its configured
retention cleanup; the private Codex-home archive remains until you remove it.
See [Claude local data](https://code.claude.com/docs/en/claude-directory) and
[Claude session commands](https://code.claude.com/docs/en/commands).

The required `workflow install` step installs or refreshes the Codex-first role blocks in a
user's global instruction files. It defaults to a dry run, creates
timestamped backups before changes, preserves unmarked prose, refuses symlink targets and known legacy
role conflicts, and never replaces existing prose.

To remove only those managed blocks later, run the matching
`scripts/uninstall-global-workflow.mjs` command with `--check` first and
`--apply` after reviewing the targets. It preserves the instruction files and
creates a timestamped backup before removal.
