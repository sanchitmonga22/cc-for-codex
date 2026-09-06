#!/usr/bin/env node

import {
  copyFileSync,
  lstatSync,
  readFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  WORKFLOW_BEGIN_MARKER,
  WORKFLOW_END_MARKER,
  makeBackup,
  resolveGlobalWorkflowTargets,
  safeLine,
  writeAtomic,
} from "./install-global-workflow.mjs";

const labels = {
  claude: "Claude instructions",
  codex: "Codex instructions",
};

const managedBlockPattern = new RegExp(
  `(?:^|\\r?\\n)${escapeRegex(WORKFLOW_BEGIN_MARKER)}[\\s\\S]*?${escapeRegex(WORKFLOW_END_MARKER)}(?:\\r?\\n|$)`,
  "gu",
);

/**
 * Inspect the managed blocks without changing files. Only the exact blocks
 * marked by this project are eligible for removal; all surrounding prose is
 * retained.
 */
export function inspectGlobalWorkflowRemoval({ claudeFile, codexFile, home = homedir() } = {}) {
  const targets = resolveGlobalWorkflowTargets({ claudeFile, codexFile, home });
  return {
    mode: "check",
    changed: false,
    records: Object.entries(targets).map(([role, path]) => inspectRemovalTarget(role, path)),
  };
}

/** Remove only complete CC for Codex blocks, preserving files and user text. */
export function uninstallGlobalWorkflow({ apply = false, claudeFile, codexFile, home = homedir() } = {}) {
  const inspection = inspectGlobalWorkflowRemoval({ claudeFile, codexFile, home });
  const errors = inspection.records.filter((record) => record.state === "error");
  if (errors.length) {
    throw new Error(errors.map((record) => `${record.label} (${record.path}): ${record.message}`).join("\n"));
  }
  if (!apply) return inspection;

  const records = inspection.records.map((record) => {
    if (record.state !== "installed") {
      return { ...record, action: record.state === "missing" ? "missing" : "not-installed" };
    }
    const current = readFileSync(record.path, "utf8");
    const updated = removeManagedBlocks(current);
    const backupPath = makeBackup(record.path);
    copyFileSync(record.path, backupPath);
    const mode = lstatSync(record.path).mode & 0o777;
    writeAtomic(record.path, updated, mode);
    const remaining = countMarker(current === updated ? updated : readFileSync(record.path, "utf8"));
    if (remaining.begin !== 0 || remaining.end !== 0) {
      throw new Error(`${record.path}: removal completed with a managed marker still present`);
    }
    return { ...record, action: "removed", backupPath };
  });

  return {
    mode: "apply",
    changed: records.some((record) => record.action === "removed"),
    records,
  };
}

export function renderUninstallWorkflow(result) {
  const title = result.mode === "apply"
    ? "CC for Codex: Codex-first workflow blocks removed"
    : "CC for Codex: Codex-first workflow removal dry run";
  const lines = [title];
  for (const record of result.records || []) {
    const detail = record.action || record.state;
    lines.push(`${record.label}: ${detail} — ${safeLine(record.path)}`);
    if (record.backupPath) lines.push(`Backup: ${safeLine(record.backupPath)}`);
    if (record.message) lines.push(`Note: ${safeLine(record.message)}`);
  }
  if (result.mode === "check") {
    lines.push("No files changed. Add --apply to remove only the marked blocks.");
  } else if (!result.changed) {
    lines.push("No managed blocks were present; no files changed.");
  }
  return lines.join("\n");
}

function inspectRemovalTarget(role, path) {
  const label = labels[role];
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if (error?.code === "ENOENT") return { role, label, path, state: "missing" };
    return { role, label, path, state: "error", message: error.message };
  }
  if (stat.isSymbolicLink()) {
    return {
      role,
      label,
      path,
      state: "error",
      message: "refusing to modify a symbolic-link target; pass an explicit real file path after reviewing it",
    };
  }
  if (!stat.isFile()) return { role, label, path, state: "error", message: "target is not a regular file" };

  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    return { role, label, path, state: "error", message: error.message };
  }
  const markers = countMarker(text);
  if (markers.begin !== markers.end) {
    return { role, label, path, state: "error", message: "managed block has only one boundary marker" };
  }
  if (markers.begin === 0) return { role, label, path, state: "not-installed" };
  managedBlockPattern.lastIndex = 0;
  if (!managedBlockPattern.test(text)) {
    return { role, label, path, state: "error", message: "managed markers are not a complete removable block" };
  }
  managedBlockPattern.lastIndex = 0;
  return { role, label, path, state: "installed", count: markers.begin };
}

function removeManagedBlocks(text) {
  managedBlockPattern.lastIndex = 0;
  return text.replace(managedBlockPattern, "");
}

function countMarker(text) {
  return {
    begin: countOccurrences(text, WORKFLOW_BEGIN_MARKER),
    end: countOccurrences(text, WORKFLOW_END_MARKER),
  };
}

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: true,
    options: {
      apply: { type: "boolean" },
      check: { type: "boolean" },
      "claude-file": { type: "string" },
      "codex-file": { type: "string" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    process.stdout.write("uninstall-global-workflow [--check|--apply] [--claude-file path] [--codex-file path]\n");
    return;
  }
  if (positionals.length) throw new Error("workflow uninstaller does not accept positional arguments");
  if (values.apply && values.check) throw new Error("choose either --check or --apply, not both");
  const result = uninstallGlobalWorkflow({
    apply: values.apply === true,
    claudeFile: values["claude-file"],
    codexFile: values["codex-file"],
  });
  process.stdout.write(`${values.json ? JSON.stringify(result, null, 2) : renderUninstallWorkflow(result)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`cc-for-codex: ${safeLine(error instanceof Error ? error.message : error)}\n`);
    process.exitCode = 1;
  });
}
