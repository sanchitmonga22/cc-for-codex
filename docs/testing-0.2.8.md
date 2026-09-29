# v0.2.8 live verification

Tested 2026-09-29 using the local authenticated Claude Code CLI. `claude update`
confirmed 2.1.285 was the latest installed release.

Both Opus 5.5 and Sonnet 5.5 ran through the plugin's full-write delegation
with `high` effort, dangerous permissions, and Workflow enabled. Each received
a fresh isolated worktree containing a deliberately incorrect clamp function
and a real `node --test` check for below-range, in-range and above-range values.

Both fixed only the implementation file. Both invoked Workflow with an
implementation worker followed by an independent verification worker. The
local Workflow journals recorded actual launch, worker starts and successful
results; this was not inferred from the models' final prose. Codex independently
ran the test command in both returned worktrees:

```text
# tests 1
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

The source checkout stayed unchanged and neither task committed changes.
Worktrees are not OS sandboxes; full execution and Workflow workers retain
host-level privileges. Availability on other accounts/builds is not guaranteed.
`ultracodeRequested` means the bridge requested a workflow, not that the tool
was executed. Read-only profiles do not expose Workflow.
