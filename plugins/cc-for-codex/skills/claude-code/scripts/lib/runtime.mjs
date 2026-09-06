import { constants as fsConstants } from "node:fs";
import {
  accessSync,
  closeSync,
  existsSync,
  fstatSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  realpathSync,
  statSync,
} from "node:fs";
import { delimiter, isAbsolute, relative, resolve, sep } from "node:path";
import { spawn } from "node:child_process";

export const BRIDGE_VERSION = "0.2.2";
export const DEFAULT_OUTPUT_LIMIT = 10 * 1024 * 1024;
export const DEFAULT_PROMPT_LIMIT = 1024 * 1024;

export class BridgeError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "BridgeError";
    this.exitCode = options.exitCode ?? 2;
    this.details = options.details;
  }
}

export class ProcessError extends BridgeError {
  constructor(message, result, options = {}) {
    super(message, { ...options, exitCode: options.exitCode ?? 1 });
    this.name = "ProcessError";
    this.result = result;
  }
}

export function canonicalDirectory(value = process.cwd()) {
  if (typeof value !== "string" || value.length === 0) {
    throw new BridgeError("Working directory must be a non-empty path.");
  }
  assertNoUnsafeControl(value, "working directory");

  let canonical;
  try {
    canonical = realpathSync(resolve(value));
  } catch {
    throw new BridgeError(`Working directory does not exist: ${value}`);
  }
  assertNoUnsafeControl(canonical, "canonical working directory");

  if (!statSync(canonical).isDirectory()) {
    throw new BridgeError(`Working directory is not a directory: ${value}`);
  }
  return canonical;
}

export function resolveExecutable(explicitValue, cwd = process.cwd()) {
  if (explicitValue !== undefined && (typeof explicitValue !== "string" || explicitValue.length === 0)) {
    throw new BridgeError("Claude executable must be a non-empty command name or absolute path.");
  }
  const requested = explicitValue !== undefined
    ? explicitValue
    : process.env.CC_FOR_CODEX_CLAUDE_BIN || "claude";
  return resolvePathExecutable(requested, "Claude executable", {
    rejectInside: workspaceBoundaries(cwd),
  });
}

export function resolvePathExecutable(requested, label = "executable", options = {}) {
  if (typeof requested !== "string" || requested.length === 0) {
    throw new BridgeError(`${label} must be a non-empty command name or absolute path.`);
  }
  assertNoUnsafeControl(requested, label);

  if (requested.includes("/")) {
    if (!isAbsolute(requested)) {
      throw new BridgeError(
        `${label} must be an absolute path when it contains a slash.`,
      );
    }
    const candidate = executableRealpath(requested);
    assertOutsideBoundary(candidate, options.rejectInside, label);
    return candidate;
  }

  for (const entry of (process.env.PATH || "").split(delimiter)) {
    // Empty and relative PATH entries make the current checkout executable. Ignore them.
    if (!entry || !isAbsolute(entry)) continue;
    try {
      const candidate = executableRealpath(resolve(entry, requested));
      assertOutsideBoundary(candidate, options.rejectInside, label);
      return candidate;
    } catch {
      // Try the next absolute PATH entry.
    }
  }

  throw new BridgeError(
    `Could not find '${requested}' on an absolute PATH entry.`,
    { exitCode: 127 },
  );
}

export function workspaceBoundary(cwd = process.cwd()) {
  return workspaceBoundaries(cwd).at(-1);
}

export function workspaceBoundaries(cwd = process.cwd()) {
  let current = canonicalDirectory(cwd);
  const startingDirectory = current;
  const boundaries = [startingDirectory];
  while (true) {
    if (existsSync(resolve(current, ".git")) && !boundaries.includes(current)) {
      boundaries.push(current);
    }
    const parent = resolve(current, "..");
    if (parent === current) break;
    current = parent;
  }
  const linkedRoot = linkedCommonWorktreeRoot(startingDirectory);
  if (linkedRoot && !boundaries.includes(linkedRoot)) boundaries.push(linkedRoot);
  return boundaries;
}

export function safePathForWorkspace(cwd = process.cwd()) {
  const boundaries = workspaceBoundaries(cwd);
  const safeEntries = [];
  for (const entry of (process.env.PATH || "").split(delimiter)) {
    if (!entry || !isAbsolute(entry)) continue;
    try {
      const canonical = realpathSync(entry);
      if (!statSync(canonical).isDirectory()) continue;
      if (boundaries.some((boundary) => isPathInside(boundary, canonical))) continue;
      const redirectsIntoWorkspace = readdirSync(canonical).some((name) => {
        try {
          const target = realpathSync(resolve(canonical, name));
          return boundaries.some((boundary) => isPathInside(boundary, target));
        } catch {
          return false;
        }
      });
      if (redirectsIntoWorkspace) continue;
      if (!safeEntries.includes(canonical)) safeEntries.push(canonical);
    } catch {
      // Ignore missing, inaccessible, or otherwise untrusted PATH entries.
    }
  }
  return safeEntries.join(delimiter);
}

function assertOutsideBoundary(candidate, boundary, label) {
  const boundaries = Array.isArray(boundary) ? boundary : boundary ? [boundary] : [];
  if (boundaries.some((entry) => isPathInside(entry, candidate))) {
    throw new BridgeError(
      `${label} resolves inside the current repository/workspace and is not trusted: ${candidate}`,
    );
  }
}

function linkedCommonWorktreeRoot(startingDirectory) {
  let current = startingDirectory;
  while (true) {
    const marker = resolve(current, ".git");
    try {
      if (existsSync(marker) && statSync(marker).isFile()) {
        if (statSync(marker).size > 4_096) return undefined;
        const gitdirValue = readFileSync(marker, "utf8").match(/^gitdir:\s*(.+)\s*$/mu)?.[1];
        if (!gitdirValue) return undefined;
        const gitDirectory = realpathSync(resolve(current, gitdirValue));
        const commonMarker = resolve(gitDirectory, "commondir");
        if (!existsSync(commonMarker) || statSync(commonMarker).size > 4_096) return undefined;
        const commonValue = readFileSync(commonMarker, "utf8").trim();
        const commonDirectory = realpathSync(resolve(gitDirectory, commonValue));
        if (commonValue && commonDirectory.endsWith(`${sep}.git`)) {
          return realpathSync(resolve(commonDirectory, ".."));
        }
        return undefined;
      }
    } catch {
      return undefined;
    }
    const parent = resolve(current, "..");
    if (parent === current) return undefined;
    current = parent;
  }
}

function executableRealpath(candidate) {
  const canonical = realpathSync(candidate);
  accessSync(canonical, fsConstants.X_OK);
  if (!statSync(canonical).isFile()) {
    throw new Error("not a regular file");
  }
  return canonical;
}

export function assertNoUnsafeControl(value, label = "value") {
  if (typeof value !== "string" || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)) {
    throw new BridgeError(`${label} contains an unsafe control character.`);
  }
}

export function parseBoundedInteger(value, label, { min = 1, max }) {
  if (value === undefined) return undefined;
  if (!/^[0-9]+$/u.test(String(value))) {
    throw new BridgeError(`${label} must be a whole number.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || (max !== undefined && parsed > max)) {
    const range = max === undefined ? `at least ${min}` : `between ${min} and ${max}`;
    throw new BridgeError(`${label} must be ${range}.`);
  }
  return parsed;
}

export function parseMoney(value, label = "--max-budget-usd") {
  if (value === undefined) return undefined;
  if (!/^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/u.test(String(value))) {
    throw new BridgeError(`${label} must be a finite positive number.`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1000) {
    throw new BridgeError(`${label} must be greater than 0 and at most 1000.`);
  }
  return String(value);
}

export function validateModel(value, label = "--model") {
  if (value === undefined) return undefined;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)) {
    throw new BridgeError(`${label} must contain Claude model aliases or full model identifiers.`);
  }
  return value;
}

export function validateFallbackModels(value) {
  if (value === undefined) return undefined;
  const models = value.split(",");
  if (models.length === 0 || models.some((model) => model.length === 0)) {
    throw new BridgeError("--fallback-model must be a comma-separated list of Claude model identifiers.");
  }
  for (const model of models) validateModel(model, "--fallback-model");
  return models.join(",");
}

export function validateEffort(value) {
  if (value === undefined) return undefined;
  const allowed = new Set(["low", "medium", "high", "xhigh", "max", "ultracode"]);
  if (!allowed.has(value)) {
    throw new BridgeError("--effort must be one of: low, medium, high, xhigh, max, ultracode.");
  }
  return value;
}

export function validateJobId(value) {
  if (!/^[0-9a-f]{8}$/u.test(value || "")) {
    throw new BridgeError("Claude background job IDs must be exactly 8 lowercase hexadecimal characters.");
  }
  return value;
}

export function validateResumeId(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value || "")) {
    throw new BridgeError("Claude resume IDs must be canonical UUIDs. Use the sessionId shown by status.");
  }
  return value.toLowerCase();
}

export async function readPrompt({
  prompt,
  promptFile,
  positionals = [],
  cwd,
  stdin = process.stdin,
  timeoutMs = 900_000,
}) {
  const supplied = [prompt !== undefined, promptFile !== undefined, positionals.length > 0].filter(Boolean).length;
  if (supplied > 1) {
    throw new BridgeError("Provide a prompt in only one way: --prompt, --prompt-file, positional text, or stdin.");
  }

  let value;
  if (prompt !== undefined) {
    value = prompt;
  } else if (promptFile !== undefined) {
    assertNoUnsafeControl(promptFile, "prompt file");
    const root = canonicalDirectory(cwd);
    let file;
    try {
      file = realpathSync(resolve(root, promptFile));
    } catch {
      throw new BridgeError(`Prompt file does not exist: ${promptFile}`);
    }
    if (!isPathInside(root, file) || !statSync(file).isFile()) {
      throw new BridgeError("--prompt-file must resolve to a regular file inside --cwd.");
    }
    value = readFileLimited(file, DEFAULT_PROMPT_LIMIT, "Prompt file");
  } else if (positionals.length > 0) {
    value = positionals.join(" ");
  } else if (!stdin.isTTY) {
    value = await readStreamLimited(stdin, DEFAULT_PROMPT_LIMIT, "Prompt from stdin", timeoutMs);
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BridgeError("A non-empty prompt is required. Pass --prompt, --prompt-file, positional text, or stdin.");
  }
  assertNoUnsafeControl(value, "prompt");
  if (Buffer.byteLength(value, "utf8") > DEFAULT_PROMPT_LIMIT) {
    throw new BridgeError(`Prompt exceeds the ${DEFAULT_PROMPT_LIMIT}-byte safety limit.`);
  }
  return value;
}

export async function readOptionalStdin(stdin = process.stdin, timeoutMs = 1_800_000) {
  if (stdin.isTTY) return undefined;
  return await readStreamLimited(stdin, DEFAULT_PROMPT_LIMIT, "Native stdin", timeoutMs);
}

function readFileLimited(path, maxBytes, label) {
  const fd = openSync(path, "r");
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new BridgeError(`${label} must be a regular file.`);
    if (stat.size > maxBytes) {
      throw new BridgeError(`${label} exceeds the ${maxBytes}-byte safety limit.`);
    }
    return readFdLimited(fd, maxBytes, label);
  } finally {
    closeSync(fd);
  }
}

function readFdLimited(fd, maxBytes, label) {
  const chunks = [];
  let total = 0;
  const buffer = Buffer.allocUnsafe(64 * 1024);
  while (true) {
    const bytesRead = readSync(fd, buffer, 0, buffer.length, null);
    if (bytesRead === 0) break;
    total += bytesRead;
    if (total > maxBytes) {
      throw new BridgeError(`${label} exceeds the ${maxBytes}-byte safety limit.`);
    }
    chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
  }
  return Buffer.concat(chunks, total).toString("utf8");
}

async function readStreamLimited(stream, maxBytes, label, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new BridgeError(`${label} timed out before input was available.`, { exitCode: 124 });
  }
  if (stream.readableEnded || stream.destroyed) return "";

  return await new Promise((resolvePromise, rejectPromise) => {
    const chunks = [];
    let total = 0;
    let settled = false;
    const timer = setTimeout(() => {
      finish(
        new BridgeError(`${label} timed out before end-of-input.`, { exitCode: 124 }),
      );
    }, Math.ceil(timeoutMs));

    const cleanup = () => {
      clearTimeout(timer);
      stream.off("data", onData);
      stream.off("end", onEnd);
      stream.off("error", onError);
    };
    const finish = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) {
        stream.pause?.();
        stream.destroy?.();
        rejectPromise(error);
      } else {
        resolvePromise(Buffer.concat(chunks, total).toString("utf8"));
      }
    };
    const onData = (chunk) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += bytes.length;
      if (total > maxBytes) {
        finish(new BridgeError(`${label} exceeds the ${maxBytes}-byte safety limit.`));
        return;
      }
      chunks.push(Buffer.from(bytes));
    };
    const onEnd = () => finish();
    const onError = (error) => finish(error);

    stream.on("data", onData);
    stream.once("end", onEnd);
    stream.once("error", onError);
    stream.resume?.();
  });
}

export function isPathInside(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

export function sanitizeTerminalText(value) {
  return String(value ?? "")
    .replace(/\r\n?/gu, "\n")
    // OSC sequences, including hyperlinks and title changes.
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/gu, "")
    // CSI and two-byte escape sequences.
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/gu, "")
    .replace(/\u001B[@-_]/gu, "")
    // Unicode line/paragraph separators can forge additional terminal records.
    .replace(/[\u2028\u2029]/gu, "\n")
    // Directional controls can visually reorder trusted labels and untrusted values.
    .replace(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu, "");
}

export async function runProcess(command, args, options = {}) {
  const {
    cwd = process.cwd(),
    input,
    timeoutMs = 120_000,
    maxOutputBytes = DEFAULT_OUTPUT_LIMIT,
    allowNonZero = false,
    detached = process.platform !== "win32",
    env: environmentOverrides = {},
    sanitizeOutput = true,
  } = options;

  for (const [index, arg] of args.entries()) {
    if (typeof arg !== "string") {
      throw new BridgeError(`Process argument ${index} is not a string.`);
    }
    assertNoUnsafeControl(arg, `process argument ${index}`);
  }

  return await new Promise((resolvePromise, rejectPromise) => {
    const startedAt = Date.now();
    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let exceededOutput = false;
    let settled = false;
    let escalationTimer;
    let stdinError;
    let interruptedBy;

    const childEnvironment = {
      ...process.env,
      ...environmentOverrides,
      NO_COLOR: "1",
      TERM: "dumb",
    };
    for (const [key, value] of Object.entries(childEnvironment)) {
      if (value === undefined) delete childEnvironment[key];
    }

    let child;

    const terminate = (reason, signal = "SIGTERM") => {
      if (reason === "timeout") timedOut = true;
      if (reason === "output") exceededOutput = true;
      killProcessGroup(child, signal);
      if (!escalationTimer) {
        escalationTimer = setTimeout(() => killProcessGroup(child, "SIGKILL"), 1_000);
      }
    };

    const timeoutTimer = setTimeout(() => terminate("timeout"), timeoutMs);
    timeoutTimer.unref?.();

    const forwardSignal = (signal) => {
      if (interruptedBy) {
        killProcessGroup(child, "SIGKILL");
        return;
      }
      interruptedBy = signal;
      terminate("signal", signal);
    };
    const onSigint = () => forwardSignal("SIGINT");
    const onSigterm = () => forwardSignal("SIGTERM");
    process.on("SIGINT", onSigint);
    process.on("SIGTERM", onSigterm);

    // Install signal forwarding before spawning: a fast child can publish its
    // readiness before spawn returns, letting cancellation hit an unhandled
    // SIGTERM window on a busy host.
    try {
      child = spawn(command, args, {
        cwd,
        detached,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        env: childEnvironment,
      });
    } catch (error) {
      finishWithError(error);
      return;
    }

    const collect = (chunks, chunk, stream) => {
      const bytes = Buffer.byteLength(chunk);
      if (stream === "stdout") stdoutBytes += bytes;
      else stderrBytes += bytes;
      if (stdoutBytes + stderrBytes <= maxOutputBytes) {
        chunks.push(Buffer.from(chunk));
      } else if (!exceededOutput) {
        terminate("output");
      }
    };

    child.stdout.on("data", (chunk) => collect(stdoutChunks, chunk, "stdout"));
    child.stderr.on("data", (chunk) => collect(stderrChunks, chunk, "stderr"));
    child.stdin.on("error", (error) => {
      stdinError = error;
    });

    child.once("error", (error) => finishWithError(error));
    child.once("close", (code, signal) => {
      const rawStdout = Buffer.concat(stdoutChunks);
      const rawStderr = Buffer.concat(stderrChunks);
      const result = {
        code,
        signal,
        stdout: sanitizeOutput
          ? sanitizeTerminalText(rawStdout.toString("utf8"))
          : rawStdout.toString("utf8"),
        stderr: sanitizeOutput
          ? sanitizeTerminalText(rawStderr.toString("utf8"))
          : rawStderr.toString("utf8"),
        ...(sanitizeOutput ? {} : { stdoutBuffer: rawStdout, stderrBuffer: rawStderr }),
        durationMs: Date.now() - startedAt,
      };

      if (interruptedBy) {
        finishWithError(
          new ProcessError(`Command interrupted by ${interruptedBy}.`, result, {
            exitCode: interruptedBy === "SIGINT" ? 130 : 143,
          }),
        );
      } else if (timedOut) {
        finishWithError(
          new ProcessError(`Command timed out after ${Math.ceil(timeoutMs / 1000)} seconds.`, result, {
            exitCode: 124,
          }),
        );
      } else if (exceededOutput) {
        finishWithError(new ProcessError(`Command exceeded the ${maxOutputBytes}-byte output limit.`, result));
      } else if (stdinError && input !== undefined) {
        finishWithError(new ProcessError("Command exited before all input could be delivered; output was withheld.", result));
      } else if (code !== 0 && !allowNonZero) {
        finishWithError(
          new ProcessError(
            `Command failed with exit code ${code ?? "unknown"}; stdout and stderr were withheld.`,
            result,
          ),
        );
      } else {
        finish(result);
      }
    });

    if (input === undefined) {
      child.stdin.end();
    } else {
      child.stdin.end(input, Buffer.isBuffer(input) ? undefined : "utf8");
    }

    function cleanup() {
      clearTimeout(timeoutTimer);
      // Keep a scheduled escalation alive after the direct child closes. A
      // grandchild can ignore SIGTERM while remaining in the detached process
      // group even though the group leader has already exited.
      process.removeListener("SIGINT", onSigint);
      process.removeListener("SIGTERM", onSigterm);
    }

    function finish(result) {
      if (settled) return;
      settled = true;
      cleanup();
      resolvePromise(result);
    }

    function finishWithError(error) {
      if (settled) return;
      settled = true;
      cleanup();
      if (error?.code === "ENOENT") {
        rejectPromise(new BridgeError(`Executable not found: ${command}`, { exitCode: 127 }));
      } else {
        rejectPromise(error);
      }
    }
  });
}

export async function runInteractive(command, args, options = {}) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stderr.isTTY) {
    throw new BridgeError("This command needs a real terminal. Run it from the Codex terminal with TTY enabled.");
  }
  return await new Promise((resolvePromise, rejectPromise) => {
    const childEnvironment = { ...process.env, ...(options.env || {}) };
    for (const [key, value] of Object.entries(childEnvironment)) {
      if (value === undefined) delete childEnvironment[key];
    }
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      shell: false,
      stdio: "inherit",
      env: childEnvironment,
    });
    child.once("error", rejectPromise);
    child.once("close", (code, signal) => {
      if (code === 0) resolvePromise({ code, signal });
      else rejectPromise(new ProcessError(`Interactive Claude command exited with ${code ?? signal}.`, { code, signal }));
    });
  });
}

function killProcessGroup(child, signal) {
  if (!child.pid) return;
  try {
    if (process.platform !== "win32" && child.spawnargs && child.pid) {
      process.kill(-child.pid, signal);
    } else {
      child.kill(signal);
    }
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

export function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new BridgeError(`${label} returned invalid JSON. Raw output was withheld because it may contain private data.`);
  }
}
