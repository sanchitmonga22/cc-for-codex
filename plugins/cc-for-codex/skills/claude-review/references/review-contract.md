# Review contract

Normal and adversarial reviews are local Claude model calls with tools disabled. The bridge includes staged and unstaged tracked changes and lists untracked paths. `--path` narrows the Git material that is sent; an empty value is rejected and Claude cannot read outside that inline scope. `--base` compares the merge base of `HEAD` and the selected ref through the current working tree. Submodule state is deliberately omitted to avoid executing nested repository configuration. Repositories with selected tracked content filters or partial/promisor configuration are refused before Git status/diff runs.

The schema requires:

- `severity`: P0, P1, P2, or P3
- exact `file` and one-based `line`
- short `title`
- concrete `failure_mode`
- a `validation` method
- overall `summary` and `clean_sections`

Untracked file contents are not included, only their paths. Changed binary bytes and submodule contents/state are also omitted; descendant paths and staged submodule deletions are detected. The bridge may truncate very large inline diffs. Because Claude has no file tools during review, any of those limitations makes the result partial and is disclosed in both JSON and rendered output; narrow the scope, stage the intended content, or review binary/submodule material separately for a complete follow-up.

Ultrareview is a separate cloud product, not a stronger flag on the local prompt. It can upload repository state, consume usage credits, and is unavailable for some providers and zero-data-retention organizations.
