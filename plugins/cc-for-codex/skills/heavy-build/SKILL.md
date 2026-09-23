---
name: heavy-build
description: "Implement an approved Codex heavy-track plan, validate it with real commands, prove end-to-end behavior when applicable, obtain the second read-only Claude diff review, and report verified status. Use after heavy-plan approval or in explicitly autonomous mode."
---

# Codex-first implementation

Use this phase only after `$heavy-plan` has produced a final GPT-6 Sol plan and
the user has approved it, or autonomous mode was explicitly granted. GPT-6 Sol
writes and validates the active checkout by default. If the user explicitly
selects Claude execution, Claude Opus 5.5 writes and runs commands in a
generated worktree; Codex still integrates, validates, reviews, and reports.

## Default model routing

- Branch, implementation, validation, and fixes: GPT-6 Sol at `high`.
- Finished-diff review: Claude Opus 5.5 (`claude-opus-5-5`) with Claude Code.
  Use Fable 5.1 (`claude-fable-5-1`) only when explicitly requested for a
  long-horizon review; Sonnet 5 (`claude-sonnet-5`) remains the fast option.
- Report: GPT-6 Sol at `high`.

## Select the executor

Choose one mode before the first edit and record it in the plan/report:

- **Codex (default):** implement in the active Codex worktree with GPT-6 Sol.
- **Claude Opus 5.5 (explicit):** use the verified runner with
  `delegate --write --execution full --model claude-opus-5-5 --effort high`,
  `--confirm-write isolated-worktree`,
  `--confirm-dangerous-permissions bypass-host-safety`, and
  `--confirm-execution full-host-access`. This enables `Bash` and bypasses
  Claude prompts inside the generated worktree. It is not an OS sandbox; do
  not pass it for ordinary reviews. For a watchable background run, add the
  two background confirmations and monitor it with `$claude-sessions`.

Claude execution must never reuse or concurrently edit the Codex checkout.
Inspect the wrapper-verified worktree, branch, base, diff, and Claude's real
command output before integrating anything.

## Before the first edit

1. Read the named plan, applicable `AGENTS.md`/`CLAUDE.md`, and current Git
   status. Confirm the plan's `BASE` and acceptance criteria still match the
   repository; if they do not, stop and return to planning.
2. Preserve unrelated user changes. Do not reset, clean, stash, or silently
   include them in the implementation.
3. For Codex execution, work on a dedicated branch when the approved plan or
   repository policy calls for one. For Claude execution, the bridge creates a
   verified worktree branch from the plan's `BASE`; do not create a second
   concurrent writer branch. Never commit directly to a protected/default
   branch without explicit permission.
4. Record the plan path and implementation start in the deviation log.

## Implement within scope

Make the smallest correct changes described by the plan. Follow the repository's
existing patterns for errors, logging, configuration, tests, and documentation.
Keep unrelated cleanup out of the diff. If new evidence changes the design,
pause and record the deviation with its reason, impact, and updated validation;
do not quietly expand scope.

If Claude is asked to implement a bounded slice, use `$claude-delegate` so it
gets a verified isolated worktree. Inspect its returned path, branch, base
commit, and diff before copying or integrating anything. Never let a Claude
write session and Codex edit the same checkout concurrently.

## Validate honestly

Run the exact commands named in the plan, plus focused checks for changed
behavior. Capture real output and exit codes. If a command cannot run, state
the environmental blocker and what remains unproven; do not label unit tests as
end-to-end proof.

The selected executor must report real validation output when it has execution
access. Codex then reruns the repository's real validation command from the
integration checkout regardless of executor. For user-facing or process-boundary
changes, perform an end-to-end check in a safe, representative environment.
Report the input, observable result, and limitations. Keep credentials, tokens,
and unrelated machine details out of the report.

## Finished-diff review

When the heavy cross-model workflow is selected, both model perspectives review
the implementation: GPT-6 Sol inspects the integrated diff and validation
evidence, then tell the user a read-only Claude review is about to run and may
consume Anthropic usage. Invoke `$claude-review` with Claude Opus 5.5 against
the plan's verified `BASE`, narrowing with paths only when that matches the
acceptance criteria. Do not use Claude's write delegation for this review.

Triage findings in severity order:

| Verdict | Required action |
| --- | --- |
| ACCEPT | Fix the defect in the Codex checkout and add or adjust a regression check. |
| INVESTIGATE | Verify the claim with code or a bounded command, then re-verdict it. |
| REJECT | Record the concrete evidence and why the finding does not apply. |

Resolve every `ACCEPT` and `INVESTIGATE` item before reporting completion. GPT-6
Sol owns triage and the final fixes unless the user explicitly selects another
executor for a new bounded write task. Then rerun the affected validation and
the full plan command set. Do not run a third automatic Claude round; ask the
user if another opinion is desired.

## Report and handoff

Write or update the plan-adjacent report only when the plan or user requests a
report. Include:

- files changed and the reason for each;
- deviations and decisions made without the user;
- validation commands with real results;
- end-to-end evidence and limitations;
- Claude review findings and triage, if a review ran; and
- explicit statuses for implemented, tested, proven, reviewed, committed,
  merged, and deployed.

Do not push, merge, open a pull request, publish, or delete worktrees unless
the user separately asks. If the user asks for one of those actions later,
re-check the branch, diff, remote, and current CI state first.
