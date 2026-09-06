import assert from "node:assert/strict";
import test from "node:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installGlobalWorkflow, inspectGlobalWorkflow } from "../plugins/cc-for-codex/scripts/install-global-workflow.mjs";
import { inspectGlobalWorkflowRemoval, uninstallGlobalWorkflow } from "../plugins/cc-for-codex/scripts/uninstall-global-workflow.mjs";

function makeHome() {
  return mkdtempSync(join(tmpdir(), "ccfc-workflow-"));
}

function targets(home) {
  return {
    claudeFile: join(home, ".claude", "CLAUDE.md"),
    codexFile: join(home, ".codex", "AGENTS.md"),
  };
}

test("global workflow installer defaults to a non-mutating check", () => {
  const home = makeHome();
  try {
    const result = inspectGlobalWorkflow({ home });
    assert.equal(result.mode, "check");
    assert.equal(result.changed, false);
    assert.deepEqual(result.records.map((record) => record.state), ["missing", "missing"]);
    assert.equal(existsSync(join(home, ".claude")), false);
    assert.equal(existsSync(join(home, ".codex")), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("global workflow installer creates both files and is idempotent", () => {
  const home = makeHome();
  try {
    const paths = targets(home);
    const applied = installGlobalWorkflow({ home, apply: true });
    assert.equal(applied.changed, true);
    assert.deepEqual(applied.records.map((record) => record.action), ["created", "created"]);
    for (const path of Object.values(paths)) {
      const content = readFileSync(path, "utf8");
      assert.equal((content.match(/cc-for-codex:begin codex-first-workflow/gu) || []).length, 1);
      assert.equal((content.match(/cc-for-codex:end codex-first-workflow/gu) || []).length, 1);
    }
    const repeated = installGlobalWorkflow({ home, apply: true });
    assert.equal(repeated.changed, false);
    assert.deepEqual(repeated.records.map((record) => record.action), ["already-present", "already-present"]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("global workflow installer backs up existing files before appending", () => {
  const home = makeHome();
  try {
    const paths = targets(home);
    const existing = "# Existing instructions\n\nKeep this text.\n";
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(paths.claudeFile, existing);
    const result = installGlobalWorkflow({ home, apply: true });
    assert.equal(result.records[0].action, "appended");
    assert.equal(result.records[1].action, "created");
    assert.ok(result.records[0].backupPath);
    assert.equal(readFileSync(result.records[0].backupPath, "utf8"), existing);
    assert.match(readFileSync(paths.claudeFile, "utf8"), /Keep this text\./u);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("global workflow installer refuses symlink targets", () => {
  const home = makeHome();
  try {
    const paths = targets(home);
    const real = join(home, "real-claude.md");
    writeFileSync(real, "# Existing\n");
    const claudeDirectory = join(home, ".claude");
    const symlink = paths.claudeFile;
    // Parent creation is intentionally explicit here; the installer must not
    // follow the final symlink when it inspects the target.
    mkdirSync(claudeDirectory, { recursive: true });
    symlinkSync(real, symlink);
    assert.throws(
      () => installGlobalWorkflow({ home, apply: true }),
      /symbolic-link target/u,
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("global workflow installer surfaces legacy role conflicts before mutation", () => {
  const home = makeHome();
  try {
    const paths = targets(home);
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(paths.claudeFile, "Claude Code writes. Codex reviews.\n");
    assert.throws(
      () => installGlobalWorkflow({ home, apply: true }),
      /allow-conflicts/u,
    );
    assert.doesNotMatch(readFileSync(paths.claudeFile, "utf8"), /codex-first-workflow/u);
    const applied = installGlobalWorkflow({ home, apply: true, allowConflicts: true });
    assert.equal(applied.records[0].action, "appended");
    assert.match(readFileSync(paths.claudeFile, "utf8"), /Claude Code writes\. Codex reviews\./u);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("global workflow uninstaller removes only managed blocks and is reversible", () => {
  const home = makeHome();
  try {
    const paths = targets(home);
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(paths.claudeFile, "# Keep this instruction.\n");
    installGlobalWorkflow({ home, apply: true });
    const before = readFileSync(paths.claudeFile, "utf8");
    assert.match(before, /Keep this instruction\./u);

    const preview = inspectGlobalWorkflowRemoval({ home });
    assert.equal(preview.changed, false);
    assert.deepEqual(preview.records.map((record) => record.state), ["installed", "installed"]);
    assert.equal(readFileSync(paths.claudeFile, "utf8"), before);

    const removed = uninstallGlobalWorkflow({ home, apply: true });
    assert.equal(removed.changed, true);
    assert.deepEqual(removed.records.map((record) => record.action), ["removed", "removed"]);
    assert.equal(readFileSync(paths.claudeFile, "utf8"), "# Keep this instruction.\n");
    assert.ok(removed.records[0].backupPath);
    assert.equal(readFileSync(removed.records[0].backupPath, "utf8"), before);

    const repeated = uninstallGlobalWorkflow({ home, apply: true });
    assert.equal(repeated.changed, false);
    assert.deepEqual(repeated.records.map((record) => record.action), ["not-installed", "not-installed"]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("global workflow uninstaller refuses partial managed blocks", () => {
  const home = makeHome();
  try {
    const paths = targets(home);
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(paths.claudeFile, "<!-- cc-for-codex:begin codex-first-workflow -->\n");
    assert.throws(
      () => uninstallGlobalWorkflow({ home, apply: true }),
      /only one boundary marker/u,
    );
    assert.match(readFileSync(paths.claudeFile, "utf8"), /begin codex-first-workflow/u);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
