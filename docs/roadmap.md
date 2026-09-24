# Roadmap

## Current release — v0.2.7

- Git/local Codex marketplace with ten skills, one optional Stop hook, and a shared dependency-free runner
- Guarded Claude CLI consultation, structured/adversarial review, isolated delegation, background lifecycle, persistent handoff/resume, and audited finite-command native access
- `$claude-import` preserves the exact local session JSONL and same-session sidecars in a private, checksummed archive; Codex receives a stable transcript reference and is instructed to inspect the source rather than rely on a lossy summary
- Copy-paste installer/verification workflow and reversible Codex-first global instruction setup
- Light/heavy workflow guidance with explicit model routing and evidence boundaries
- Fake-Claude security/lifecycle tests and archive-integrity/skill-contract tests
- Bounded optional Stop review gate with trust, billing, partial-evidence, fail-open, and loop controls

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

The local transcript archive preserves the Claude conversation as a readable source reference, but does not create a native Codex conversation, replay Claude tool calls, or guarantee every transcript detail is always loaded into Codex's active context. `claude import codex` currently concerns configuration, not Codex task history.
