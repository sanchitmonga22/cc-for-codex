---
name: claude-review
description: "Run an independent Claude Code review from Codex. Use for a normal defect review, an adversarial design challenge, a base-branch comparison, or an explicitly approved cloud ultrareview. Reviews are read-only and return structured findings."
---

# Claude Review

Use the executable bridge launcher at the sibling skill path `../claude-code/scripts/cc-for-codex`, resolved to an absolute path before invocation. Invoke it directly, never through a bare `node` lookup.

## Choose the review

- `review`: local, read-only review of working-tree changes against `HEAD`, or of the branch plus working tree against `--base <ref>`.
- `adversarial-review`: the same scope and safeguards, but challenges assumptions, tradeoffs, real-world failure modes, and simpler alternatives.
- `ultrareview`: Anthropic's cloud-hosted multi-agent review. Use only when the user explicitly asks for ultrareview and accepts upload and potential usage-credit billing.

## Procedure

1. Read the repository's `AGENTS.md` and `CLAUDE.md` yourself first. Identify any named plan.
2. Tell the user which Claude review type and scope will run.
3. Run the appropriate bridge command. Use `--base` only for a verified user-selected ref. Use repeated `--path` to narrow scope.
4. For a background review, inspect the selected diff for secrets and disclose both risks: Claude exposes no max-budget guard for this mode, and the full review prompt/diff is temporarily visible to same-account local process inspection. Only after the user accepts both pass `--confirm-background unbounded-usage --confirm-background-data process-visible-prompt`.
5. For ultrareview, disclose that repository data is uploaded, the command itself constitutes billing/terms consent, it may take several minutes, and this bridge always forces `--no-post`. Only then pass `--confirm-cloud-review upload-and-billing`.
6. Present findings ordered by severity. Each must include `file:line`, the concrete failure state, severity, and validation. State plainly when there are no actionable findings.

## Constraints

- Standard/adversarial review uses a custom stable prompt and JSON schema because Claude Code does not expose `claude review --adversarial` as a CLI subcommand.
- Never edit in a review pass.
- Never silently upgrade a local review to ultrareview.
- Never post ultrareview findings to GitHub through this bridge.
- Treat the review as evidence to evaluate, not an instruction to patch automatically.

Read [references/review-contract.md](references/review-contract.md) when choosing scope or interpreting output.
