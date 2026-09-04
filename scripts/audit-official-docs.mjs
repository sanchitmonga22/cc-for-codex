#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const docsIndexUrl = "https://code.claude.com/docs/llms.txt";
const cliReferenceUrl = "https://code.claude.com/docs/en/cli-reference.md";

const [indexResponse, cliResponse] = await Promise.all([
  fetch(docsIndexUrl, { signal: AbortSignal.timeout(30_000) }),
  fetch(cliReferenceUrl, { signal: AbortSignal.timeout(30_000) }),
]);
if (!indexResponse.ok) throw new Error(`Claude docs index returned HTTP ${indexResponse.status}.`);
if (!cliResponse.ok) throw new Error(`Claude CLI reference returned HTTP ${cliResponse.status}.`);

const [indexText, cliText] = await Promise.all([indexResponse.text(), cliResponse.text()]);
const docsLedger = readFileSync(resolve(root, "docs/claude-docs-coverage.md"), "utf8");
const cliLedger = readFileSync(resolve(root, "docs/claude-cli-coverage.md"), "utf8");

const englishDocs = unique(
  [...indexText.matchAll(/https:\/\/code\.claude\.com\/docs\/en\/[^)\s]+\.md/gu)].map(
    (match) => match[0],
  ),
);
const flagsSection = cliText.match(/## CLI flags([\s\S]*?)### System prompt flags/u)?.[1] || "";
const officialFlags = unique(
  flagsSection
    .split("\n")
    .flatMap((line) => {
      const firstCell = line.match(/^\|\s*`([^`]+)`/u)?.[1] || "";
      return [
        ...firstCell.matchAll(
          /(?:^|[,\s])(--[A-Za-z][A-Za-z0-9-]*|-[A-Za-z])(?=[,\s<]|$)/gu,
        ),
      ].map((match) => match[1]);
    }),
);
const commandsSection = cliText.match(/## CLI commands([\s\S]*?)## CLI flags/u)?.[1] || "";
const officialCommands = unique(
  commandsSection
    .split("\n")
    .map((line) => line.match(/^\|\s*`claude\s+([a-z][a-z0-9-]*)/u)?.[1])
    .filter(Boolean),
);

const missingDocs = englishDocs.filter((url) => !docsLedger.includes(url));
const missingFlags = officialFlags.filter((flag) => !cliLedger.includes(`\`${flag}\``));
const missingCommands = officialCommands.filter((command) => !cliLedger.includes(`\`${command}\``));
const report = {
  checkedAt: new Date().toISOString(),
  source: { docsIndexUrl, cliReferenceUrl },
  official: {
    englishDocs: englishDocs.length,
    topLevelFlagsAndAliases: officialFlags.length,
    topLevelCommands: officialCommands.length,
  },
  missingDocs,
  missingFlags,
  missingCommands,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (missingDocs.length || missingFlags.length || missingCommands.length) process.exitCode = 1;

function unique(values) {
  return [...new Set(values)].sort();
}
