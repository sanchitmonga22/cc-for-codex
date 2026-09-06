import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const templateDirectory = resolve(moduleDirectory, "../references/global");
export const WORKFLOW_BEGIN_MARKER = "<!-- cc-for-codex:begin codex-first-workflow -->";
export const WORKFLOW_END_MARKER = "<!-- cc-for-codex:end codex-first-workflow -->";

const targetDefinitions = [
  {
    role: "claude",
    label: "Claude instructions",
    directory: ".claude",
    names: ["CLAUDE.md", "claude.md"],
    template: resolve(templateDirectory, "CLAUDE.md"),
    legacyPattern: /Claude Code writes\.\s*Codex reviews\./iu,
  },
  {
    role: "codex",
    label: "Codex instructions",
    directory: ".codex",
    names: ["AGENTS.md", "agents.md"],
    template: resolve(templateDirectory, "AGENTS.md"),
    legacyPattern: /(?:independent reviewer|Codex is the cross-model second opinion)/iu,
  },
];

/**
 * Inspect the two global instruction targets without changing any files.
 * Explicit paths are useful for tests and for users with a non-standard layout.
 */
export function inspectGlobalWorkflow({ claudeFile, codexFile, home = homedir() } = {}) {
  const targets = resolveGlobalWorkflowTargets({ claudeFile, codexFile, home });
  const records = targetDefinitions.map((definition) => inspectTarget(definition, targets[definition.role]));
  return {
    mode: "check",
    changed: false,
    records,
  };
}

/** Resolve the global instruction targets without reading or changing them. */
export function resolveGlobalWorkflowTargets({ claudeFile, codexFile, home = homedir() } = {}) {
  const explicit = { claude: claudeFile, codex: codexFile };
  return Object.fromEntries(targetDefinitions.map((definition) => [
    definition.role,
    resolveTarget(definition, explicit[definition.role], home),
  ]));
}

/**
 * Preview or append the managed role blocks. `apply` is deliberately required
 * for mutation; the operation is idempotent and never replaces existing prose.
 */
export function installGlobalWorkflow({
  apply = false,
  allowConflicts = false,
  claudeFile,
  codexFile,
  home = homedir(),
} = {}) {
  const inspection = inspectGlobalWorkflow({ claudeFile, codexFile, home });
  const errors = inspection.records.filter((record) => record.state === "error");
  if (errors.length) {
    throw new Error(errors.map((record) => `${record.label} (${record.path}): ${record.message}`).join("\n"));
  }

  const conflicts = inspection.records.filter((record) => record.state === "conflict");
  if (apply && conflicts.length && !allowConflicts) {
    throw new Error(
      `Existing role text conflicts with the Codex-first workflow in ${conflicts.map((record) => record.path).join(", ")}. ` +
      "Review those files, then rerun with --allow-conflicts to append without deleting existing text.",
    );
  }

  if (!apply) return inspection;

  const records = inspection.records.map((record) => {
    if (record.state === "already-present") {
      return { ...record, action: "already-present" };
    }
    const definition = targetDefinitions.find((item) => item.role === record.role);
    return appendBlock(definition, record);
  });
  return {
    mode: "apply",
    changed: records.some((record) => record.action === "created" || record.action === "appended"),
    records,
  };
}

export function renderWorkflow(result) {
  const title = result.mode === "apply"
    ? "CC for Codex: Codex-first workflow setup applied"
    : "CC for Codex: Codex-first workflow setup dry run";
  const lines = [title];
  for (const record of result.records || []) {
    const detail = record.action || record.state;
    lines.push(`${record.label}: ${detail} — ${safeLine(record.path)}`);
    if (record.backupPath) lines.push(`Backup: ${safeLine(record.backupPath)}`);
    if (record.message) lines.push(`Note: ${safeLine(record.message)}`);
  }
  if (result.mode === "check") {
    lines.push("No files changed. Add --apply to append the managed blocks.");
  } else if (!result.changed) {
    lines.push("Both managed blocks were already present; no files changed.");
  }
  return lines.join("\n");
}

function resolveTarget(definition, explicitPath, home) {
  if (explicitPath !== undefined) {
    if (!String(explicitPath).trim()) throw new Error(`--${definition.role}-file cannot be empty.`);
    return resolve(expandHome(String(explicitPath)));
  }
  const directory = resolve(home, definition.directory);
  for (const name of definition.names) {
    const candidate = join(directory, name);
    try {
      lstatSync(candidate);
      return resolve(candidate);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return join(directory, definition.names[0]);
}

function inspectTarget(definition, path) {
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { role: definition.role, label: definition.label, path, state: "missing" };
    }
    return { role: definition.role, label: definition.label, path, state: "error", message: error.message };
  }

  if (stat.isSymbolicLink()) {
    return {
      role: definition.role,
      label: definition.label,
      path,
      state: "error",
      message: "refusing to modify a symbolic-link target; pass an explicit real file path after reviewing it",
    };
  }
  if (!stat.isFile()) {
    return { role: definition.role, label: definition.label, path, state: "error", message: "target is not a regular file" };
  }

  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    return { role: definition.role, label: definition.label, path, state: "error", message: error.message };
  }
  const hasBegin = text.includes(WORKFLOW_BEGIN_MARKER);
  const hasEnd = text.includes(WORKFLOW_END_MARKER);
  if (hasBegin !== hasEnd) {
    return { role: definition.role, label: definition.label, path, state: "error", message: "managed block has only one boundary marker" };
  }
  if (hasBegin) {
    return { role: definition.role, label: definition.label, path, state: "already-present" };
  }
  if (definition.legacyPattern.test(text)) {
    return {
      role: definition.role,
      label: definition.label,
      path,
      state: "conflict",
      message: "legacy role wording detected; existing text will be preserved",
    };
  }
  return { role: definition.role, label: definition.label, path, state: "ready" };
}

function appendBlock(definition, record) {
  const current = record.state === "missing" ? "" : readFileSync(record.path, "utf8");
  const block = readFileSync(definition.template, "utf8").trim();
  const updated = current.trimEnd() ? `${current.trimEnd()}\n\n${block}\n` : `${block}\n`;
  const existing = record.state !== "missing";
  const backupPath = existing ? makeBackup(record.path) : undefined;
  if (backupPath) copyFileSync(record.path, backupPath);
  const mode = existing ? (lstatSync(record.path).mode & 0o777) : 0o600;
  writeAtomic(record.path, updated, mode);
  const verified = inspectTarget(definition, record.path);
  if (verified.state !== "already-present") {
    throw new Error(`${record.path}: append completed without a complete managed block`);
  }
  return { ...record, action: existing ? "appended" : "created", backupPath };
}

export function makeBackup(path) {
  const stamp = new Date().toISOString().replace(/[.:]/gu, "-");
  const base = `${path}.cc-for-codex.backup-${stamp}`;
  let candidate = base;
  let counter = 1;
  while (existsSync(candidate)) candidate = `${base}-${counter++}`;
  return candidate;
}

export function writeAtomic(path, text, mode) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = join(dirname(path), `.${basename(path)}.cc-for-codex-${process.pid}-${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, text, { encoding: "utf8", mode });
    renameSync(temporary, path);
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* best-effort cleanup */ }
    throw error;
  }
}

function expandHome(path) {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

export function safeLine(value) {
  return String(value)
    .replace(/[\u0000-\u001F\u007F-\u009F\u061C\u200E\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069]/gu, "?")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 500);
}

export async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: true,
    options: {
      apply: { type: "boolean" },
      check: { type: "boolean" },
      "allow-conflicts": { type: "boolean" },
      "claude-file": { type: "string" },
      "codex-file": { type: "string" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    process.stdout.write("install-global-workflow [--check|--apply] [--allow-conflicts] [--claude-file path] [--codex-file path]\n");
    return;
  }
  if (positionals.length) throw new Error("workflow installer does not accept positional arguments");
  if (values.apply && values.check) throw new Error("choose either --check or --apply, not both");
  if (values["allow-conflicts"] && !values.apply) throw new Error("--allow-conflicts requires --apply");
  const result = installGlobalWorkflow({
    apply: values.apply === true,
    allowConflicts: values["allow-conflicts"] === true,
    claudeFile: values["claude-file"],
    codexFile: values["codex-file"],
  });
  process.stdout.write(`${values.json ? JSON.stringify(result, null, 2) : renderWorkflow(result)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`cc-for-codex: ${safeLine(error instanceof Error ? error.message : error)}\n`);
    process.exitCode = 1;
  });
}
