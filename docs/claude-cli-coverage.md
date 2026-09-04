# Claude CLI coverage

This ledger was checked against the locally installed Claude Code `2.1.260` on 2026-09-03 and against Anthropic's [official CLI reference](https://code.claude.com/docs/en/cli-reference). Run `npm run audit:claude` to detect drift without making a model call.

Coverage labels:

- **Guarded:** modeled by a stable bridge command with validation and fixed policy.
- **Bridge-owned:** passed internally; callers cannot override it on guarded commands.
- **Native:** available only through the exact `native -- ...` escape hatch and its confirmations.
- **Direct:** requires Claude's interactive/product UI and is documented rather than automated.
- **Deferred:** deliberately unavailable through the bridge until it has a safe, stable transport.

Unless a row is marked **Deferred**, every finite CLI option is also reachable through `native -- ...`, even when the row names only its Guarded or Bridge-owned path. The native confirmations below still apply cumulatively.

The native escape hatch is deliberately conservative. Every native call needs `--confirm-native run-native-claude`. Any member of the `auth`, `auto-mode`, `daemon`, `gateway`, `import`, `install`, `mcp`, `plugin`, `plugins`, `project`, `remote-control`, `self-hosted-runner`, `setup-token`, `stop`/`kill`, `respawn`, `rm`, or `update`/`upgrade` command families also needs `--confirm-mutation mutate-claude-state`, even when a particular subcommand is observational. Stateful flags such as `--worktree`, `--resume`, `--tools`, and `--plugin-dir` trigger that same conservative mutation gate. Cloud/network surfaces need `--confirm-cloud-review upload-and-billing`. Permission-authorizing flags need `--confirm-dangerous-permissions bypass-host-safety`; for Claude Code 2.1.260, native permission modes `acceptEdits`, `auto`, `bypassPermissions`, and `manual` are treated as authorizing, while `dontAsk` and `plan` are not. These gates are cumulative.

Native transport is finite-command argv/stdin passthrough, not universal protocol emulation. The wrapper refuses `--post` and live stream-JSON surfaces (`--input-format stream-json`, `--output-format stream-json`, `--forward-subagent-text`, `--include-hook-events`, `--include-partial-messages`, and `--replay-user-messages`). Run Claude directly for those deliberately excluded surfaces.

## Every top-level option

| Claude option | Coverage | Notes |
|---|---|---|
| `--add-dir` | Native + mutation confirmation | Expands filesystem/tool scope for that Claude invocation; exact opt-in only |
| `--advisor` | Native + mutation confirmation | Server-side advisor model; changes model/cost behavior |
| `--agent` | Native + mutation confirmation | Custom agent changes the prompt/tool contract |
| `--agents` | Native + mutation confirmation | JSON-defined agents; no model-generated JSON passthrough in guarded mode |
| `--allow-dangerously-skip-permissions` | Native + mutation/dangerous confirmation | Never used by a skill automatically |
| `--allowedTools`, `--allowed-tools` | Bridge-owned / Native + mutation/dangerous confirmation | Guarded write mode pre-approves only `Edit,Write`; native permission authorization can bypass host prompts |
| `--append-system-prompt` | Native | Guarded commands own their system contract |
| `--append-subagent-system-prompt` | Native | Changes every nested subagent prompt; guarded mode has no subagents |
| `--append-system-prompt-file` | Native | Loads host file content into the system prompt |
| `--autocompact` | Native | Session tuning, not needed for one-shot workflow |
| `--ax-screen-reader` | Native / Direct | Interactive presentation option |
| `--bg`, `--background` | Guarded / Native + mutation confirmation | Guarded workflows require separate unbounded-usage and process-visible-prompt confirmations |
| `--bare` | Native | Not the default because it disables OAuth/keychain auth |
| `--betas` | Native | API-key beta header surface |
| `--brief` | Native | SendUserMessage changes communication behavior |
| `--chrome` | Native / Direct | Guarded mode always uses `--no-chrome` |
| `--channels` | Native + cloud/mutation confirmation | Research-preview MCP notification channel surface |
| `--cloud` | Native + cloud/mutation confirmation / Direct | Separate cloud-session data boundary |
| `-c`, `--continue` | Native + mutation confirmation | Guarded continuation uses an exact UUID instead |
| `--dangerously-skip-permissions` | Write default / Native + mutation/dangerous confirmation | Automatic write profile only after the independent `bypass-host-safety` token; built-in tools remain file-only, but this is not a sandbox |
| `--dangerously-load-development-channels` | Native + mutation confirmation | Loads development channel plugins/code |
| `-d`, `--debug` | Native | Debug output may reveal local configuration |
| `--debug-file` | Native + mutation confirmation | Writes a local log file |
| `--disable-slash-commands` | Native | Safe mode already disables customization loading |
| `--disallowedTools`, `--disallowed-tools` | Bridge-owned / Native | Guarded commands use an affirmative tool allowlist |
| `--effort` | Guarded | Enum: `low`, `medium`, `high`, `xhigh`, `max`, `ultracode` |
| `--enable-auto-mode` | Native + mutation confirmation | Deprecated auto-mode alias; never implicit |
| `--environment` | Native + cloud/mutation confirmation | Self-hosted cloud environment |
| `--exclude-dynamic-system-prompt-sections` | Native | Advanced prompt-cache behavior |
| `--exec` | Native + mutation confirmation | Runs a PTY-backed shell command with `--bg` |
| `--fallback-model` | Guarded foreground / Native | Print mode only |
| `--file` | Native + cloud/mutation confirmation | Downloads cloud file resources at startup |
| `--fork-session` | Native + mutation confirmation | Guarded resume does not fork implicitly |
| `--forward-subagent-text` | Direct / Deferred | Requires live duplex stream-JSON, which native passthrough rejects |
| `--from-pr` | Native + cloud confirmation / Direct | Interactive picker or PR-linked resume |
| `-h`, `--help` | Guarded | Bridge help plus native help passthrough |
| `--ide` | Native / Direct | Interactive IDE connection |
| `--include-hook-events` | Direct / Deferred | Requires live duplex stream-JSON; hooks remain disabled in guarded mode |
| `--include-partial-messages` | Direct / Deferred | Requires live duplex stream-JSON |
| `--init` | Native + mutation confirmation | Runs initialization and can create project instructions |
| `--init-only` | Native + mutation confirmation | Initialization-only filesystem mutation |
| `--input-format` | Native for finite text / Deferred for stream-JSON | Guarded foreground uses bounded text over stdin; live duplex stream-JSON is rejected |
| `--json-schema` | Bridge-owned | Review schema is fixed; arbitrary schema is native |
| `--maintenance` | Native + mutation confirmation | Runs repository/user Setup hooks, which can execute and mutate state |
| `--max-budget-usd` | Guarded foreground | Validated decimal; unavailable for background agents |
| `--max-turns` | Bridge-owned / Native | Applied on guarded local print-mode ask/review/delegate calls; ultrareview and exact native passthrough are separate surfaces |
| `--mcp-config` | Native + mutation confirmation | Adds external tools/credentials |
| `--model` | Guarded | Conservative model-ID validation |
| `-n`, `--name` | Guarded delegation / Native + mutation confirmation | Length/control-character validation in guarded mode |
| `--no-chrome` | Bridge-owned | Always present on guarded calls |
| `--no-session-persistence` | Bridge-owned | Default for one-shot calls; omitted for handoff/resume |
| `--output-format` | Bridge-owned / Native for finite output / Deferred for stream-JSON | Guarded foreground requests JSON; native live stream-JSON is rejected |
| `--permission-mode` | Bridge-owned / Native + mutation confirmation; dangerous confirmation for authorizing modes | Guarded reads/writes use fixed modes; native `acceptEdits`, `auto`, `bypassPermissions`, and `manual` are treated as authorizing, while `dontAsk` and `plan` are not |
| `--permission-prompt-tool` | Native + mutation/dangerous confirmation | Delegates approvals to another tool/process and can authorize host actions |
| `--permission-prompts` | Bridge-owned | Automatic profiles pass `none`; its documented no-host-prompt guarantee applies to foreground print mode, while background relies on `dontAsk` or active bypass |
| `--plugin-dir` | Native + mutation confirmation | Can execute third-party plugin components |
| `--plugin-url` | Native + cloud/mutation confirmation | Fetches third-party code; exact opt-in only |
| `-p`, `--print` | Bridge-owned | Guarded foreground transport |
| `--prompt-suggestions` | Native | Additional model output, not part of stable parser |
| `--rc` | Native + cloud/mutation confirmation | Alias for Remote Control |
| `--ref` | Native + cloud/mutation confirmation | Selects checkout ref for a self-hosted/cloud environment |
| `--remote` | Native + cloud/mutation confirmation | Deprecated alias for `--cloud` |
| `--remote-control` | Native + cloud/mutation confirmation / Direct | Persistent interactive session and service connection |
| `--remote-control-session-name-prefix` | Native / Direct | Remote Control tuning |
| `--replay-user-messages` | Direct / Deferred | Requires live duplex stream-JSON |
| `--restricted` | Bridge-owned | Required on the default safe profile and optional guarded write; omitted from the incompatible dangerous write and native-customization profiles |
| `-r`, `--resume` | Guarded / Native + mutation confirmation | Full canonical UUID only in guarded mode |
| `--safe-mode` | Bridge-owned | Default reads and both write profiles; native local-customization profile omits it explicitly; enterprise-managed policy can still apply |
| `--session-id` | Native + mutation confirmation | Caller-selected UUID is outside guarded state ownership |
| `--setting-sources` | Native + mutation/dangerous confirmation | Can load permission-bypass policy/customizations from mutable files |
| `--settings` | Bridge-owned / Native + mutation/dangerous confirmation | Both write profiles supply only `worktree.baseRef=head`; the bridge independently verifies the resulting worktree commit; arbitrary native settings can enable bypass permissions |
| `--strict-mcp-config` | Bridge-owned | Default reads and both write profiles exclude user/project MCP servers; native-customization profile omits it |
| `--system-prompt` | Native | Guarded prompt contract is fixed |
| `--system-prompt-file` | Native | Replaces the prompt from a host file |
| `--system-prompt-snapshot` | Native | Advanced persisted-session behavior |
| `--teleport` | Native + cloud/mutation confirmation / Direct | Cloud-to-local interactive session transfer |
| `--teammate-mode` | Native + mutation confirmation / Direct | Agent-team display/orchestration mode |
| `--tmux` | Native / Direct | Interactive worktree terminal layout |
| `--tools` | Bridge-owned / Native + mutation confirmation | Ask/read delegation: `Read,Glob,Grep`; review: empty; write adds `Edit,Write` only |
| `--verbose` | Native | Guarded JSON parser does not need verbose stream events |
| `-v`, `--version` | Guarded | Used by doctor/audit |
| `-w`, `--worktree` | Confirmed write / Native + mutation confirmation | Generated unique name; base requested and independently verified as the pre-launch local `HEAD` |

## Every top-level command

| Claude command | Coverage | Bridge surface / reason |
|---|---|---|
| `agents` | Guarded | `status` / `agents`, JSON and canonical-cwd scoped |
| `attach` | Guarded TTY | Exact verified job ID |
| `auth` | Guarded read / Native + mutation confirmation | `doctor` reads sanitized status; login/logout is direct/native |
| `auto-mode` | Native + mutation confirmation | Classifier configuration/state |
| `daemon` | Native + mutation confirmation | Background supervisor diagnostics/lifecycle; feature-gated by build |
| `doctor` | Guarded | Optional `doctor --full` |
| `gateway` | Native + cloud/mutation confirmation / Direct | Enterprise long-running service |
| `import` | Native + mutation confirmation | Imports configuration, not Codex conversation history |
| `install` | Native + mutation confirmation | Changes Claude binary installation |
| `logs` | Guarded | Exact verified job ID |
| `mcp` | Native + mutation confirmation | MCP configuration/lifecycle; `mcp serve` does not expose Claude as a model |
| `plugin`, `plugins` | Native + mutation confirmation | Plugin install/configuration can execute third-party code |
| `project` | Native + mutation confirmation | Mutates/reads Claude project state depending on subcommand |
| `remote-control` | Native + cloud/mutation confirmation | Starts persistent remote-control service/session; feature-gated by build |
| `respawn` | Guarded | One exact job; `--all` intentionally not modeled |
| `rm` | Guarded | Terminal job state + exact confirmation; no destructive retry |
| `setup-token` | Native + mutation confirmation | Credential mutation |
| `self-hosted-runner` | Native + cloud/mutation confirmation | Long-running self-hosted environment runner; feature-gated by build |
| `stop`, `kill` | Guarded | Recoverable exact-ID stop |
| `ultrareview` | Guarded | Upload/billing consent, JSON, forced `--no-post` |
| `update`, `upgrade` | Native + mutation confirmation | Changes installed Claude Code version |

## Subcommand coverage

The audit recursively walks every command advertised through a standard `Commands:` section, plus the known feature-gated `daemon`, `remote-control`, and `self-hosted-runner` roots. Each discovered surface and every advertised option must occur on its exact ledger row. “Native” means exact argv passthrough after the applicable mutation, cloud, or dangerous confirmation; it does not mean that a Codex skill selects the option automatically.

| Exact surface | Advertised options in Claude Code 2.1.260 | Coverage |
|---|---|---|
| `claude agents` | `--add-dir`, `--agent`, `--all`, `--allow-dangerously-skip-permissions`, `--cwd`, `--dangerously-skip-permissions`, `--effort`, `--json`, `--mcp-config`, `--model`, `--permission-mode`, `--plugin-dir`, `--restricted`, `--setting-sources`, `--settings`, `--strict-mcp-config` | Guarded subset: `--json --all --cwd`; remainder native |
| `claude attach` | None | Guarded exact-ID TTY attach |
| `claude auth` | None | Guarded status probe; mutation native/direct |
| `claude auth login` | `--claudeai`, `--console`, `--email`, `--sso` | Native/direct mutation |
| `claude auth logout` | None | Native/direct mutation |
| `claude auth status` | `--json`, `--text` | Guarded sanitized `--json` probe; native use is conservatively family mutation-gated |
| `claude auto-mode` | None | Native mutation |
| `claude auto-mode config` | None | Native mutation |
| `claude auto-mode critique` | `--model` | Native mutation/model-cost surface |
| `claude auto-mode defaults` | `--label` | Native mutation |
| `claude auto-mode reset` | `--yes`, `-y` | Native mutation |
| `claude daemon` | `--any`, `--json-path`, `--keep-workers`, `--log-file` | Native mutation; feature-gated |
| `claude doctor` | None | Guarded optional full diagnostic with output withheld |
| `claude gateway` | `--config` | Native cloud/mutation; direct recommended |
| `claude import` | `--dry-run`, `--yes` | Native mutation |
| `claude install` | `--force` | Native mutation |
| `claude logs` | None | Guarded exact-ID lookup |
| `claude mcp` | None | Native mutation |
| `claude mcp add` | `--callback-port`, `--client-id`, `--client-secret`, `--env`, `--header`, `--scope`, `--transport`, `-H`, `-e`, `-s`, `-t` | Native mutation; secrets remain caller-owned |
| `claude mcp add-from-claude-desktop` | `--scope`, `-s` | Native mutation |
| `claude mcp add-json` | `--client-secret`, `--scope`, `-s` | Native mutation; secrets remain caller-owned |
| `claude mcp get` | None | Native read, conservatively family mutation-gated |
| `claude mcp list` | None | Native read, conservatively family mutation-gated |
| `claude mcp login` | `--no-browser` | Native credential mutation |
| `claude mcp logout` | None | Native credential mutation |
| `claude mcp remove` | `--scope`, `-s` | Native mutation |
| `claude mcp reset-project-choices` | None | Native mutation |
| `claude mcp serve` | `--debug`, `--verbose`, `-d` | Native tool-server surface, conservatively family mutation-gated; not a Claude answer endpoint |
| `claude plugin` | None | Native mutation |
| `claude plugin details` | None | Native read, conservatively family mutation-gated |
| `claude plugin disable` | `--all`, `--scope`, `-a`, `-s` | Native mutation |
| `claude plugin enable` | `--scope`, `-s` | Native mutation |
| `claude plugin eval` | `--ablation`, `--allow-tools`, `--case`, `--debug-file`, `--eval-dir`, `--json`, `--judge-model`, `--keep-temp`, `--max-cost-usd`, `--mocks`, `--model`, `--no-publish`, `--no-scaffold`, `--output-dir`, `--publish-report`, `--report`, `--runs`, `--scaffold`, `--tag`, `--threshold`, `--verbose` | Native billed/mutation surface |
| `claude plugin eval init` | `--bare`, `--eval-dir`, `--interactive`, `-i` | Native mutation |
| `claude plugin init` | `--author`, `--author-email`, `--description`, `--force`, `--with`, `-f` | Native mutation |
| `claude plugin install` | `--config`, `--scope`, `--yes`, `-s`, `-y` | Native third-party-code mutation |
| `claude plugin list` | `--available`, `--json` | Native read/network surface, conservatively family mutation-gated |
| `claude plugin marketplace` | None | Native mutation/read |
| `claude plugin marketplace add` | `--scope`, `--sparse` | Native third-party-code mutation |
| `claude plugin marketplace list` | `--json` | Native read, conservatively family mutation-gated |
| `claude plugin marketplace remove` | `--scope` | Native mutation |
| `claude plugin marketplace update` | None | Native network/mutation |
| `claude plugin prune` | `--dry-run`, `--scope`, `--yes`, `-s`, `-y` | Native mutation |
| `claude plugin tag` | `--dry-run`, `--force`, `--message`, `--push`, `--remote`, `-f`, `-m` | Native Git/network mutation |
| `claude plugin uninstall` | `--keep-data`, `--prune`, `--scope`, `--yes`, `-s`, `-y` | Native mutation |
| `claude plugin update` | `--scope`, `--yes`, `-s`, `-y` | Native network/mutation |
| `claude plugin validate` | `--json`, `--strict` | Native read, conservatively family mutation-gated |
| `claude project` | None | Native project-state surface, conservatively family mutation-gated |
| `claude project purge` | `--all`, `--dry-run`, `--interactive`, `--yes`, `-i`, `-y` | Native destructive mutation |
| `claude remote-control` | `--capacity`, `--continue`, `--create-session-in-dir`, `--debug-file`, `--name`, `--no-create-session-in-dir`, `--permission-mode`, `--remote-control-session-name-prefix`, `--session-id`, `--spawn`, `--verbose`, `-c`, `-v` | Native cloud/mutation; feature-gated |
| `claude respawn` | None | Guarded exact stopped-ID respawn; native use is mutation-gated |
| `claude rm` | `--discard-unpushed` | Guarded terminal-ID removal; native use is mutation-gated and the guarded bridge never passes `--discard-unpushed` |
| `claude self-hosted-runner` | `--api-url`, `--base-dir`, `--capacity`, `--client-label`, `--configure-git`, `--confine-repo-settings`, `--debug-token-dir`, `--defer-shutdown-max-min`, `--drain-grace-sec`, `--drain-wait-sec`, `--environment-secret-file`, `--exec-path`, `--exit-if-unused-min`, `--git-host-rewrite`, `--git-ssh-rewrite`, `--health-port`, `--hooks-dir`, `--kill-session-after-min`, `--lock-to-account`, `--log-file`, `--log-level`, `--post-session-hook-timeout-sec`, `--proxy-authorization-command`, `--proxy-authorization-file`, `--push-outcome-on-release`, `--release-idle-session-min`, `--retire-at`, `--session-stop-grace-sec`, `--startup-timeout-min`, `--trust-workspace`, `--use-anthropic-git-proxy` | Native cloud/mutation; feature-gated |
| `claude setup-token` | None | Native credential mutation/direct |
| `claude stop` | None | Guarded exact-ID stop; native use is mutation-gated |
| `claude ultrareview` | `--json`, `--no-post`, `--post`, `--timeout` | Guarded billed upload with forced `--no-post`; `--post` rejected globally |
| `claude update` | None | Native installation mutation |

The bridge intentionally rejects `--post`, even in native passthrough. A person who explicitly wants Claude to write a PR comment should run that command directly and review the target first.
