---
name: claude-code
description: "Use a locally installed Claude Code CLI from Codex for a read-only second opinion, a resumable conversation, a summarized handoff, or an exact explicitly requested native Claude command. Trigger when the user asks Codex to ask, consult, invoke, or use Claude or Claude Code."
---

# Claude Code

Use the bundled bridge instead of assembling a raw `claude` shell command.

## Locate the runner

Resolve this skill's absolute directory from the loaded skill path, then use:

```text
<skill-directory>/scripts/cc-for-codex
```

Invoke that absolute launcher path directly. It resolves a Node executable outside the current repository before loading JavaScript. Never replace it with a bare `node` command, and never interpolate user text into shell syntax. Prefer `--prompt-file` for long or untrusted prompts; otherwise use stdin or a safely quoted argument.

## Default workflow

1. Tell the user that this skill is about to invoke their local Claude Code installation and that Claude usage may count against their Anthropic plan or API billing.
2. If readiness has not been established in this task, run `doctor --json`. This is a local, non-model check.
3. Use `ask` for a read-only second opinion. The bridge disables local Claude customizations, MCP, Chrome, network-capable tools, shell execution, edits, and permission prompts by default.
4. Return Claude's answer as attributed second-opinion output. Do not present it as Codex's own verified conclusion. Independently verify claims before taking consequential action.
5. If `--persist` was requested, preserve the returned Claude session UUID so a later `resume` can use it.

## Routing

- Use `$claude-review` for normal, adversarial, or ultrareview code review.
- Use `$claude-delegate` for foreground/background delegation or isolated edits.
- Use `$claude-sessions` for background status, logs, stop, respawn, removal, or attach.
- Use `$claude-setup` for installation/auth/version diagnosis.
- Use this skill's `ask`, `handoff`, and `resume` commands for general consultation.

## Hard boundaries

- Never call Claude merely because a second opinion might be interesting. The user must ask to use Claude or approve the delegation.
- Never use `--profile native`, `native`, bypass-permissions flags, Claude plugins, MCP, Chrome, remote control, cloud sessions, or configuration mutations without an exact user request and the matching bridge confirmation. `$claude-delegate` owns the separately confirmed dangerous-write workflow; ordinary read calls never activate it.
- `handoff` creates a fresh persisted Claude session from a Codex-authored brief. It does not copy hidden Codex context, tool calls, approvals, or the complete transcript.
- Do not place secrets in prompts, especially background prompts, which can be visible in a local process listing.
- Do not use native passthrough as a workaround for a rejected guarded command.

Read [references/commands.md](references/commands.md) for the complete command surface and [references/safety.md](references/safety.md) before using any opt-in mode.
