# Feature parity

The target is workflow parity with OpenAI's official reverse-direction [`codex-plugin-cc`](https://github.com/openai/codex-plugin-cc), plus honest access to Claude-specific capabilities. “Full” means the user outcome exists, not that Codex and Claude expose identical internal APIs.

## Head to head with the official reverse plugin

| Official reverse workflow | CC for Codex surface | Underlying Claude surface | Status | Important difference |
|---|---|---|---|---|
| Setup | `$claude-setup`, `setup`, `doctor` | `claude --version`, `claude auth status --json`, optional `claude doctor` | Guarded core | Diagnostics match; installation and login remain separate explicit user actions |
| Normal review | `$claude-review`, `review` | `claude -p` or guarded `claude --bg` plus bridge review prompt | Core / guarded background | Foreground has a strict schema; background requires usage and process-visible-data consent |
| Adversarial review | `$claude-review`, `adversarial-review` | Same guarded transports with an adversarial profile | Core / guarded background | Prompt semantics, not a pretend CLI flag |
| Rescue/delegation | `$claude-delegate`, `rescue` | `claude -p` or `claude --bg` | Partial by design | Fresh and explicit UUID resume exist; edits use a new worktree and cannot run Bash/tests in either write-permission profile |
| Status | `$claude-sessions`, `status` | `claude agents --json --cwd` | Full | Claude's supervisor is authoritative |
| Result | `$claude-sessions`, `result` | `claude logs <id>` | Partial | Claude has no dedicated structured background-result subcommand; an exact ID is required |
| Cancel | `$claude-sessions`, `cancel` | `claude stop <id>` | Guarded core | Recoverable stop; unlike the reverse plugin, the exact repo-scoped ID and confirmation are required |
| Transfer | `$claude-code`, `handoff` / `transfer` | Fresh persisted `claude -p` session | Partial | Claude does not expose a Codex transcript importer; hidden context/tool history cannot transfer |
| Resume | `$claude-code`, `resume` | `claude -p --resume <uuid>` | Full | Reasserts read-only bridge policy |
| Review gate | `review-gate` + bundled Stop hook | Codex Stop hook invoking the guarded structured review | Opt-in partial | Disabled by default; requires hook trust and billed-review consent; one continuation max; reviews the full dirty tree rather than only the preceding turn's edits |

## Claude-specific surface

| Workflow | Plugin surface | Underlying command | v0.2 status | Limits / risk |
|---|---|---|---|---|
| Installed/local/live verification | `$claude-verify` | `codex plugin list --json`, `doctor --json`, optional guarded `ask` | Core + optional live proof | Local checks make no model call; live proof needs explicit Anthropic-usage authorization |
| Ask Claude | `$claude-code` | `claude -p --output-format json` | Core | Read-only profile; optional persistence |
| Structured quick review | `$claude-review` | `claude -p --json-schema ...` | Core | Local model usage; tools disabled; bridge owns and inlines the Git scope/schema |
| Stop-time review gate | `review-gate` + bundled hook | One guarded structured review on Codex Stop | Opt-in partial | Per-Git-common-dir state; partial evidence blocks; runtime failures fail open; cannot attribute changes to one turn |
| Cloud ultrareview | `$claude-review` | `claude ultrareview ... --json --no-post` | Guarded core | Upload, terms, and potential credit billing require explicit consent |
| Foreground investigation | `$claude-delegate` | `claude -p` | Core | Bounded turns/timeout; no edits |
| Background quick review | `$claude-review --background` | `claude --bg` | Guarded core | Inline scope must fit the argv bound; no structured-result guarantee; diff is process-visible after explicit consent |
| Background investigation | `$claude-delegate` | `claude --bg` | Guarded core | No supported max-budget flag; process-visible prompt requires separate consent |
| Isolated file edits | `$claude-delegate --write` | `claude --worktree ...` | Explicit-risk partial | Creates `worktree-<name>`; dangerous permission bypass is the configured default behind a second exact confirmation; `guarded` is zero-prompt restricted; no Bash/WebFetch/tests; filtered, partial/promisor, shared/alternate-object, and sparse repos are refused |
| Job list/logs/stop | `$claude-sessions` | `agents --json`, `logs`, `stop` | Core | Exact 8-hex IDs, canonical cwd scope |
| Respawn/remove/attach | `$claude-sessions` | `respawn`, `rm`, `attach` | Guarded core | Billing restart, worktree deletion, or TTY boundary |
| Session continuation | `$claude-code resume` | `-p --resume <uuid>` | Core | Full UUID differs from background short ID |
| Local Claude customizations | `$claude-code --profile native` | Omit safe/restricted/strict-MCP isolation | Explicit opt-in | Hooks/plugins/MCP startup can execute; no Chrome and the read tool allowlist remain fixed |
| Finite native argv escape hatch | `native -- ...` | Bounded argv/stdin passthrough | Explicit escape hatch | Installed command-help flags are recursively audited; conservative cumulative mutation/bypass/cloud gates; live stream-JSON protocols and `--post` are refused |
| Claude plugins | `native` | `--plugin-dir`, `--plugin-url`, `claude plugin` | Native only | Can fetch or execute third-party code; no implicit install |
| Claude MCP | `native` | `--mcp-config`, `claude mcp` | Native only | Adds tools/network/credentials; not needed for the bridge |
| Custom subagents | `native` | `--agent`, `--agents` | Native only | Larger tool/context surface; not part of safe profile |
| Agent teams | `native` / docs | Experimental environment + prompt workflow | Experimental | High token use and lifecycle limitations; no stable dedicated command |
| Remote Control | `native --tty` | `--remote-control` | Interactive only | Persistent TTY and Anthropic service; not a headless workflow |
| Cloud sessions/teleport | `native --tty` | `--cloud`, `--teleport` | Interactive only | Separate cloud/data boundary |
| Chrome/computer use | Direct Claude | `--chrome` and interactive tools | Not automated | Host/UI control is outside the safe bridge contract |
| Scheduled tasks/goals/routines | Direct Claude | Interactive/cloud features | Docs only | Codex already has its own native automation/goal surfaces |

## Status definitions

- **Core:** implemented and covered by the shared wrapper/tests.
- **Guarded core:** implemented only behind explicit confirmation and isolation.
- **Partial:** useful approximation with a documented platform gap.
- **Native only:** reachable via exact, user-approved Claude argv, not modeled as a safe automatic skill action.
- **Interactive only / docs only:** use Claude directly because the feature requires a person, persistent UI, or another product surface.

## Non-parity that should remain explicit

Claude Code is not a native Codex model or subagent. The bridge cannot transfer Codex's hidden conversation state, replay approvals, guarantee identical `/review` internals, or make a user's local binary reachable from ChatGPT web/mobile. Those are product boundaries, not missing wrapper flags.

The official reverse plugin can target the immediately preceding Claude edit turn. Codex's current Stop payload does not provide trustworthy file-attribution metadata, so this project's opt-in gate reviews the entire current dirty Git tree and may report or block on older/pre-existing changes. That difference remains explicit rather than inferring authorship from prose.
