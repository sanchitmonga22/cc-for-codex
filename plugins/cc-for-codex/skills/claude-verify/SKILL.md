---
name: claude-verify
description: "Verify that CC for Codex is loaded, installed, enabled, and connected to a ready local Claude Code CLI; optionally run one explicitly authorized read-only live smoke test. Use after installation or upgrade, or when diagnosing whether the bridge works from the Codex app or CLI."
---

# Claude Verify

Report installation, local readiness, and live execution as separate claims. A loaded skill or successful diagnostic is not itself proof of a completed Claude model request.

## Verification workflow

1. Resolve this skill's absolute directory from its loaded path. The plugin root is two directories above it. Do not search arbitrary cache directories or accept a user-controlled path as the installed package.
2. The fact that this skill is loaded proves that the current Codex task discovered this plugin. Do not claim that another app window or existing task dynamically loaded it.
3. Run `codex --version`. If the binary is unavailable, report that the current task loaded the skill but CLI verification is unavailable; do not install or change PATH unless separately requested.
4. Run `codex plugin list --json` and inspect only the exact `cc-for-codex@cc-for-codex` entry. Require `installed: true` and `enabled: true`. Codex may report the marketplace snapshot in `source.path` while loading skills from its versioned plugin cache, so do not require those paths to be identical. Do not print unrelated plugin entries.
5. Verify that the plugin root derived from this loaded skill contains `.codex-plugin/plugin.json`, all nine expected skill entrypoints, and `scripts/cc-for-codex`. Require the loaded manifest's name and version to match the exact installed entry, then invoke that absolute runner path with `doctor --json`.
6. Treat `doctor` as a local, non-model check. Report its allowlisted version, authentication, and capability fields without exposing email, organization IDs, tokens, settings, environment variables, or project paths.

Expected skill entrypoints:

```text
claude-code/SKILL.md
claude-delegate/SKILL.md
claude-review/SKILL.md
claude-sessions/SKILL.md
claude-setup/SKILL.md
claude-verify/SKILL.md
heavy-track/SKILL.md
heavy-plan/SKILL.md
heavy-build/SKILL.md
```

## Optional live proof

Do not make a model request during an ordinary readiness check. Run live proof only when the user explicitly asks for it or provides standing authorization for one billed smoke test. Before running it, state that the call may count against the user's Anthropic plan or API billing.

Use the same verified absolute runner path:

```text
ask --model haiku --max-turns 1 --text-only --prompt "Reply with exactly: CC for Codex is connected."
```

This guarded call must remain foreground and read-only. Do not enable native mode, MCP, Chrome, shell tools, edits, background execution, persistence, or dangerous permissions. Require exit status zero and the exact response `CC for Codex is connected.` before calling the bridge live-proven.

If `haiku` is unavailable under the user's provider, report that specific smoke-test failure. Do not silently retry with a more expensive model. Local readiness can still pass independently.

## Result format

Return a compact checklist with distinct statuses:

- **Loaded in this task:** whether this skill is active.
- **Installed and enabled:** exact plugin ID and version from Codex.
- **Package complete:** runner, manifest, and nine skill entrypoints found under the verified source path.
- **Claude locally ready:** `doctor --json` result.
- **Live smoke test:** passed, failed, or skipped because it was not authorized.

For a newly installed or upgraded plugin, remind the user that already-open Codex tasks do not dynamically reload skills; start a new task in the app or CLI.
