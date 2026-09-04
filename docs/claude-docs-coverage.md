# Claude documentation coverage

Snapshot: 2026-09-03. Canonical source: [Claude Code docs index](https://code.claude.com/docs/llms.txt).

This is the complete English-page inventory exposed by the official index at the snapshot date. Every page receives a disposition so new Claude features cannot disappear behind a vague “docs reviewed” claim. The bridge-critical pages marked **Core design input** were used directly for command, safety, lifecycle, and data-boundary decisions. **Native/direct mapping** pages describe supported Claude product surfaces that are intentionally available only through the guarded native escape hatch or Claude itself. **Deployment/product context** affects compatibility but is not reimplemented. Agent SDK pages are a possible future transport and remain explicitly deferred. Weekly updates and legal/glossary pages are retained as reference history.

The official index also links 11 translated indexes; they mirror the English feature inventory and are not duplicated here. Run `npm run audit:docs` to compare this file and the CLI ledger with the current official sources.

| # | Official page | Disposition |
|---:|---|---|
| 1 | [Overview](https://code.claude.com/docs/en/overview.md) | Core design input |
| 2 | [Quickstart](https://code.claude.com/docs/en/quickstart.md) | Core design input |
| 3 | [Claude Code changelog](https://code.claude.com/docs/en/changelog.md) | Core design input |
| 4 | [How Claude Code works](https://code.claude.com/docs/en/how-claude-code-works.md) | Core design input |
| 5 | [Extend Claude Code](https://code.claude.com/docs/en/features-overview.md) | Core design input |
| 6 | [Explore the .claude directory](https://code.claude.com/docs/en/claude-directory.md) | Core design input |
| 7 | [Explore the context window](https://code.claude.com/docs/en/context-window.md) | Core design input |
| 8 | [How Claude Code uses prompt caching](https://code.claude.com/docs/en/prompt-caching.md) | Core design input |
| 9 | [How Claude remembers your project](https://code.claude.com/docs/en/memory.md) | Core design input |
| 10 | [Manage sessions](https://code.claude.com/docs/en/sessions.md) | Core design input |
| 11 | [Common workflows](https://code.claude.com/docs/en/common-workflows.md) | Core design input |
| 12 | [Prompt library](https://code.claude.com/docs/en/prompt-library.md) | Core design input |
| 13 | [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices.md) | Core design input |
| 14 | [Platforms and integrations](https://code.claude.com/docs/en/platforms.md) | Core design input |
| 15 | [Continue local sessions from any device with Remote Control](https://code.claude.com/docs/en/remote-control.md) | Core design input |
| 16 | [Claude Code on mobile](https://code.claude.com/docs/en/mobile.md) | Native/direct mapping |
| 17 | [Use Claude Code with Chrome](https://code.claude.com/docs/en/chrome.md) | Core design input |
| 18 | [Let Claude use your computer from the CLI](https://code.claude.com/docs/en/computer-use.md) | Core design input |
| 19 | [Use Claude Code in VS Code](https://code.claude.com/docs/en/vs-code.md) | Native/direct mapping |
| 20 | [JetBrains IDEs](https://code.claude.com/docs/en/jetbrains.md) | Native/direct mapping |
| 21 | [Claude Code in Slack](https://code.claude.com/docs/en/slack.md) | Native/direct mapping |
| 22 | [Claude Tag](https://code.claude.com/docs/en/claude-tag.md) | Native/direct mapping |
| 23 | [Get started with Claude Code on the web](https://code.claude.com/docs/en/web-quickstart.md) | Native/direct mapping |
| 24 | [Use Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web.md) | Core design input |
| 25 | [Automate work with routines](https://code.claude.com/docs/en/routines.md) | Core design input |
| 26 | [Find bugs with ultrareview](https://code.claude.com/docs/en/ultrareview.md) | Core design input |
| 27 | [Get started with the desktop app](https://code.claude.com/docs/en/desktop-quickstart.md) | Native/direct mapping |
| 28 | [Desktop application](https://code.claude.com/docs/en/desktop.md) | Native/direct mapping |
| 29 | [Claude Desktop on Linux (beta)](https://code.claude.com/docs/en/desktop-linux.md) | Native/direct mapping |
| 30 | [Claude Code Desktop in WSL](https://code.claude.com/docs/en/desktop-wsl.md) | Native/direct mapping |
| 31 | [Schedule recurring tasks in Claude Code Desktop](https://code.claude.com/docs/en/desktop-scheduled-tasks.md) | Native/direct mapping |
| 32 | [Test iOS apps in the simulator](https://code.claude.com/docs/en/desktop-ios-simulator.md) | Native/direct mapping |
| 33 | [Catch security issues as Claude writes code](https://code.claude.com/docs/en/security-guidance.md) | Core design input |
| 34 | [Scan your codebase for vulnerabilities](https://code.claude.com/docs/en/claude-security.md) | Core design input |
| 35 | [Code Review](https://code.claude.com/docs/en/code-review.md) | Core design input |
| 36 | [Claude Code GitHub Actions](https://code.claude.com/docs/en/github-actions.md) | Native/direct mapping |
| 37 | [Use Claude Code GitHub Actions with cloud providers](https://code.claude.com/docs/en/github-actions-cloud-providers.md) | Native/direct mapping |
| 38 | [Claude Code with GitHub Enterprise Server](https://code.claude.com/docs/en/github-enterprise-server.md) | Native/direct mapping |
| 39 | [Claude Code GitLab CI/CD](https://code.claude.com/docs/en/gitlab-ci-cd.md) | Native/direct mapping |
| 40 | [Run agents in parallel](https://code.claude.com/docs/en/agents.md) | Core design input |
| 41 | [Create custom subagents](https://code.claude.com/docs/en/sub-agents.md) | Core design input |
| 42 | [Manage multiple agents with agent view](https://code.claude.com/docs/en/agent-view.md) | Core design input |
| 43 | [Orchestrate teams of Claude Code sessions](https://code.claude.com/docs/en/agent-teams.md) | Core design input |
| 44 | [Message your other Claude Code sessions](https://code.claude.com/docs/en/cross-session-messaging.md) | Core design input |
| 45 | [Orchestrate subagents at scale with dynamic workflows](https://code.claude.com/docs/en/workflows.md) | Core design input |
| 46 | [Run parallel sessions with worktrees](https://code.claude.com/docs/en/worktrees.md) | Core design input |
| 47 | [Connect to MCP servers](https://code.claude.com/docs/en/mcp-quickstart.md) | Core design input |
| 48 | [Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp.md) | Core design input |
| 49 | [Extend Claude with skills](https://code.claude.com/docs/en/skills.md) | Core design input |
| 50 | [Discover and install prebuilt plugins through marketplaces](https://code.claude.com/docs/en/discover-plugins.md) | Core design input |
| 51 | [Create plugins](https://code.claude.com/docs/en/plugins.md) | Core design input |
| 52 | [Share session output as artifacts](https://code.claude.com/docs/en/artifacts.md) | Core design input |
| 53 | [Automate actions with hooks](https://code.claude.com/docs/en/hooks-guide.md) | Core design input |
| 54 | [Push events into a running session with channels](https://code.claude.com/docs/en/channels.md) | Core design input |
| 55 | [Run prompts on a schedule](https://code.claude.com/docs/en/scheduled-tasks.md) | Core design input |
| 56 | [Keep Claude working toward a goal](https://code.claude.com/docs/en/goal.md) | Core design input |
| 57 | [Run Claude Code programmatically](https://code.claude.com/docs/en/headless.md) | Core design input |
| 58 | [Launch sessions from links](https://code.claude.com/docs/en/deep-links.md) | Core design input |
| 59 | [Set up Claude Code in a monorepo or large codebase](https://code.claude.com/docs/en/large-codebases.md) | Core design input |
| 60 | [Troubleshoot installation and login](https://code.claude.com/docs/en/troubleshoot-install.md) | Core design input |
| 61 | [Troubleshooting](https://code.claude.com/docs/en/troubleshooting.md) | Core design input |
| 62 | [Debug your configuration](https://code.claude.com/docs/en/debug-your-config.md) | Core design input |
| 63 | [Error reference](https://code.claude.com/docs/en/errors.md) | Core design input |
| 64 | [Set up Claude Code for your organization](https://code.claude.com/docs/en/admin-setup.md) | Deployment/product context |
| 65 | [Advanced setup](https://code.claude.com/docs/en/setup.md) | Core design input |
| 66 | [Authentication](https://code.claude.com/docs/en/authentication.md) | Core design input |
| 67 | [Deploy managed settings](https://code.claude.com/docs/en/managed-settings.md) | Deployment/product context |
| 68 | [Configure server-managed settings](https://code.claude.com/docs/en/server-managed-settings.md) | Deployment/product context |
| 69 | [Control MCP server access for your organization](https://code.claude.com/docs/en/managed-mcp.md) | Deployment/product context |
| 70 | [Configure auto mode](https://code.claude.com/docs/en/auto-mode-config.md) | Native/direct mapping |
| 71 | [Enterprise deployment overview](https://code.claude.com/docs/en/third-party-integrations.md) | Deployment/product context |
| 72 | [Feature availability](https://code.claude.com/docs/en/feature-availability.md) | Core design input |
| 73 | [Claude Code on Amazon Bedrock](https://code.claude.com/docs/en/amazon-bedrock.md) | Deployment/product context |
| 74 | [Claude Code on Claude Platform on AWS](https://code.claude.com/docs/en/claude-platform-on-aws.md) | Deployment/product context |
| 75 | [Claude Code on Google Cloud's Agent Platform](https://code.claude.com/docs/en/google-vertex-ai.md) | Deployment/product context |
| 76 | [Claude Code on Microsoft Foundry](https://code.claude.com/docs/en/microsoft-foundry.md) | Deployment/product context |
| 77 | [Enterprise network configuration](https://code.claude.com/docs/en/network-config.md) | Deployment/product context |
| 78 | [Run Claude Code behind a corporate launcher](https://code.claude.com/docs/en/corporate-launcher.md) | Deployment/product context |
| 79 | [Development containers](https://code.claude.com/docs/en/devcontainer.md) | Deployment/product context |
| 80 | [Run Claude Code through a gateway](https://code.claude.com/docs/en/gateways.md) | Deployment/product context |
| 81 | [Claude apps gateway for Amazon Bedrock, Claude Platform on AWS, Google Cloud, and Microsoft Foundry](https://code.claude.com/docs/en/claude-apps-gateway.md) | Deployment/product context |
| 82 | [Claude apps gateway configuration](https://code.claude.com/docs/en/claude-apps-gateway-config.md) | Deployment/product context |
| 83 | [Claude apps gateway spend limits](https://code.claude.com/docs/en/claude-apps-gateway-spend-limits.md) | Deployment/product context |
| 84 | [Claude apps gateway deployment and operations](https://code.claude.com/docs/en/claude-apps-gateway-deploy.md) | Deployment/product context |
| 85 | [Deploy Claude apps gateway on AWS](https://code.claude.com/docs/en/claude-apps-gateway-on-aws.md) | Deployment/product context |
| 86 | [Deploy Claude apps gateway on Google Cloud](https://code.claude.com/docs/en/claude-apps-gateway-on-gcp.md) | Deployment/product context |
| 87 | [Other LLM gateways](https://code.claude.com/docs/en/llm-gateway.md) | Deployment/product context |
| 88 | [Connect Claude Code to an LLM gateway](https://code.claude.com/docs/en/llm-gateway-connect.md) | Deployment/product context |
| 89 | [Roll out an LLM gateway for your organization](https://code.claude.com/docs/en/llm-gateway-rollout.md) | Deployment/product context |
| 90 | [Gateway protocol reference](https://code.claude.com/docs/en/llm-gateway-protocol.md) | Deployment/product context |
| 91 | [Monitoring](https://code.claude.com/docs/en/monitoring-usage.md) | Core design input |
| 92 | [Manage costs effectively](https://code.claude.com/docs/en/costs.md) | Core design input |
| 93 | [Track team usage with analytics](https://code.claude.com/docs/en/analytics.md) | Deployment/product context |
| 94 | [Create and distribute a plugin marketplace](https://code.claude.com/docs/en/plugin-marketplaces.md) | Native/direct mapping |
| 95 | [Constrain plugin dependency versions](https://code.claude.com/docs/en/plugin-dependencies.md) | Native/direct mapping |
| 96 | [Recommend your plugin from your CLI](https://code.claude.com/docs/en/plugin-hints.md) | Native/direct mapping |
| 97 | [Recommend plugins for your org](https://code.claude.com/docs/en/plugin-relevance.md) | Native/direct mapping |
| 98 | [Security](https://code.claude.com/docs/en/security.md) | Core design input |
| 99 | [Data usage](https://code.claude.com/docs/en/data-usage.md) | Core design input |
| 100 | [Zero data retention](https://code.claude.com/docs/en/zero-data-retention.md) | Core design input |
| 101 | [Communications kit](https://code.claude.com/docs/en/communications-kit.md) | Deployment/product context |
| 102 | [Champion kit](https://code.claude.com/docs/en/champion-kit.md) | Deployment/product context |
| 103 | [Claude Code settings](https://code.claude.com/docs/en/settings.md) | Core design input |
| 104 | [Claude Code settings reference](https://code.claude.com/docs/en/settings-reference.md) | Core design input |
| 105 | [Example settings files](https://code.claude.com/docs/en/settings-example.md) | Core design input |
| 106 | [Configure permissions](https://code.claude.com/docs/en/permissions.md) | Core design input |
| 107 | [Choose a permission mode](https://code.claude.com/docs/en/permission-modes.md) | Core design input |
| 108 | [Configure the sandboxed Bash tool](https://code.claude.com/docs/en/sandboxing.md) | Core design input |
| 109 | [Choose a sandbox environment](https://code.claude.com/docs/en/sandbox-environments.md) | Core design input |
| 110 | [Configure cloud environments](https://code.claude.com/docs/en/cloud-environments.md) | Core design input |
| 111 | [Self-hosted environments](https://code.claude.com/docs/en/self-hosted-environments.md) | Native/direct mapping |
| 112 | [Self-hosted environments quickstart](https://code.claude.com/docs/en/self-hosted-environments-quickstart.md) | Native/direct mapping |
| 113 | [Deploy self-hosted environments to production](https://code.claude.com/docs/en/self-hosted-environments-deploy.md) | Native/direct mapping |
| 114 | [Customize sessions in self-hosted environments](https://code.claude.com/docs/en/self-hosted-environments-configuration.md) | Native/direct mapping |
| 115 | [Test self-hosted environments end to end](https://code.claude.com/docs/en/self-hosted-environments-testing.md) | Native/direct mapping |
| 116 | [Self-hosted environments reference](https://code.claude.com/docs/en/self-hosted-environments-reference.md) | Native/direct mapping |
| 117 | [Verify session identity in self-hosted environments](https://code.claude.com/docs/en/self-hosted-environments-identity.md) | Native/direct mapping |
| 118 | [Model configuration](https://code.claude.com/docs/en/model-config.md) | Core design input |
| 119 | [Speed up responses with fast mode](https://code.claude.com/docs/en/fast-mode.md) | Native/direct mapping |
| 120 | [Escalate hard decisions with the advisor tool](https://code.claude.com/docs/en/advisor.md) | Core design input |
| 121 | [Output styles](https://code.claude.com/docs/en/output-styles.md) | Native/direct mapping |
| 122 | [Configure your terminal for Claude Code](https://code.claude.com/docs/en/terminal-config.md) | Native/direct mapping |
| 123 | [Fullscreen rendering](https://code.claude.com/docs/en/fullscreen.md) | Native/direct mapping |
| 124 | [Use Claude Code with a screen reader](https://code.claude.com/docs/en/accessibility.md) | Native/direct mapping |
| 125 | [Voice dictation](https://code.claude.com/docs/en/voice-dictation.md) | Native/direct mapping |
| 126 | [Customize your status line](https://code.claude.com/docs/en/statusline.md) | Native/direct mapping |
| 127 | [Customize keyboard shortcuts](https://code.claude.com/docs/en/keybindings.md) | Native/direct mapping |
| 128 | [CLI reference](https://code.claude.com/docs/en/cli-reference.md) | Core design input |
| 129 | [Commands](https://code.claude.com/docs/en/commands.md) | Core design input |
| 130 | [Environment variables](https://code.claude.com/docs/en/env-vars.md) | Core design input |
| 131 | [Tools reference](https://code.claude.com/docs/en/tools-reference.md) | Core design input |
| 132 | [Interactive mode](https://code.claude.com/docs/en/interactive-mode.md) | Core design input |
| 133 | [Checkpointing](https://code.claude.com/docs/en/checkpointing.md) | Core design input |
| 134 | [Hooks reference](https://code.claude.com/docs/en/hooks.md) | Core design input |
| 135 | [Plugins reference](https://code.claude.com/docs/en/plugins-reference.md) | Core design input |
| 136 | [Channels reference](https://code.claude.com/docs/en/channels-reference.md) | Core design input |
| 137 | [Glossary](https://code.claude.com/docs/en/glossary.md) | Reference/history |
| 138 | [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview.md) | Deferred: Agent SDK transport |
| 139 | [Quickstart](https://code.claude.com/docs/en/agent-sdk/quickstart.md) | Deferred: Agent SDK transport |
| 140 | [Troubleshooting](https://code.claude.com/docs/en/agent-sdk/troubleshooting.md) | Deferred: Agent SDK transport |
| 141 | [Examples](https://code.claude.com/docs/en/agent-sdk/examples.md) | Deferred: Agent SDK transport |
| 142 | [How the agent loop works](https://code.claude.com/docs/en/agent-sdk/agent-loop.md) | Deferred: Agent SDK transport |
| 143 | [Use Claude Code features in the SDK](https://code.claude.com/docs/en/agent-sdk/claude-code-features.md) | Deferred: Agent SDK transport |
| 144 | [Work with sessions](https://code.claude.com/docs/en/agent-sdk/sessions.md) | Deferred: Agent SDK transport |
| 145 | [Persist sessions to external storage](https://code.claude.com/docs/en/agent-sdk/session-storage.md) | Deferred: Agent SDK transport |
| 146 | [Streaming Input](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode.md) | Deferred: Agent SDK transport |
| 147 | [Handle approvals and user input](https://code.claude.com/docs/en/agent-sdk/user-input.md) | Deferred: Agent SDK transport |
| 148 | [Stream responses in real-time](https://code.claude.com/docs/en/agent-sdk/streaming-output.md) | Deferred: Agent SDK transport |
| 149 | [Get structured output from agents](https://code.claude.com/docs/en/agent-sdk/structured-outputs.md) | Deferred: Agent SDK transport |
| 150 | [Give Claude custom tools](https://code.claude.com/docs/en/agent-sdk/custom-tools.md) | Deferred: Agent SDK transport |
| 151 | [Connect to external tools with MCP](https://code.claude.com/docs/en/agent-sdk/mcp.md) | Deferred: Agent SDK transport |
| 152 | [Scale to many tools with tool search](https://code.claude.com/docs/en/agent-sdk/tool-search.md) | Deferred: Agent SDK transport |
| 153 | [Subagents in the SDK](https://code.claude.com/docs/en/agent-sdk/subagents.md) | Deferred: Agent SDK transport |
| 154 | [Modifying system prompts](https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts.md) | Deferred: Agent SDK transport |
| 155 | [Extend agents with skills](https://code.claude.com/docs/en/agent-sdk/skills.md) | Deferred: Agent SDK transport |
| 156 | [Plugins in the SDK](https://code.claude.com/docs/en/agent-sdk/plugins.md) | Deferred: Agent SDK transport |
| 157 | [Configure permissions](https://code.claude.com/docs/en/agent-sdk/permissions.md) | Deferred: Agent SDK transport |
| 158 | [Intercept and control agent behavior with hooks](https://code.claude.com/docs/en/agent-sdk/hooks.md) | Deferred: Agent SDK transport |
| 159 | [Rewind file changes with checkpointing](https://code.claude.com/docs/en/agent-sdk/file-checkpointing.md) | Deferred: Agent SDK transport |
| 160 | [Track cost and usage](https://code.claude.com/docs/en/agent-sdk/cost-tracking.md) | Deferred: Agent SDK transport |
| 161 | [Observability with OpenTelemetry](https://code.claude.com/docs/en/agent-sdk/observability.md) | Deferred: Agent SDK transport |
| 162 | [Track todos](https://code.claude.com/docs/en/agent-sdk/todo-tracking.md) | Deferred: Agent SDK transport |
| 163 | [Hosting the Agent SDK](https://code.claude.com/docs/en/agent-sdk/hosting.md) | Deferred: Agent SDK transport |
| 164 | [Securely deploying AI agents](https://code.claude.com/docs/en/agent-sdk/secure-deployment.md) | Deferred: Agent SDK transport |
| 165 | [Agent SDK reference - TypeScript](https://code.claude.com/docs/en/agent-sdk/typescript.md) | Deferred: Agent SDK transport |
| 166 | [TypeScript SDK V2 session API (removed)](https://code.claude.com/docs/en/agent-sdk/typescript-v2-preview.md) | Deferred: Agent SDK transport |
| 167 | [Agent SDK reference - Python](https://code.claude.com/docs/en/agent-sdk/python.md) | Deferred: Agent SDK transport |
| 168 | [Migrate to Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/migration-guide.md) | Deferred: Agent SDK transport |
| 169 | [What's new](https://code.claude.com/docs/en/whats-new/index.md) | Reference/history |
| 170 | [Week 34 · August 17–21, 2026](https://code.claude.com/docs/en/whats-new/2026-w34.md) | Reference/history |
| 171 | [Week 33 · August 10–14, 2026](https://code.claude.com/docs/en/whats-new/2026-w33.md) | Reference/history |
| 172 | [Week 32 · August 3–7, 2026](https://code.claude.com/docs/en/whats-new/2026-w32.md) | Reference/history |
| 173 | [Week 30 · July 20–24, 2026](https://code.claude.com/docs/en/whats-new/2026-w30.md) | Reference/history |
| 174 | [Week 29 · July 13–17, 2026](https://code.claude.com/docs/en/whats-new/2026-w29.md) | Reference/history |
| 175 | [Week 28 · July 6–10, 2026](https://code.claude.com/docs/en/whats-new/2026-w28.md) | Reference/history |
| 176 | [Week 27 · June 29 – July 3, 2026](https://code.claude.com/docs/en/whats-new/2026-w27.md) | Reference/history |
| 177 | [Week 26 · June 22–26, 2026](https://code.claude.com/docs/en/whats-new/2026-w26.md) | Reference/history |
| 178 | [Week 25 · June 15–19, 2026](https://code.claude.com/docs/en/whats-new/2026-w25.md) | Reference/history |
| 179 | [Week 24 · June 8–12, 2026](https://code.claude.com/docs/en/whats-new/2026-w24.md) | Reference/history |
| 180 | [Week 23 · June 1–5, 2026](https://code.claude.com/docs/en/whats-new/2026-w23.md) | Reference/history |
| 181 | [Week 22 · May 25–29, 2026](https://code.claude.com/docs/en/whats-new/2026-w22.md) | Reference/history |
| 182 | [Week 21 · May 18–22, 2026](https://code.claude.com/docs/en/whats-new/2026-w21.md) | Reference/history |
| 183 | [Week 20 · May 11–15, 2026](https://code.claude.com/docs/en/whats-new/2026-w20.md) | Reference/history |
| 184 | [Week 19 · May 4–8, 2026](https://code.claude.com/docs/en/whats-new/2026-w19.md) | Reference/history |
| 185 | [Week 18 · April 27 – May 1, 2026](https://code.claude.com/docs/en/whats-new/2026-w18.md) | Reference/history |
| 186 | [Week 17 · April 20–24, 2026](https://code.claude.com/docs/en/whats-new/2026-w17.md) | Reference/history |
| 187 | [Week 16 · April 13–17, 2026](https://code.claude.com/docs/en/whats-new/2026-w16.md) | Reference/history |
| 188 | [Week 15 · April 6–10, 2026](https://code.claude.com/docs/en/whats-new/2026-w15.md) | Reference/history |
| 189 | [Week 14 · March 30 – April 3, 2026](https://code.claude.com/docs/en/whats-new/2026-w14.md) | Reference/history |
| 190 | [Week 13 · March 23–27, 2026](https://code.claude.com/docs/en/whats-new/2026-w13.md) | Reference/history |
| 191 | [Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance.md) | Reference/history |
