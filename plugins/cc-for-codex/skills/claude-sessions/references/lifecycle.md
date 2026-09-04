# Claude background lifecycle

Claude Code reports background job states as `working`, `blocked`, `done`, `failed`, or `stopped`. A blocked job may need a permission decision or user input, so inspect logs and attach from a real terminal.

The short 8-hex job ID is used by `attach`, `logs`, `stop`, `respawn`, and `rm`. A full UUID `sessionId` is used by headless `--resume`. They are not interchangeable.

`stop` preserves the conversation. `respawn` starts execution again and can resume usage. `rm` removes the job record and, when Claude determines it is safe, its Claude-created worktree; the transcript can remain resumable. The bridge never uses Claude's destructive `--discard-unpushed` retry.

Claude exposes recent logs rather than a stable structured result endpoint for background agents. Treat `result` as a convenience alias and verify completion through `status`.
