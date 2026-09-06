<p align="center">
  <img src="assets/icon.png" alt="CC for Codex — copper Claude mark connected to an ivory Codex terminal" width="160" />
</p>

<p align="center">
  <img src="assets/logo.png" alt="CC for Codex — Claude Code, inside Codex" width="100%" />
</p>

# CC for Codex plugin package

This directory is the installable Codex plugin. For installation, architecture, security, official sources, and the complete feature matrix, see the repository [README](https://github.com/sanchitmonga22/cc-for-codex#readme).

The package contains six Codex skills, one dependency-free local runner, and an optional Stop review hook that is disabled per repository until separately trusted and enabled. `$claude-verify` separates installed state, local readiness, and an explicitly authorized live smoke test. The package requires a separately installed and authenticated Claude Code CLI. Reads are restricted and zero-prompt; worktree writes offer a separately confirmed dangerous default plus a zero-prompt guarded alternative. V0.2 is tested on macOS and standard Linux; WSL2 is a target but is not yet independently qualified, and native Windows is not supported. It is unofficial and is not affiliated with Anthropic or OpenAI.
