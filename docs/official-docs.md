# Official documentation ledger

The [Claude Code documentation index](https://code.claude.com/docs/llms.txt) is the canonical inventory. The companion [complete coverage snapshot](claude-docs-coverage.md) classifies all 191 English pages present on 2026-09-03; `npm run audit:docs` detects a new page or CLI surface. This decision ledger expands the sources that materially affect the bridge and avoids community reverse engineering as a behavioral source.

## OpenAI: skills and plugins

| Source | How it informed this project |
|---|---|
| [Build skills](https://learn.chatgpt.com/docs/build-skills) | Skills contain reusable instructions/resources/scripts and can be invoked explicitly with `$skill-name` |
| [Build plugins](https://learn.chatgpt.com/docs/build-plugins) | A plugin is the installable bundle for skills, MCP, or both |
| [Package your plugin](https://developers.openai.com/plugins/build/plugins) | Manifest and local/Git marketplace package shape |
| [Build plugin skills](https://developers.openai.com/plugins/build/skills) | Skills-only plugins may bundle executable scripts |
| [Hooks](https://learn.chatgpt.com/docs/hooks) | Stop input/output contract, loop guard, silent-success behavior, trust, and timeout handling |
| [Package lifecycle hooks](https://developers.openai.com/plugins/build/plugins#lifecycle-hooks) | Default `hooks/hooks.json` discovery and `${PLUGIN_ROOT}` command resolution |
| [Connect and test](https://developers.openai.com/plugins/deploy/connect-chatgpt) | Local/developer testing and product boundaries |
| [Submit a plugin](https://developers.openai.com/plugins/deploy/submission) | Skills-only submission path, identity, listing, and test-case requirements |
| [App review](https://developers.openai.com/plugins/deploy/app-review) | Supported-surface and public endpoint expectations |
| [Plugin guidelines](https://developers.openai.com/plugins/app-guidelines) | Third-party authorization, unofficial connector, IP, privacy, and listing rules |
| [Submit a Claude plugin](https://developers.openai.com/plugins/guides/submit-claude-plugin) | Clean-environment dependency and local credential caveats |
| [Plugins in Codex](https://help.openai.com/en/articles/20001256-plugins-in-codex/) | Codex installation/distribution model |

## Claude Code: transport and lifecycle

| Source | Bridge decision |
|---|---|
| [CLI reference](https://code.claude.com/docs/en/cli-reference) | Canonical commands/flags; mirrored in the coverage ledger |
| [Run programmatically](https://code.claude.com/docs/en/headless) | `-p`, stdin, JSON, JSON Schema, budget and turn controls |
| [Authentication](https://code.claude.com/docs/en/authentication) | Reuse the user's local authenticated CLI; never broker credentials |
| [Troubleshoot install/login](https://code.claude.com/docs/en/troubleshoot-install) | Setup error guidance |
| [Manage sessions](https://code.claude.com/docs/en/sessions) | Persisted IDs, resume, continue, forks, and session naming |
| [Agent view/background sessions](https://code.claude.com/docs/en/agent-view) | `--bg`, `agents --json`, ID/state schema, logs/stop/respawn/rm/attach |
| [Run agents in parallel](https://code.claude.com/docs/en/agents) | Distinguishes sessions, subagents, agent teams, and workflows |
| [Worktrees](https://code.claude.com/docs/en/worktrees) | `baseRef`, cleanup, shared Git state, and `.worktreeinclude` secret-copy risk |
| [Ultrareview](https://code.claude.com/docs/en/ultrareview) | Cloud upload, consent, pricing/credits, timeouts, and `--no-post` |
| [Costs](https://code.claude.com/docs/en/costs) | Usage disclosure and foreground limits |

## Claude Code: permissions and trust

| Source | Bridge decision |
|---|---|
| [Permission modes](https://code.claude.com/docs/en/permission-modes) | `dontAsk` for zero-prompt reads/guarded writes; dangerous write bypass only after its separate exact confirmation |
| [Configure permissions](https://code.claude.com/docs/en/permissions) | Tool allowlisting and protected-path behavior |
| [Sandboxed Bash](https://code.claude.com/docs/en/sandboxing) | A worktree is not a shell/host sandbox; no Bash in either automatic write mode |
| [Sandbox environments](https://code.claude.com/docs/en/sandbox-environments) | Full-tool native calls belong in a container/VM |
| [Security](https://code.claude.com/docs/en/security) | Repository trust and least-privilege baseline |
| [Data usage](https://code.claude.com/docs/en/data-usage) | Provider data policy remains external to this wrapper |
| [Zero data retention](https://code.claude.com/docs/en/zero-data-retention) | Ultrareview availability limitation |

## Claude Code: extensions deliberately isolated from default mode

| Source | Coverage |
|---|---|
| [Extension overview](https://code.claude.com/docs/en/features-overview) | Classifies CLAUDE.md, skills, subagents, hooks, MCP, and plugins |
| [`.claude` directory](https://code.claude.com/docs/en/claude-directory) | Explains local customizations disabled by safe mode |
| [Skills](https://code.claude.com/docs/en/skills) | Claude-side skills are not Codex skills; native opt-in only |
| [Custom subagents](https://code.claude.com/docs/en/sub-agents) | Native opt-in only |
| [Agent teams](https://code.claude.com/docs/en/agent-teams) | Experimental/high-cost; not a deterministic guarded command |
| [Cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging) | Native only; the bridge never grants one session authority over another implicitly |
| [Dynamic workflows](https://code.claude.com/docs/en/workflows) | Executes generated orchestration; native/full-trust only |
| [Hooks guide](https://code.claude.com/docs/en/hooks-guide) and [reference](https://code.claude.com/docs/en/hooks) | Claude-side executable customization disabled by the automatic safe profile; distinct from this plugin's opt-in Codex Stop hook |
| [MCP](https://code.claude.com/docs/en/mcp) | Native opt-in; `mcp serve` exposes tools rather than a Claude answer endpoint |
| [Create Claude plugins](https://code.claude.com/docs/en/plugins) and [reference](https://code.claude.com/docs/en/plugins-reference) | Native opt-in; separate plugin format from Codex |
| [Plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces), [dependencies](https://code.claude.com/docs/en/plugin-dependencies), [hints](https://code.claude.com/docs/en/plugin-hints), and [relevance](https://code.claude.com/docs/en/plugin-relevance) | Claude-side distribution features; reachable only through separately confirmed native operations |
| [Channels](https://code.claude.com/docs/en/channels) and [channels reference](https://code.claude.com/docs/en/channels-reference) | Research-preview inbound MCP events; native cloud/mutation boundary only |
| [Artifacts](https://code.claude.com/docs/en/artifacts) | Publishing/sharing surface; never automated by guarded workflows |
| [Advisor](https://code.claude.com/docs/en/advisor) | Native model/cost option; guarded workflows keep their fixed model contract unless the user selects a supported primary model |
| [Settings](https://code.claude.com/docs/en/settings) and [settings reference](https://code.claude.com/docs/en/settings-reference) | Safe mode excludes local sources; bridge supplies one generated worktree setting |
| [Environment variables](https://code.claude.com/docs/en/env-vars) | Environment is inherited for auth but never logged |
| [Tools reference](https://code.claude.com/docs/en/tools-reference) | Fixed read/file-edit tool profiles |

## Claude Code: interactive/cloud surfaces

| Source | Coverage |
|---|---|
| [Remote Control](https://code.claude.com/docs/en/remote-control) | Direct/native TTY only |
| [Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web) | `--cloud`/`--teleport` direct/native only |
| [Chrome](https://code.claude.com/docs/en/chrome) | Disabled in guarded mode |
| [Computer use](https://code.claude.com/docs/en/computer-use) | Outside bridge automation scope |
| [Interactive mode](https://code.claude.com/docs/en/interactive-mode) | Attach/TTY boundary |
| [Commands](https://code.claude.com/docs/en/commands) | Interactive slash commands are not assumed to be headless CLI subcommands |
| [Checkpointing](https://code.claude.com/docs/en/checkpointing) | Claude-owned interactive edit history, not bridge state |
| [Goals](https://code.claude.com/docs/en/goal), [scheduled tasks](https://code.claude.com/docs/en/scheduled-tasks), and [routines](https://code.claude.com/docs/en/routines) | Claude automation surfaces; use directly/native rather than creating a hidden second scheduler inside Codex |
| [Self-hosted environments](https://code.claude.com/docs/en/self-hosted-environments) and [feature availability](https://code.claude.com/docs/en/feature-availability) | Provider/plan-dependent cloud execution; native-only and separately confirmed |
| [Model configuration](https://code.claude.com/docs/en/model-config) | Validated model and effort passthrough |
| [Errors](https://code.claude.com/docs/en/errors) | Actionable setup/runtime failure reporting |

## Agent SDK

The [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview) and [quickstart](https://code.claude.com/docs/en/agent-sdk/quickstart) are the likely phase-two transport if the project needs permission callbacks, structured streaming, and nested-agent event fidelity. V0.1 avoids adding that dependency until those capabilities are required.
