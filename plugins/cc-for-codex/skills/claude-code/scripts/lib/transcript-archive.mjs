import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readSync,
  realpathSync,
  renameSync,
  rmSync,
  writeSync,
} from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { BridgeError, validateResumeId } from "./runtime.mjs";

const MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024;
const MAX_ARCHIVE_FILES = 20_000;
const MAX_ARCHIVE_DEPTH = 64;

export function archiveClaudeSessionTranscript(
  sessionId,
  {
    configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"),
    codexHome = process.env.CODEX_HOME || join(homedir(), ".codex"),
    now = new Date(),
  } = {},
) {
  const normalizedId = validateResumeId(sessionId);
  const configRoot = realDirectory(configDir, "Claude configuration directory");
  const projectsRoot = join(configRoot, "projects");
  if (!existsSync(projectsRoot)) {
    throw new BridgeError("No local Claude transcript store was found; import stopped before calling Claude.");
  }
  requireRealDirectory(projectsRoot, "Claude project transcript directory");

  const matches = [];
  for (const project of readdirSync(projectsRoot, { withFileTypes: true })) {
    if (!project.isDirectory() || project.isSymbolicLink()) continue;
    const projectPath = join(projectsRoot, project.name);
    const transcriptPath = join(projectPath, `${normalizedId}.jsonl`);
    if (!existsSync(transcriptPath)) continue;
    const metadata = lstatSync(transcriptPath);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new BridgeError("The matching Claude transcript is not a regular file; import stopped safely.");
    }
    matches.push({ projectPath, transcriptPath });
  }

  if (matches.length === 0) {
    throw new BridgeError(
      "The local Claude transcript for this session was not found. It may have expired, persistence may be disabled, or the session may use a different Claude configuration directory. No summary request was sent.",
    );
  }
  if (matches.length !== 1) {
    throw new BridgeError("More than one local transcript matched this Claude session ID; import stopped to avoid archiving the wrong conversation.");
  }

  const { projectPath, transcriptPath } = matches[0];
  const sourceStat = lstatSync(transcriptPath);
  if (sourceStat.size <= 0) {
    throw new BridgeError("The Claude transcript is empty; import stopped before calling Claude.");
  }
  if (sourceStat.size > MAX_ARCHIVE_BYTES) {
    throw new BridgeError("The Claude transcript exceeds the 1 GiB safe archive limit; no summary request was sent.");
  }

  const codexRoot = realDirectory(codexHome, "Codex home directory", { create: true });
  const archiveRoot = ensurePrivateDirectory(join(codexRoot, "claude-session-archives"));
  const sessionArchiveRoot = ensurePrivateDirectory(join(archiveRoot, normalizedId));
  const temporaryArchive = mkdtempSync(join(sessionArchiveRoot, ".incomplete-"));
  chmodSync(temporaryArchive, 0o700);

  try {
    const transcriptArchivePath = join(temporaryArchive, "transcript.jsonl");
    const transcriptResult = copyRegularFile(transcriptPath, transcriptArchivePath, {
      bytes: 0,
      files: 0,
      hash: createHash("sha256"),
    });

    const sidecarSource = join(projectPath, normalizedId);
    let sidecarArchived = false;
    const archiveBudget = { bytes: transcriptResult.bytes, files: transcriptResult.files };
    if (existsSync(sidecarSource)) {
      requireRealDirectory(sidecarSource, "Claude session sidecar directory");
      copyDirectory(sidecarSource, join(temporaryArchive, "session-data"), archiveBudget, 0);
      sidecarArchived = true;
    }

    const digest = transcriptResult.hash.digest("hex");
    const archivedAt = now.toISOString();
    const metadata = {
      schemaVersion: 1,
      sourceSessionId: normalizedId,
      archivedAt,
      sourceTranscriptPath: transcriptPath,
      transcriptPath: "transcript.jsonl",
      transcriptSha256: digest,
      transcriptBytes: transcriptResult.bytes,
      sidecarArchived,
      ...(sidecarArchived ? { sidecarPath: "session-data" } : {}),
    };
    writePrivateFile(join(temporaryArchive, "archive.json"), `${JSON.stringify(metadata, null, 2)}\n`);

    const archiveName = archiveTimestamp(now);
    let finalArchive = join(sessionArchiveRoot, archiveName);
    if (existsSync(finalArchive)) {
      finalArchive = join(sessionArchiveRoot, `${archiveName}-${randomBytes(4).toString("hex")}`);
    }
    renameSync(temporaryArchive, finalArchive);

    return {
      sourceSessionId: normalizedId,
      sourceTranscriptPath: transcriptPath,
      archiveDirectory: finalArchive,
      transcriptPath: join(finalArchive, "transcript.jsonl"),
      metadataPath: join(finalArchive, "archive.json"),
      transcriptSha256: digest,
      transcriptBytes: transcriptResult.bytes,
      sidecarArchived,
      ...(sidecarArchived ? { sidecarPath: join(finalArchive, "session-data") } : {}),
      archivedAt,
    };
  } catch (error) {
    rmSync(temporaryArchive, { recursive: true, force: true });
    if (error instanceof BridgeError) throw error;
    throw new BridgeError(`Claude transcript archive failed safely: ${safeError(error)}`);
  }
}

function copyDirectory(source, destination, budget, depth) {
  if (depth > MAX_ARCHIVE_DEPTH) {
    throw new BridgeError("Claude session sidecar nesting exceeds the safe archive limit.");
  }
  requireRealDirectory(source, "Claude session sidecar directory");
  mkdirSync(destination, { mode: 0o700 });
  chmodSync(destination, 0o700);

  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (budget.files >= MAX_ARCHIVE_FILES) {
      throw new BridgeError("Claude session sidecars exceed the 20,000-file safe archive limit.");
    }
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);
    if (entry.isSymbolicLink()) {
      throw new BridgeError("Claude session sidecars contain a symbolic link; import stopped to avoid copying data outside the session.");
    }
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath, budget, depth + 1);
      continue;
    }
    if (!entry.isFile()) {
      throw new BridgeError("Claude session sidecars contain a non-regular file; import stopped safely.");
    }
    const copied = copyRegularFile(sourcePath, destinationPath, budget);
    budget.bytes = copied.bytes;
    budget.files = copied.files;
  }
}

function copyRegularFile(source, destination, budget) {
  let sourceFd;
  let destinationFd;
  const hash = budget.hash;
  try {
    sourceFd = openSync(source, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0));
    const sourceStat = fstatSync(sourceFd);
    if (!sourceStat.isFile()) throw new BridgeError("Claude transcript archive source is not a regular file.");
    if (budget.bytes + sourceStat.size > MAX_ARCHIVE_BYTES) {
      throw new BridgeError("Claude transcript and sidecars exceed the 1 GiB safe archive limit.");
    }
    destinationFd = openSync(destination, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL, 0o600);

    let totalBytes = budget.bytes;
    let fileBytes = 0;
    const buffer = Buffer.allocUnsafe(64 * 1024);
    // Snapshot the size observed on open. A running Claude session may append
    // more JSONL while the copy is in progress; those later bytes belong to a
    // later snapshot, not to this archive's claimed size and hash.
    while (fileBytes < sourceStat.size) {
      const readBytes = readSync(sourceFd, buffer, 0, Math.min(buffer.length, sourceStat.size - fileBytes), null);
      if (readBytes === 0) {
        throw new BridgeError("Claude transcript changed while being archived; import stopped before calling Claude.");
      }
      const chunk = buffer.subarray(0, readBytes);
      let offset = 0;
      while (offset < chunk.length) offset += writeSync(destinationFd, chunk, offset, chunk.length - offset);
      totalBytes += readBytes;
      fileBytes += readBytes;
      hash?.update(chunk);
      if (totalBytes > MAX_ARCHIVE_BYTES) throw new BridgeError("Claude transcript and sidecars exceed the 1 GiB safe archive limit.");
    }
    chmodSync(destination, 0o600);
    return { bytes: totalBytes, files: budget.files + 1, fileBytes, hash };
  } finally {
    if (sourceFd !== undefined) closeSync(sourceFd);
    if (destinationFd !== undefined) closeSync(destinationFd);
  }
}

function writePrivateFile(path, content) {
  const fd = openSync(path, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL, 0o600);
  try {
    writeSync(fd, content);
    chmodSync(path, 0o600);
  } finally {
    closeSync(fd);
  }
}

function realDirectory(path, label, { create = false } = {}) {
  const requested = resolve(path);
  if (create && !existsSync(requested)) mkdirSync(requested, { recursive: true, mode: 0o700 });
  try {
    const canonical = realpathSync(requested);
    if (!lstatSync(canonical).isDirectory()) throw new Error("not a directory");
    return canonical;
  } catch {
    throw new BridgeError(`${label} could not be resolved safely.`);
  }
}

function requireRealDirectory(path, label) {
  try {
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error("not a real directory");
  } catch {
    throw new BridgeError(`${label} is missing or is not a real directory.`);
  }
}

function ensurePrivateDirectory(path) {
  try {
    mkdirSync(path, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new BridgeError("Claude transcript archive path must contain only real directories.");
  }
  if (process.platform !== "win32" && (metadata.mode & 0o077) !== 0) {
    throw new BridgeError("Claude transcript archive directory permissions are too broad; restrict them to the current user before importing.");
  }
  return realpathSync(path);
}

function archiveTimestamp(date) {
  return date.toISOString().replace(/[-:.]/gu, "");
}

function safeError(error) {
  return String(error?.message || "unknown error").replace(/[\r\n\t]/gu, " ").slice(0, 300);
}
