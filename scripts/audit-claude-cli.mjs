#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveExecutable, runProcess } from "../plugins/cc-for-codex/skills/claude-code/scripts/lib/runtime.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const coverageLedger = readFileSync(resolve(root, "docs/claude-cli-coverage.md"), "utf8");

const requiredFlags = [
  "--safe-mode",
  "--restricted",
  "--dangerously-skip-permissions",
  "--strict-mcp-config",
  "--no-chrome",
  "--permission-mode",
  "--permission-prompts",
  "--tools",
  "--output-format",
  "--json-schema",
  "--max-budget-usd",
  "--model",
  "--effort",
  "--resume",
  "--bg",
  "--worktree",
];
const requiredCommands = [
  "agents",
  "attach",
  "auth",
  "doctor",
  "logs",
  "respawn",
  "rm",
  "stop",
  "ultrareview",
];

const binary = resolveExecutable(process.argv[2]);
const [version, help, agentHelp, ultraHelp] = await Promise.all([
  runProcess(binary, ["--version"], { timeoutMs: 15_000 }),
  runProcess(binary, ["--help"], { timeoutMs: 15_000 }),
  runProcess(binary, ["agents", "--help"], { timeoutMs: 15_000 }),
  runProcess(binary, ["ultrareview", "--help"], { timeoutMs: 15_000 }),
]);

const missingFlags = requiredFlags.filter((flag) => !help.stdout.includes(flag));
const missingCommands = requiredCommands.filter((command) => !new RegExp(`^\\s{2}${command}(?:[|\\s])`, "mu").test(help.stdout));
const optionHelp = help.stdout.split(/^Commands:/mu)[0];
const discoveredFlags = [
  ...new Set(
    optionHelp
      .split("\n")
      .filter((line) => /^\s{2,}-/u.test(line))
      .flatMap((line) =>
        [...line.matchAll(/(?:^|[,\s])(--[A-Za-z][A-Za-z0-9-]*|-[A-Za-z])(?=[,\s<]|$)/gu)].map(
          (match) => match[1],
        ),
      ),
  ),
];
const commandHelp = help.stdout.split(/^Commands:/mu)[1] || "";
const discoveredCommands = [...new Set([...commandHelp.matchAll(/^\s{2}([a-z][a-z0-9-]*(?:\|[a-z][a-z0-9-]*)*)/gmu)].map((match) => match[1]))];
const unmappedInstalledFlags = discoveredFlags.filter((flag) => !coverageLedger.includes(`\`${flag}\``));
const unmappedInstalledCommands = discoveredCommands
  .flatMap((command) => command.split("|"))
  .filter((command) => !coverageLedger.includes(`\`${command}\``));
const commandSurfaces = await crawlCommandSurfaces(binary, help.stdout);
const unmappedCommandSurfaces = commandSurfaces.flatMap((surface) => {
  const commandToken = `\`claude ${surface.path.join(" ")}\``;
  const ledgerLine = coverageLedger
    .split("\n")
    .find((line) => line.includes(commandToken));
  if (!ledgerLine) return [{ command: surface.path.join(" "), missing: "command" }];
  return surface.flags
    .filter((flag) => !ledgerLine.includes(`\`${flag}\``))
    .map((flag) => ({ command: surface.path.join(" "), missing: flag }));
});

const report = {
  binary,
  version: version.stdout.trim(),
  discovered: {
    topLevelFlags: discoveredFlags.length,
    topLevelCommands: discoveredCommands.length,
    commandHelpSurfaces: commandSurfaces.length,
    agentsJson: agentHelp.stdout.includes("--json"),
    ultrareviewNoPost: ultraHelp.stdout.includes("--no-post"),
    maxTurnsAdvertisedInHelp: help.stdout.includes("--max-turns"),
  },
  required: {
    flags: requiredFlags.length,
    commands: requiredCommands.length,
  },
  missingFlags,
  missingCommands,
  unmappedInstalledFlags,
  unmappedInstalledCommands,
  unmappedCommandSurfaces,
  commandSurfaces,
  coverage: "Guarded commands model stable workflows; the audit recursively checks every command advertised through standard Commands sections and fails if a command-specific option is absent from its coverage-ledger row.",
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (
  missingFlags.length ||
  missingCommands.length ||
  unmappedInstalledFlags.length ||
  unmappedInstalledCommands.length ||
  unmappedCommandSurfaces.length ||
  !report.discovered.agentsJson ||
  !report.discovered.ultrareviewNoPost
) {
  process.exitCode = 1;
}

async function crawlCommandSurfaces(executable, rootHelp) {
  const queue = parseCommands(rootHelp).map((command) => [command]);
  for (const optionalPath of [["daemon"], ["remote-control"], ["self-hosted-runner"]]) {
    queue.push(optionalPath);
  }
  const seen = new Set();
  const surfaces = [];
  while (queue.length) {
    const path = queue.shift();
    const key = path.join(" ");
    if (seen.has(key)) continue;
    seen.add(key);
    if (seen.size > 256 || path.length > 6) {
      throw new Error("Claude command-help tree exceeded the audit safety limit.");
    }
    const optional = !parseCommands(rootHelp).includes(path[0]);
    let result;
    try {
      result = await runProcess(executable, [...path, "--help"], {
        timeoutMs: optional ? 3_000 : 15_000,
        allowNonZero: optional,
      });
    } catch (error) {
      if (optional && error?.exitCode === 124 && error?.result?.stdout) {
        result = { code: 0, stdout: error.result.stdout };
      } else {
        throw error;
      }
    }
    if (result.code !== 0) continue;
    surfaces.push({ path, flags: parseOptionFlags(result.stdout) });
    for (const child of parseCommands(result.stdout)) queue.push([...path, child]);
  }
  return surfaces.sort((left, right) => left.path.join(" ").localeCompare(right.path.join(" ")));
}

function parseCommands(helpText) {
  const commandHelp = helpText.split(/^Commands:\s*$/mu)[1] || "";
  return [
    ...new Set(
      [...commandHelp.matchAll(/^\s{2}([a-z][a-z0-9-]*(?:\|[a-z][a-z0-9-]*)*)(?=\s|\[|<|$)/gmu)]
        .map((match) => match[1].split("|")[0])
        .filter((command) => command !== "help"),
    ),
  ];
}

function parseOptionFlags(helpText) {
  const optionLines = helpText
    .split("\n")
    .filter((line) => /^\s+-/u.test(line) || /^Usage:.*--/iu.test(line));
  const flags = [
    ...new Set(
      optionLines.flatMap((line) =>
          [...line.matchAll(/(?:^|[,\s])(--[A-Za-z][A-Za-z0-9-]*|-[A-Za-z])(?=[,\s<]|$)/gu)]
            .map((match) => match[1]),
        ),
    ),
  ];
  for (const line of optionLines) {
    for (const match of line.matchAll(/--\[no-\]([A-Za-z][A-Za-z0-9-]*)/gu)) {
      flags.push(`--${match[1]}`, `--no-${match[1]}`);
    }
  }
  return [...new Set(flags)].filter((flag) => flag !== "--help" && flag !== "-h").sort();
}
