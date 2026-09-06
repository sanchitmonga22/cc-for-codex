---
name: heavy-plan
description: "Explore a substantial Codex task and produce an evidence-backed implementation plan with alternatives, risks, validation, and a read-only Claude challenge. Use as the planning phase of heavy-track or when asked for a full implementation plan."
---

# Codex-first planning

This phase produces a plan; it does not implement production code. Codex is the
primary investigator. Use repository evidence and the user's request as the
source of truth. Claude's plan challenge is the first of the heavy track's two
cross-model rounds. Invoke `$claude-code` after the plan is written when the
heavy cross-model workflow is selected and the usage is approved.

## Default model routing

- Explore concurrently in one message: Codex `gpt-5.6-luna` at `xhigh` for
  architecture, invariants, and failure modes; Sonnet 5 Explore/analyzer for
  locations, call sites, and conventions.
- Plan: GPT-6 Astra at `high`.
- Challenge: Opus 5 or Fable 5.1, read-only and aimed at the plan rather than
  production code.
- Triage: GPT-6 Astra at `high`; confidence is not evidence.

## Establish the starting state

Read the applicable `AGENTS.md`, `CLAUDE.md`, contributor instructions, and
existing project validation guidance. Inspect, without mutation:

```bash
git status --short --branch
git log -8 --oneline --decorate
git diff --stat
git diff --name-status
```

Record the resolved `BASE`, current commit, working-tree state, and any
uncommitted user work. On a resume, add a **Starting state** section containing:

- the goal as it stands now;
- what is verified in the checkout (not merely claimed in chat);
- what remains;
- decisions that must not be relitigated; and
- dead ends already ruled out.

Do not reset, clean, stash, or overwrite existing work to make exploration
easier.

## Explore narrowly

Trace the requested behavior from its entrypoint to its side effects. Identify
the exact files and symbols involved, existing patterns to follow, test seams,
and process boundaries. Run cheap read-only searches before broad scans. When
parallel Codex subagents are useful, dispatch all agents in one message,
concurrently, with one narrow question per agent and an isolated workspace;
reconcile their claims against the checkout before using them. Five questions
means five shallow answers. Claude subagents are not a substitute for this
investigation.

Before writing a claim into the plan, verify it against the source file or a
command result. Distinguish facts, assumptions, and open questions.

## Write the plan artifact

Write the plan to a local plan file outside the production diff (for example,
the user's Codex plan store), and report its absolute path. Do not commit the
plan unless the user asks. Include:

1. **Goal and acceptance criteria** — observable outcomes, not implementation
   slogans.
2. **Starting state** — required for resumed work.
3. **Base and branch** — exact refs and current commit.
4. **Approach** — file-by-file changes, data/control flow, and why this design
   fits existing conventions.
5. **Alternatives rejected** — the simpler or safer options considered and why
   they lost.
6. **Validation** — exact lint, unit, integration, and end-to-end commands;
   state what output proves each criterion.
7. **Risks and assumptions** — include permissions, concurrency, rollback,
   compatibility, and data exposure where relevant.
8. **Out of scope** — explicit exclusions that keep implementation bounded.
9. **Deviation log** — initially empty, to be updated during implementation.

Do not start a branch or edit production files before the approval gate unless
autonomous mode was explicitly granted by the user.

## Optional Claude challenge

When authorized, tell the user that a read-only Claude request is about to run
and may consume their Anthropic plan or API budget. Invoke `$claude-code` with a
short prompt containing the plan and asking for:

- assumptions that are contradicted by repository evidence;
- missing failure modes or acceptance tests;
- compatibility and rollback risks; and
- a simpler viable alternative.

Do not include secrets, credentials, full unrelated files, or hidden context.
Claude must not edit, run shell commands, delegate, or post findings. Record
its output as an attributed challenge, then triage every point:

| Verdict | Meaning |
| --- | --- |
| ACCEPT | Evidence supports the finding; update the plan before the gate. |
| INVESTIGATE | Check the repository or run a bounded read-only probe, then re-verdict. |
| REJECT | State the concrete file, command, or invariant that disproves it. |

Never carry an unresolved `INVESTIGATE` item through the gate.

## End state

Present the plan path, concise summary, triage table, exact validation plan,
out-of-scope list, and the single gate question. In autonomous mode, record the
decision and continue to `$heavy-build`; otherwise stop and wait. A plan is not
approval to implement, commit, push, or merge.
