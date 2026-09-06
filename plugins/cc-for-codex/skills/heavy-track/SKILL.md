---
name: heavy-track
description: "Run the full Codex-first workflow for risky, multi-file, architectural, or multi-session work: resolve the base, explore, plan, challenge the plan, stop at one gate, implement, validate, review, fix, and report. Use for heavy track, full workflow, or when resuming substantial Codex work."
---

# Codex-first heavy track

Use this as the entrypoint when a change is expensive to get wrong. Codex owns
the plan, the active implementation checkout, validation, and the final report.
The heavy track's two cross-model rounds are Claude's read-only challenge of the
plan and review of the finished diff; request/confirm them when they may
consume Claude usage. Never let Claude and Codex edit the same checkout at the
same time.

## Default model routing

These are workflow defaults. Use the host's actual model IDs and report any
unavailable default before substituting.

- Explore: Codex `gpt-5.6-luna` at `xhigh` for architecture, invariants, and
  failure modes; Sonnet 5 Explore/analyzer for locations, call sites, and
  conventions.
- Plan and triage: GPT-6 Astra at `high`.
- Branch, implementation, validation, and fixes: GPT 5.6 Sol at `high`.
- Claude challenge and finished-diff review: Opus 5 or Fable 5.1.
- Final report: GPT-6 Astra at `high`.

## Choose the entry mode

- **Fresh:** inspect the repository and start `$heavy-plan`.
- **Resume:** reconstruct the current goal, verified work, remaining work, and
  decisions already made before starting `$heavy-plan`. Check the filesystem and
  Git state; do not trust an earlier transcript claim without evidence.
- **Autonomous:** only when the user explicitly says to run end to end, take it
  till the end, or otherwise not return for approval. Record the gate decision in
  the plan, but still obey repository safety rules and do not push, merge, or
  publish unless separately requested.

## Resolve the base before planning

Run these read-only checks from the repository root:

```bash
git rev-parse --show-toplevel
git branch --show-current
git config --get "branch.$(git branch --show-current).merge"
git symbolic-ref --quiet --short refs/remotes/origin/HEAD
git branch --all --sort=-committerdate | head -15
```

Choose the intended base in this order: an explicit user-selected ref, the
current branch's verified upstream, `origin/HEAD`, then the branch the work
visibly forked from. A tracking branch is not automatically the integration
base. If two refs remain plausible, ask before planning. Record the chosen
`BASE` and the current commit in the plan.

## Sequence

0. Resolve `BASE` (never assume `main`) and choose `fresh`, `resume`, or
   `autonomous` entry mode.
1. Announce the entry mode, resolved `BASE`, and that the planning phase is
   starting.
2. Invoke `$heavy-plan` in the same turn. Do not edit production files while
   that skill is running.
3. At the gate, show the plan summary, challenge/triage results, validation
   commands, exclusions, and unresolved decisions. Stop for an explicit go
   unless autonomous mode was granted.
4. After go, invoke `$heavy-build` and name the plan file before the first edit.
5. Return separate statuses for implemented, validated, end-to-end proven,
   Claude-reviewed, committed, merged, and deployed. Do not collapse them into
   “done.”

## Cross-model rounds

The heavy track has exactly two Claude rounds: a read-only challenge of the
written plan (round 1) and a read-only review of the finished diff against the
verified `BASE` (round 2). Use `$claude-code` for the first and `$claude-review`
for the second. Claude output is evidence to triage, not an instruction to
patch. A routine light task does not need either round, and no third round is
added automatically.

## Boundaries

- Use one writer per checkout. Claude write delegation, when explicitly
  requested, belongs in `$claude-delegate` and must use its isolated worktree;
  Codex validates and integrates the result separately.
- Do not copy personal `~/.claude` or `~/.codex` settings, credentials, model
  preferences, or machine paths into a repository workflow.
- Do not modify `.env*`, production settings, migrations, or protected branches
  without a direct request and the repository's required approval.
- Do not create a branch, commit, push, merge, open a PR, or delete a worktree
  merely because this skill was invoked. These are separate user decisions.
- If a command fails, preserve the exact command, exit status, and relevant
  redacted output in the report; never substitute an unrun check with reasoning.
