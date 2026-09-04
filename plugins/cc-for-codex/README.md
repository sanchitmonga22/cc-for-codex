# CC for Codex plugin package

This directory is the installable Codex plugin. For installation, architecture, security, official sources, and the complete feature matrix, see the repository [README](https://github.com/sanchitmonga22/cc-for-codex#readme).

The package contains five Codex skills, one dependency-free local runner, and an optional Stop review hook that is disabled per repository until separately trusted and enabled. It requires a separately installed and authenticated Claude Code CLI. Reads are restricted and zero-prompt; worktree writes offer a separately confirmed dangerous default plus a zero-prompt guarded alternative. V0.1 is tested on macOS and standard Linux; WSL2 is a target but is not yet independently qualified, and native Windows is not supported. It is unofficial and is not affiliated with Anthropic or OpenAI.
