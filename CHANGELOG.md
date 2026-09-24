# Changelog

All notable changes follow semantic versioning.

## 0.2.6 - 2026-09-24

- Accept a Claude-created Git worktree that remains locked after a completed write session when its canonical path, registration, branch, exact base commit, and non-prunable state all verify. Preserve the lock and report it; never unlock or delete the worktree automatically. A still-live lock owner now prevents foreground success, and review of a generated worktree refuses active or ambiguous Claude background sessions.
- Add regression tests using a lock reason recorded from Claude Code 2.1.281, including completed/active foreground writes, foreign and malformed locks, missing locked paths, background lifecycle checks, and recovery.
- Keep full-execution worktrees on their launch `HEAD`: explicitly prohibit Claude commits/branch changes and report unexpected commits as a recoverable HEAD-drift failure. Correct heavy-build's BASE-versus-local-HEAD guidance.
- Preserve and report a private transcript snapshot if the import summary fails; bound copies to each source file's opening size so a concurrently appended JSONL transcript can be archived as a point-in-time snapshot. Keep precise turn-limit errors ahead of provider-string classification.
- Live-check consultation, structured review, file-only Opus write delegation, and transcript-preserving import against a disposable repository. Guarded write remains subject to the configured Claude account's restricted-mode quota.

## 0.2.5 - 2026-09-24

- Restore live read-only Claude Code calls by removing evaluation-harness `--restricted` from ordinary ask/review launches; on a tested OAuth account, that flag alone produced a weekly-limit rejection while the same Opus 5.5 request succeeded without it. The explicit guarded-write profile retains its filesystem boundary.
- Recognize Claude's weekly-limit message as a redacted diagnostic category; add a regression check for the read profile and document its read-path limitations.
- Require Claude Code 2.1.280 or newer for the default Claude Opus 5.5 model, and report model/CLI compatibility separately from provider readiness.
- Classify common Claude provider failures into safe diagnostic categories without exposing raw account, request, or repository text; never retry or switch models silently.
- Harden POSIX launchers against `CDPATH` output and report Node startup failures clearly; include shell syntax checks in the standard lint command.
- Refresh the Claude CLI coverage ledger against 2.1.280, including newly advertised nested-command flags.
- Expand tests for model-version boundaries, provider failure categories, and secret redaction.

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
