#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = resolve(root, "plugins/cc-for-codex");
const failures = [];

const manifest = readJson(resolve(pluginRoot, ".codex-plugin/plugin.json"));
const hookDefinition = readJson(resolve(pluginRoot, "hooks/hooks.json"));
const marketplace = readJson(resolve(root, ".agents/plugins/marketplace.json"));
const pkg = readJson(resolve(root, "package.json"));

expect(manifest.name === "cc-for-codex", "manifest name must be cc-for-codex");
expect(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(manifest.version || ""), "manifest version must be semver");
expect(manifest.version === pkg.version, "package and plugin versions must match");
expect(manifest.author?.name && manifest.author.name !== "Local developer", "manifest needs a real author");
expect(manifest.skills === "./skills/", "manifest skills path must be ./skills/");
expect(Array.isArray(manifest.interface?.defaultPrompt), "interface.defaultPrompt must be an array");
expect(manifest.interface?.defaultPrompt?.length <= 3, "interface.defaultPrompt supports at most three prompts");
expect(Array.isArray(hookDefinition.hooks?.Stop), "hooks/hooks.json must define a Stop hook array");
const stopCommand = hookDefinition.hooks?.Stop?.[0]?.hooks?.[0];
expect(stopCommand?.type === "command", "Stop hook must use the command hook type");
expect(stopCommand?.command === '"${PLUGIN_ROOT}/hooks/stop-review-gate"', "Stop hook must resolve from PLUGIN_ROOT");
expect(Number.isInteger(stopCommand?.timeout) && stopCommand.timeout <= 600, "Stop hook needs a bounded timeout of at most 600 seconds");
for (const executablePath of [
  "hooks/stop-review-gate",
  "scripts/cc-for-codex",
  "skills/claude-code/scripts/cc-for-codex",
]) {
  const mode = statSync(resolve(pluginRoot, executablePath)).mode;
  expect((mode & 0o111) !== 0, `${executablePath} must be executable`);
}

const listing = marketplace.plugins?.find((entry) => entry.name === "cc-for-codex");
expect(marketplace.name === "cc-for-codex", "marketplace name must be cc-for-codex");
expect(listing?.source?.source === "local", "marketplace plugin source must be local");
expect(listing?.source?.path === "./plugins/cc-for-codex", "marketplace plugin path is incorrect");
expect(listing?.policy?.installation === "AVAILABLE", "marketplace installation policy must be AVAILABLE");

const skillsRoot = resolve(pluginRoot, "skills");
const skillDirectories = readdirSync(skillsRoot)
  .map((name) => ({ name, path: resolve(skillsRoot, name) }))
  .filter((entry) => statSync(entry.path).isDirectory());
expect(skillDirectories.length >= 6, "expected the six focused Claude skills");

for (const skill of skillDirectories) {
  const skillMd = readRequired(resolve(skill.path, "SKILL.md"));
  expect(!skillMd.includes("[TODO:"), `${skill.name}/SKILL.md still has a TODO`);
  expect(new RegExp(`^name:\\s*${escapeRegex(skill.name)}\\s*$`, "mu").test(skillMd), `${skill.name} frontmatter name mismatch`);
  expect(/^description:\s*"[^\n]+"\s*$/mu.test(skillMd), `${skill.name} needs a quoted one-line description`);
  const openaiYaml = readRequired(resolve(skill.path, "agents/openai.yaml"));
  expect(openaiYaml.includes(`$${skill.name}`), `${skill.name} default_prompt must mention $${skill.name}`);
}

for (const relativePath of [
  "README.md",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "docs/architecture.md",
  "docs/feature-parity.md",
  "docs/claude-cli-coverage.md",
  "docs/official-docs.md",
  "plugins/cc-for-codex/hooks/hooks.json",
  "plugins/cc-for-codex/hooks/stop-review-gate",
  "plugins/cc-for-codex/skills/claude-code/scripts/cc-for-codex.mjs",
]) {
  readRequired(resolve(root, relativePath));
}

const readme = readRequired(resolve(root, "README.md"));
expect(readme.includes("https://learn.chatgpt.com/docs/build-plugins"), "README must link OpenAI plugin docs");
expect(readme.includes("https://code.claude.com/docs/en/cli-reference"), "README must link Claude CLI docs");
expect(readme.includes("unofficial"), "README must include the non-affiliation disclaimer");
expect(readme.includes("Use $claude-verify to verify CC for Codex."), "README must include the copy-paste verification handoff");

if (failures.length) {
  process.stderr.write(`Validation failed (${failures.length}):\n${failures.map((failure) => `- ${failure}`).join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Validated cc-for-codex ${manifest.version}: ${skillDirectories.length} skills, marketplace, manifest, docs, and runtime.\n`);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    failures.push(`${path}: ${error.message}`);
    return {};
  }
}

function readRequired(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    failures.push(`${path}: ${error.message}`);
    return "";
  }
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
