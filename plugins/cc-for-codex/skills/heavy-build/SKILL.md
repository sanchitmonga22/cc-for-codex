---
name: heavy-build
description: "Implement an approved Codex heavy-track plan, validate it with real commands, prove end-to-end behavior when applicable, obtain the second read-only Claude diff review, and report verified status. Use after heavy-plan approval or in explicitly autonomous mode."
---

# Codex-first implementation

Use this phase only after `$heavy-plan` has produced a plan and the user has
approved it, or autonomous mode was explicitly granted. Codex writes and
validates the active checkout. Claude Code reviews the finished diff in the
second cross-model round, but it does not share the checkout as a writer.

## Default model routing

- Branch, implementation, validation, and fixes: GPT 5.6 Sol at `high`.
- Finished-diff review: Opus 5 or Fable 5.1 with Claude Code.
- Report: GPT-6 Astra at `high`.

## Before the first edit

1. Read the named plan, applicable `AGENTS.md`/`CLAUDE.md`, and current Git
   status. Confirm the plan's `BASE` and acceptance criteria still match the
   repository; if they do not, stop and return to planning.
2. Preserve unrelated user changes. Do not reset, clean, stash, or silently
   include them in the implementation.
3. Work on a dedicated branch when the approved plan or repository policy calls
   for one. Resolve the branch name with the user when it is ambiguous. Never
   commit directly to a protected/default branch without explicit permission.
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

For user-facing or process-boundary changes, perform an end-to-end check in a
safe, representative environment. Report the input, observable result, and
limitations. Keep credentials, tokens, and unrelated machine details out of the
report.

## Finished-diff review

When the heavy cross-model workflow is selected, tell the user a read-only
Claude review is about to run and may consume Anthropic usage. Invoke
`$claude-review` against the plan's verified `BASE`, narrowing with paths only
when that matches the acceptance criteria. Do not use Claude's write delegation
for this review.

Triage findings in severity order:

| Verdict | Required action |
| --- | --- |
| ACCEPT | Fix the defect in the Codex checkout and add or adjust a regression check. |
| INVESTIGATE | Verify the claim with code or a bounded command, then re-verdict it. |
| REJECT | Record the concrete evidence and why the finding does not apply. |

Resolve every `ACCEPT` and `INVESTIGATE` item before reporting completion. Then
rerun the affected validation and the full plan command set. Do not run a third
automatic Claude round; ask the user if another opinion is desired.

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
