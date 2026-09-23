import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { archiveClaudeSessionTranscript } from "../plugins/cc-for-codex/skills/claude-code/scripts/lib/transcript-archive.mjs";

const sessionId = "29c90d15-2b3c-4a8d-968c-53db4fa6a3ec";

test("archives the exact transcript and same-session sidecars in a private Codex folder", () => {
  const fixture = makeFixture();
  const project = join(fixture.claudeHome, "projects", "project-a");
  const transcript = '{"type":"user","text":"keep every turn 🧭"}\n{"type":"tool_result","text":"full output"}\n';
  const source = join(project, `${sessionId}.jsonl`);
  mkdirSync(project, { recursive: true });
  writeFileSync(source, transcript);
  const toolResults = join(project, sessionId, "tool-results");
  mkdirSync(toolResults, { recursive: true });
  writeFileSync(join(toolResults, "full-output.txt"), "full external tool output\n");

  const archived = archiveClaudeSessionTranscript(sessionId, {
    configDir: fixture.claudeHome,
    codexHome: fixture.codexHome,
    now: new Date("2026-09-23T12:34:56.789Z"),
  });

  assert.equal(readFileSync(archived.transcriptPath, "utf8"), transcript);
  assert.equal(archived.sourceTranscriptPath, realpathSync(source));
  assert.equal(archived.sidecarArchived, true);
  assert.equal(readFileSync(join(archived.sidecarPath, "tool-results", "full-output.txt"), "utf8"), "full external tool output\n");
  assert.equal(
    archived.transcriptSha256,
    createHash("sha256").update(transcript).digest("hex"),
  );
  const metadata = JSON.parse(readFileSync(archived.metadataPath, "utf8"));
  assert.equal(metadata.sourceSessionId, sessionId);
  assert.equal(metadata.transcriptSha256, archived.transcriptSha256);
  assert.equal(metadata.sidecarArchived, true);
  assert.equal((lstatSync(archived.archiveDirectory).mode & 0o777), 0o700);
  assert.equal((lstatSync(archived.transcriptPath).mode & 0o777), 0o600);
  fixture.cleanup();
});

test("missing or ambiguous local transcripts fail before creating an archive", () => {
  const missing = makeFixture();
  mkdirSync(join(missing.claudeHome, "projects"), { recursive: true });
  assert.throws(
    () => archiveClaudeSessionTranscript(sessionId, { configDir: missing.claudeHome, codexHome: missing.codexHome }),
    /local Claude transcript.*not found/u,
  );
  assert.equal(existsSync(join(missing.codexHome, "claude-session-archives")), false);
  missing.cleanup();

  const ambiguous = makeFixture();
  for (const projectName of ["project-a", "project-b"]) {
    const project = join(ambiguous.claudeHome, "projects", projectName);
    mkdirSync(project, { recursive: true });
    writeFileSync(join(project, `${sessionId}.jsonl`), `transcript ${projectName}\n`);
  }
  assert.throws(
    () => archiveClaudeSessionTranscript(sessionId, { configDir: ambiguous.claudeHome, codexHome: ambiguous.codexHome }),
    /More than one local transcript matched/u,
  );
  assert.equal(existsSync(join(ambiguous.codexHome, "claude-session-archives")), false);
  ambiguous.cleanup();
});

test("refuses symlinked transcript sources instead of archiving outside Claude state", () => {
  const fixture = makeFixture();
  const project = join(fixture.claudeHome, "projects", "project-a");
  const external = join(fixture.root, "outside.jsonl");
  mkdirSync(project, { recursive: true });
  writeFileSync(external, "not the selected Claude session\n");
  symlinkSync(external, join(project, `${sessionId}.jsonl`));

  assert.throws(
    () => archiveClaudeSessionTranscript(sessionId, { configDir: fixture.claudeHome, codexHome: fixture.codexHome }),
    /matching Claude transcript is not a regular file/u,
  );
  assert.equal(existsSync(join(fixture.codexHome, "claude-session-archives")), false);
  fixture.cleanup();
});

test("refuses a symlink inside session sidecars and removes the incomplete archive", () => {
  const fixture = makeFixture();
  const project = join(fixture.claudeHome, "projects", "project-a");
  const sidecars = join(project, sessionId);
  const external = join(fixture.root, "outside-result.txt");
  mkdirSync(sidecars, { recursive: true });
  writeFileSync(join(project, `${sessionId}.jsonl`), "valid transcript\n");
  writeFileSync(external, "outside content\n");
  symlinkSync(external, join(sidecars, "outside.txt"));

  assert.throws(
    () => archiveClaudeSessionTranscript(sessionId, { configDir: fixture.claudeHome, codexHome: fixture.codexHome }),
    /sidecars contain a symbolic link/u,
  );
  const archives = join(fixture.codexHome, "claude-session-archives", sessionId);
  assert.deepEqual(requireDirectoryEntries(archives), []);
  fixture.cleanup();
});

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), "ccfc-transcript-test-"));
  return {
    root,
    claudeHome: join(root, "claude"),
    codexHome: join(root, "codex"),
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function requireDirectoryEntries(path) {
  try {
    return readdirSync(path).sort();
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}
