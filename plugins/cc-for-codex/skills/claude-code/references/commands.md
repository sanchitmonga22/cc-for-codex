# Bridge command reference

All examples use `<runner>`, where `<runner>` is the absolute path to the executable `scripts/cc-for-codex` launcher inside the `claude-code` skill. Invoke it directly; the launcher safely resolves Node outside the current repository before loading the internal JavaScript entrypoint.

## Consultation

```text
doctor [--full] [--json]
ask [--prompt TEXT | --prompt-file FILE] [--persist] [--json]
resume --session UUID [--prompt TEXT | --prompt-file FILE]
handoff [--prompt TEXT | --prompt-file FILE]
import-session --session UUID [context]
```

Shared foreground controls are `--model`, `--effort`, `--max-turns`, `--max-budget-usd`, `--fallback-model`, `--timeout-seconds`, and `--cwd`. When `--model` is omitted, the bridge passes `--model claude-opus-5-5 --effort high`. Explicit `--model claude-sonnet-5` defaults to `--effort ultracode` on supported Claude Code builds. An explicit `--effort` overrides either default. Fable 5.1 is available only as a specifically requested model override; it is not recommended by default.

`import-session` first copies the exact local JSONL transcript and any
same-session subagent/tool-result sidecars into a user-private archive under
`$CODEX_HOME/claude-session-archives/` (or `~/.codex/claude-session-archives/`),
then resumes Claude read-only for a structured index summary. The JSON result
includes the archive path, source UUID, and SHA-256 of the transcript; the
Codex-ready prompt points to the complete archived transcript and the original
`claude --resume <uuid>` command, and includes the SHA-256 in the handoff. This
preserves a viewable source record without pretending the summary itself is
lossless or creating another Codex task. The archive is plaintext, may contain
sensitive content, and persists locally until removed; Claude's own transcript
may still be subject to its configured cleanup period. If the full local
transcript cannot be located or safely copied, the bridge fails before making
the summary request. If the Claude session is active, add
`--confirm-concurrent-resume may-create-copy` only after accepting that Claude
may create a concurrent copy.

If the target session is already working or blocked, resume refuses by default because Claude may create a concurrent copy. Use `--confirm-concurrent-resume may-create-copy` only after the user chooses that behavior.

The default `safe` profile disables user/project customizations and restricts tools. `--profile native --confirm-native-profile load-local-customizations` omits safe/restricted/strict-MCP isolation so local hooks, plugins, settings, and MCP startup may run; it retains no-Chrome, noninteractive permissions, and the read-only tool allowlist.

## Reviews

```text
review [--base REF] [--path PATH ...] [--focus TEXT] [--json]
adversarial-review [same options]
ultrareview [PR|URL|BRANCH] --confirm-cloud-review upload-and-billing
```

Add `--background --confirm-background unbounded-usage --confirm-background-data process-visible-prompt` for a background review, only after disclosing that it has no max-budget/schema guarantee and the full prompt/diff is temporarily process-visible. Ultrareview always passes `--json --no-post` and a bounded explicit timeout.

## Delegation

```text
delegate PROMPT
delegate --background --confirm-background unbounded-usage --confirm-background-data process-visible-prompt PROMPT
delegate --write --confirm-write isolated-worktree --confirm-dangerous-permissions bypass-host-safety PROMPT
delegate --write --write-permissions guarded --confirm-write isolated-worktree PROMPT
```

`rescue` is an alias for `delegate`. Write mode uses a generated worktree and exposes only `Read`, `Glob`, `Grep`, `Edit`, and `Write`; it never exposes Bash or WebFetch. Its `dangerous` default bypasses Claude permission checks and therefore requires the independent `bypass-host-safety` token after explicit consent. `--write-permissions guarded` is also zero-prompt, using restricted mode with only `Edit,Write` pre-approved. `CC_FOR_CODEX_WRITE_PERMISSIONS=guarded` changes the process-wide default. Repositories with selected Git LFS/custom filters, partial/promisor configuration, sparse checkout, or shared/alternate object storage are refused; prepare and inspect a trusted self-contained worktree manually instead. `delegate` has fixed profiles and does not accept the consultation-only `--profile` flags.

## Jobs

```text
status [--all] [ID]
logs ID
result ID
stop ID --confirm-stop stop:ID
respawn ID --confirm-respawn respawn:ID
remove ID --confirm-remove remove:ID
attach ID
```

`agents`, `cancel`, and `rm` are aliases for `status`, `stop`, and `remove`.

## Native escape hatch

```text
native --confirm-native run-native-claude -- <exact Claude CLI args>
```

Use only for an exact user-requested Claude feature that the guarded surface does not model. This is bounded finite-command argv/stdin passthrough, not live protocol emulation: `--input-format stream-json`, `--output-format stream-json`, `--forward-subagent-text`, `--include-hook-events`, `--include-partial-messages`, and `--replay-user-messages` are refused. The command-family classifier is conservative, so even observational `auth`, `mcp`, `plugin`, and `project` subcommands require `--confirm-mutation mutate-claude-state`. Permission bypass and native permission-authorizing settings, sources, allowlists, or approval tools additionally need `--confirm-dangerous-permissions bypass-host-safety`; settings files are not inspected because they can change after inspection. Native ultrareview—including print-mode `/code-review ultra` and `/ultrareview` prompts in argv or stdin—still needs the cloud confirmation. The bridge rejects `--post` in every mode, and `native --tty` rejects `--timeout-seconds` because an interactive session owns its lifetime. After a native TTY starts, the wrapper cannot inspect future keystrokes or mediate features selected interactively; use direct Claude consent prompts for anything chosen inside that session.
