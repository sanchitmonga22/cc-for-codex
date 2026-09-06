---
name: claude-setup
description: "Check whether the local Claude Code CLI is installed, authenticated, and compatible, or manage the optional per-repository Stop review gate. Use for setup, command-not-found, auth, version, missing capabilities, or review-gate status/enable/disable."
---

# Claude Setup

Use the executable bridge launcher at the sibling skill path `../claude-code/scripts/cc-for-codex`, resolved to an absolute path. Invoke it directly, never through a bare `node` lookup.

Global workflow setup is a separate, explicit local operation. From a source
checkout, preview/apply it with `node plugins/cc-for-codex/scripts/install-global-workflow.mjs --check|--apply`;
to reverse only the marked blocks, use the matching
`uninstall-global-workflow.mjs` command. The plugin manager does not run these
filesystem mutations automatically.

Run `doctor --json` first. It is read-only, makes no model request, and reports only an allowlist of auth fields. It deliberately withholds email, organization identifiers, project directories, tokens, settings, and environment variables.

Use `doctor --full` only when the basic report is insufficient; Anthropic documents `claude doctor` as a local health check.

If Claude is missing or logged out, give the user the official Claude Code installation or login instructions. Do not install, update, authenticate, create tokens, change PATH, or edit Claude settings unless the user explicitly asks for that separate mutation.

The guarded bridge requires a recent Claude Code CLI with the reported safety and core capabilities, including structured output, background-agent JSON plus stop control, worktrees, and resume. If any are missing, recommend upgrading rather than silently dropping a required flag.

Foreground `-p --worktree` delegation skips Claude's trust prompt. Before a background/non-`-p` worktree write, the user must run Claude interactively in that repository and personally accept the prompt; do not automate that consent.

For the optional Codex Stop review hook:

- `review-gate status` and `review-gate disable` are local state operations and make no model call.
- Enable only after the user explicitly accepts that every eligible Codex Stop can invoke billed Claude usage. Then run `review-gate enable --confirm-review-gate enable-billed-stop-review`.
- Explain that the gate is disabled by default and stored in the Git common directory, so linked worktrees share it.
- Remind the user that Codex separately skips plugin hooks until they inspect and trust the current hook definition through `/hooks`; changed definitions need review again.
- Explain that v0.2 reviews the full current dirty Git tree, can block on older changes, blocks on partial evidence, performs only one review per Stop cycle, and fails open with a visible warning on runtime errors.
