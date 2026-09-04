# Roadmap

## v0.1 — local production foundation

- Git/local Codex marketplace with five skills and an opt-in Stop hook
- Five focused skills and one shared dependency-free runner
- Doctor/auth redaction
- Safe ask, structured review, and adversarial review
- Explicit ultrareview with forced `--no-post`
- Read-only and separately confirmed worktree file-edit delegation with dangerous/guarded zero-prompt profiles
- Background status/log/result/stop/respawn/remove/attach
- Persisted handoff/resume
- Guarded native escape hatch for audited finite-command CLI reach, excluding live stream-JSON protocols and `--post`
- Fake-Claude security and lifecycle tests
- Bounded Stop review gate with trust, billing, partial-evidence, fail-open, and loop controls

## v0.2 — installation and verification

- Copy-paste Codex installer prompt and `$claude-verify` installed/local/live verification workflow

## v0.3 — lifecycle hardening

- Structured background event/result store if Anthropic exposes a stable interface
- Ambiguous-launch recovery and richer blocked-state rendering
- Windows process-tree and path test matrix
- Supported-version compatibility table from CI-installed Claude builds

## v0.4 — Agent SDK adapter

- Optional TypeScript Agent SDK transport for streaming events
- Permission callback relay with explicit Codex/user decisions
- Nested subagent event rendering
- Stronger cancellation and usage telemetry

## v0.5 — handoff and review integrations

- Portable, sanitized handoff artifact schema
- Optional PR annotations only through a separate explicit external-write workflow
- Turn-scoped edit attribution for the Stop gate if Codex exposes reliable changed-file metadata
- Live Codex hook trust/Stop-cycle qualification across supported app and CLI builds

## v1.0 — stable distribution

- Cross-platform qualification
- Signed/reproducible release artifacts
- Public support/privacy/terms documentation
- Universal-directory submission only if provider authorization and OpenAI policy eligibility are resolved

Full transcript parity is not promised unless Anthropic publishes a supported Codex conversation importer. `claude import codex` currently concerns configuration, not Codex task history.
