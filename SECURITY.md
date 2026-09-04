# Security policy

## Report a vulnerability

Please do not open a public issue for a vulnerability that could expose credentials, execute commands, escape the selected working directory, control another repository's Claude session, or trigger unapproved external spend. Use GitHub's private security advisory flow for this repository.

Include the affected version, operating system, Node and Claude Code versions, reproduction steps, expected/actual behavior, and whether a real Claude request was made. Redact tokens, account identity, local paths, proprietary code, and raw auth output.

## Supported versions

Until the first stable release, only the latest tagged `0.x` release receives security fixes. The bridge requires the safety flags reported by `$claude-setup`; it fails closed when they are unavailable.

## Design promises

- No shell is used to invoke Claude or Git.
- Default model calls cannot edit, run Bash, browse, call MCP, load local customizations, or prompt interactively.
- Auth status is allowlisted rather than echoed.
- Cloud, background, write, removal, native, and permission-bypass boundaries require distinct confirmations.
- The bridge never posts ultrareview output to GitHub.

See [docs/threat-model.md](docs/threat-model.md) for assumptions and out-of-scope risks.
