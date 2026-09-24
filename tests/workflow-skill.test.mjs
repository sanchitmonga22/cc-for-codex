import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const heavyBuild = readFileSync(resolve(root, "plugins/cc-for-codex/skills/heavy-build/SKILL.md"), "utf8");

test("Claude heavy-build delegation matches the bridge's local HEAD base", () => {
  assert.match(heavyBuild, /bridge creates a\s+verified worktree branch from the current local `HEAD`/u);
  assert.match(heavyBuild, /Require `git rev-parse HEAD` to equal the recorded `BASE` commit/u);
  assert.doesNotMatch(heavyBuild, /bridge creates a\s+verified worktree branch from the plan's `BASE`/u);
});
