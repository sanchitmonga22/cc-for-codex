# Publishing status

## Supported today

This repository is a valid Git/local Codex marketplace: `.agents/plugins/marketplace.json` points to the nine-skill package with an auto-discovered optional Stop hook under `plugins/cc-for-codex`. Anyone with the repository URL can add that marketplace and install the plugin.

That open-source distribution path is distinct from OpenAI's universal public plugin directory.

## Universal directory risk

OpenAI's [submission documentation](https://developers.openai.com/plugins/deploy/submission) accepts skill-based plugins. A public submission also requires verified developer/business identity, listing metadata, public support/privacy/terms URLs, positive and negative test cases, review, and a separate publish step.

However, the current [plugin guidelines](https://developers.openai.com/plugins/app-guidelines) state that OpenAI cannot approve plugins that primarily function as unofficial connectors to third-party services or pass-through intermediary layers. The [Claude-plugin submission guide](https://developers.openai.com/plugins/guides/submit-claude-plugin) also expects clean-environment behavior without undeclared local packages, files, or credentials.

CC for Codex intentionally depends on a separately installed/authenticated third-party CLI. Therefore:

- the project does **not** claim universal-directory eligibility;
- a hosted MCP wrapper would not automatically cure the unofficial-connector policy issue;
- public metadata must not imply Anthropic/OpenAI endorsement or use protected branding without permission;
- submission should wait for Anthropic authorization/brand permission and explicit OpenAI confirmation that the design is reviewable.

## Release checklist for GitHub marketplace

1. Run `npm run check:offline` with Node 20 and 22.
2. Run the official local plugin and skill validators.
3. Run `npm run audit:claude` against the oldest and newest supported Claude Code versions.
4. Run `npm run audit:docs`; the scheduled CI job also detects upstream documentation drift.
5. Install from a fresh local marketplace snapshot and start a new Codex task.
6. Exercise doctor and fake-CLI tests; do not make a paid Claude call in CI.
7. Update `CHANGELOG.md`, package/plugin versions, and the CLI coverage snapshot date.
8. Tag the release and verify the GitHub install path from a clean machine.

## Future public-submission prerequisites

- written provider authorization and naming/branding review;
- OpenAI eligibility clarification for local-only third-party CLI dependencies;
- public support, privacy, and terms pages;
- at least five positive and three negative trigger tests covering the nine skills;
- supported-surface declaration that makes the local Codex dependency explicit;
- clean-environment review and a privacy/data-flow assessment.
