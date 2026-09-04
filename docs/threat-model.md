# Threat model

## Protected assets

- the user's checkout and unrelated worktrees;
- local credentials, environment variables, keychain, and Claude settings;
- host processes, network access, and external services;
- Anthropic usage limits and usage-credit balance;
- GitHub state and unpushed commits;
- terminal integrity and readable output.

## Threats and controls

| Threat | Control |
|---|---|
| Shell injection through a prompt, model, ref, path, or job ID | Node `spawn` with `shell:false`; foreground prompt on stdin; strict validators; no arbitrary extra args |
| PATH hijack from the checkout | Resolve the main executable to an absolute real path; guarded children receive only absolute PATH directories with no direct entry linking into the workspace |
| Inherited Git variables or `core.worktree` redirect scope | Clear repository-selection environment variables and require the resolved Git top-level to equal the nearest canonical `.git` marker |
| Forged `.git`, `commondir`, symlinked object, or alternate-object-store redirect exposes a sibling repository | Authenticate canonical main markers plus registered linked worktree/submodule relationships; require the reported common directory and object tree to stay canonical; reject alternate/shared object stores and special/symlink entries before model launch |
| Git fsmonitor, hooks, textconv, filters, includes, or lazy fetch execute during Claude startup, review, or worktree setup | Apply hardened Git environment to every automatic Claude launch; disable hooks/fsmonitor/external diff/textconv/global attributes/lazy fetch and force recursion off; recursively inspect initialized submodules; reject repository-local include/includeIf indirection, executable diff configuration, partial/promisor repos, and selected tracked content filters across working/index/HEAD views at every level |
| Print mode skips workspace trust | Fixed safe/restricted/no-customization profile and no interactive permission prompts |
| Prompt injection inside source/diff | Explicit untrusted-data delimiters, fixed reviewer instruction, read-only tool surface |
| Narrow review reads files outside `--path` or silently reviews a typo | Empty/unmatched paths are rejected; review tools are disabled; only the locally constructed selected Git material is sent; the rendered result repeats scope/base |
| Project hook/plugin/MCP execution | `--safe-mode --strict-mcp-config`; native profile requires a separate confirmation |
| Host mutation in delegated work | Generated worktree with real-directory ancestry and verified path/branch/base, exact built-in file-tool list, no Bash/WebFetch/MCP/Chrome, explicit write confirmation; dangerous default additionally requires a distinct host-safety-bypass token and warning |
| Secret copying through `.worktreeinclude` | Refuse write mode unless the file is absent or the exact exposure is acknowledged |
| Cross-repository job control | Canonical cwd, `agents --json --cwd`, exact short-ID lookup before every action |
| Deleting active/unpushed work | `rm` requires every state/status/PID signal to be terminal plus exact confirmation; never pass `--discard-unpushed` |
| Unbounded background usage | Separate confirmation and persistent warning; explicit status/stop controls; valid IDs printed on uncertain launch failure are preserved with recovery guidance |
| Background prompt or diff exposed in a local process listing | Separate `process-visible-prompt` confirmation, prompt-size cap, and skill-level secret screening |
| Cloud upload/billing surprise | Separate ultrareview command and exact consent token; always `--no-post` |
| Auth identity or secret leakage | Parse auth JSON and return only approved fields; withhold invalid raw auth output |
| Misleading incomplete review | Reject hidden index flags and unmatched paths; visibly encode dangerous source controls; mark omitted untracked contents, binary bytes, submodules, and truncated tails as partial; strict non-empty findings schema |
| Terminal escape or record injection | Strip ANSI CSI/OSC, bidi, and control bytes; flatten untrusted metadata fields; cap stdout/stderr |
| Runaway child/process tree | Bounded timeout, process-group TERM, then referenced KILL escalation that survives group-leader exit; distinguish timeout from exit failure |
| Stop hook silently spends credits, loops, or traps Codex on a bridge failure | Disabled per repository by default; separate executable-hook trust and exact billed-usage consent; one review per Stop cycle; bounded internal deadline; findings/partial evidence block, runtime failures fail open visibly, clean/disabled/loop paths emit no output |
| Plugin removal appears to revoke repository review consent | Store state explicitly in the Git common directory; document that it survives uninstall/reinstall and must be disabled in every enabled repository before removal |

## Out of scope

The bridge cannot make dangerous or native Claude invocations safe. A Git worktree is not an operating-system sandbox, dangerous Edit/Write may reach host paths, enterprise-managed hooks may still execute, and a native TTY can select additional features after launch without wrapper mediation. Claude/Anthropic remain responsible for their client/service security, and a compromised local `claude` binary has the user's existing privileges. Use a hardened container or VM for untrusted repository execution. V0.2 is tested on macOS and standard Linux. WSL2 is a supported target but has not yet been independently qualified; native Windows is not supported.
