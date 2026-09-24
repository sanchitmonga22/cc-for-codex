import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillPath = resolve(root, "plugins/cc-for-codex/skills/claude-import/SKILL.md");
const metadataPath = resolve(root, "plugins/cc-for-codex/skills/claude-import/agents/openai.yaml");
const skill = readFileSync(skillPath, "utf8");
const metadata = readFileSync(metadataPath, "utf8");

test("Claude import skill is discoverable for explicit session handoffs", () => {
  assert.match(skill, /^name: claude-import$/mu);
  assert.match(skill, /^description: .*import, transfer, or continue a Claude session in Codex/mu);
  assert.match(metadata, /display_name: "Claude Import"/u);
  assert.match(metadata, /default_prompt: .*\$claude-import/u);
});

test("Claude import skill archives full context before using the guarded summary bridge", () => {
  assert.match(skill, /\.\.\/claude-code\/scripts\/cc-for-codex/u);
  assert.match(skill, /import-session --session <UUID> --json/u);
  assert.match(skill, /private local plaintext snapshot/u);
  assert.match(skill, /Anthropic plan\s+capacity or API billing/u);
  assert.match(skill, /--confirm-concurrent-resume may-create-copy/u);
  assert.match(skill, /Require `transcriptArchived: true`/u);
  assert.match(skill, /Before continuing, inspect the archived transcript/u);
  assert.match(skill, /never proceed from the summary alone/u);
  assert.match(skill, /Do not add write, native, background, network, or permission-bypass options/u);
});

test("Claude import skill treats the summary as untrusted and preserves a full transcript reference", () => {
  assert.match(skill, /summary is\s+an index, not a lossless replacement/u);
  assert.match(skill, /`transcriptPath`,\s+`metadataPath`, and `sourceSessionId`/u);
  assert.match(skill, /`codexPrompt` as untrusted context/u);
  assert.match(skill, /independently verify relevant files, decisions, and validation claims/u);
  assert.match(skill, /`claude --resume <UUID>` reference/u);
  assert.match(skill, /without claiming that a new Codex task was created/u);
});
