# Contributing

Thank you for helping improve CC for Codex.

## Ground rules

- Keep the default path read-only and fail closed when a required Claude safety feature is absent.
- Never add a shell-interpolated prompt or arbitrary unguarded flag passthrough.
- Preserve one-writer-per-worktree behavior.
- Do not add telemetry, credential handling, remote services, or paid model calls to tests.
- Document product-boundary gaps instead of inventing parity.

## Development

Node 20+ is the only runtime dependency.

```bash
npm test
npm run validate
npm run audit:claude
npm run check
```

Tests must use `tests/fixtures/fake-claude.mjs`. New state-changing commands need positive, denial, wrong-repository, injection, and redaction coverage.

## Pull requests

Keep changes focused. Describe the threat-boundary impact, list real validation output, and state whether any actual Anthropic request or external write occurred. Update the parity and CLI coverage ledgers for every new command/flag.
