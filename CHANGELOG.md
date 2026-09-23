# Changelog

All notable changes follow semantic versioning.

## 0.2.4 - 2026-09-23

- Make Claude Opus 5.5 (`claude-opus-5-5`) the bridge default, while retaining explicit Sonnet 5 and Fable 5.1 overrides.
- Align Codex-first workflow defaults on GPT-6 Sol at high effort, with GPT-6 Luna at high or max reserved for heavy exploration.
- Add an explicit full-execution Claude mode for heavy builds: Opus 5.5 can use Bash with dangerous permissions in a generated worktree only after the separate `full-host-access` confirmation; GPT-6 Sol remains the default executor.
- Add `$heavy-track`, `$heavy-plan`, and `$heavy-build` for a Codex-first heavy workflow.
- Document the Codex-first role split and the light/heavy workflow with explicit model-routing defaults.
- Add the required `workflow install` command and a reversible `workflow uninstall` command with portable global instruction templates, backups, and idempotent checks.
- Add `$claude-import` to preserve an exact Claude transcript and same-session sidecars in a private, checksummed Codex-home archive, then hand Codex a summary plus a stable source reference.
- Fail closed before the summary request when the source transcript is missing, ambiguous, unsafe, or exceeds archive limits; add archive and skill-contract unit coverage.
- Include the import skill and transcript retention behavior in package integrity, verification, security, architecture, and feature-parity documentation.

## 0.2.3 - 2026-09-23

- Make Claude Opus 5.5 the guarded bridge default and add the Codex-ready `import-session` handoff command.
- Add an explicit full-execution Claude delegation mode with Bash and dangerous permissions in a generated worktree.

## 0.2.2 - 2026-09-05

- Adopt the approved charcoal, copper, and ivory logo across the README and plugin surfaces.
- Match the wide plugin logo to the banner and remove obsolete blue/purple SVG artwork.
- Document canonical brand assets and preserve their original proportions.

## 0.2.1 - 2026-09-05

- Install process signal forwarding before launching subprocesses to close the early-cancellation race exposed by Node 20 CI.
- Document the new Claude CLI subagent prompt-file flag in the compatibility ledger.
- Replace the README hero, improve the screenshot layout, and use a GitHub-hosted video attachment for native playback.

## 0.2.0 - 2026-09-04

- Added a copy-paste Codex installation and end-to-end verification prompt at the top of the README.
- Added `$claude-verify` to distinguish loaded, installed, locally ready, and live-proven plugin state.

## 0.1.0 - 2026-09-03

- Initial Git/local Codex marketplace package.
- Added five focused Claude Code skills.
- Added dependency-free guarded CLI bridge.
- Added structured standard/adversarial review and explicit ultrareview.
- Added isolated delegation, handoff/resume, and background lifecycle management.
- Added an opt-in, trusted Stop review gate with explicit billing consent and loop/failure controls.
- Added security model, official-doc ledger, feature/CLI coverage, tests, and CI.
