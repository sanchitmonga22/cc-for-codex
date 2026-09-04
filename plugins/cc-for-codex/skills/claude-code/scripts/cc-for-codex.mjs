#!/usr/bin/env node

import { parseArgs } from "node:util";
import {
  ask,
  delegate,
  doctor,
  handoff,
  listAgents,
  nativeClaude,
  renderAgents,
  renderDoctor,
  renderReview,
  reviewGate,
  resume,
  review,
  sessionAction,
  stopReviewGate,
  ultrareview,
} from "./lib/bridge.mjs";
import {
  BRIDGE_VERSION,
  BridgeError,
  parseBoundedInteger,
  readOptionalStdin,
  readPrompt,
  sanitizeTerminalText,
} from "./lib/runtime.mjs";

const HELP = `CC for Codex ${BRIDGE_VERSION}

Safely orchestrate a user-installed Claude Code CLI from Codex.

Usage:
  cc-for-codex <command> [options]

Core commands:
  setup, doctor                 Check binary, version, auth, and capabilities
  review-gate                   Status/enable/disable the opt-in Stop review hook
  ask                           Ask Claude for a read-only second opinion
  review                        Review the current diff with a strict schema
  adversarial-review            Challenge the approach as well as the code
  ultrareview                   Run Claude's costly cloud review (explicit opt-in)
  delegate, rescue              Delegate read-only or isolated write work
  handoff, transfer             Start a fresh Claude session from a Codex brief
  resume                        Continue a persisted Claude session by UUID

Background lifecycle:
  status, agents                List repo-scoped Claude background sessions
  logs <id>                     Show recent session output
  result <id>                   Best-effort result via recent logs
  stop, cancel <id>             Stop a session (recoverable)
  respawn <id>                  Restart a stopped session
  remove <id>                   Remove a stopped session/worktree
  attach <id>                   Attach from a real TTY

Advanced:
  native [guards] -- <args...>  Exact Claude CLI escape hatch
  help                          Show this help

Prompts may be provided with --prompt, --prompt-file, positional text, or stdin.
Run '<command> --help' for command-specific examples in the project README.`;

const promptOptions = {
  prompt: { type: "string" },
  "prompt-file": { type: "string" },
  cwd: { type: "string" },
  "claude-bin": { type: "string" },
  model: { type: "string" },
  effort: { type: "string" },
  "max-turns": { type: "string" },
  "max-budget-usd": { type: "string" },
  "fallback-model": { type: "string" },
  "timeout-seconds": { type: "string" },
  profile: { type: "string" },
  "confirm-native-profile": { type: "string" },
  persist: { type: "boolean" },
  json: { type: "boolean" },
  help: { type: "boolean", short: "h" },
};

async function main(argv = process.argv.slice(2)) {
  const [rawCommand, ...rest] = argv;
  const command = rawCommand || "help";

  switch (command) {
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(`${HELP}\n`);
      return;
    case "--version":
    case "version":
      process.stdout.write(`${BRIDGE_VERSION}\n`);
      return;
    case "doctor":
    case "setup":
      return await runDoctor(rest);
    case "review-gate":
      return await runReviewGate(rest);
    case "hook-stop-review":
      return await runStopReviewHook(rest);
    case "ask":
      return await runAsk(rest);
    case "resume":
      return await runResume(rest);
    case "review":
      return await runReview(rest, "standard");
    case "adversarial-review":
      return await runReview(rest, "adversarial");
    case "ultrareview":
      return await runUltrareview(rest);
    case "delegate":
    case "rescue":
      return await runDelegate(rest);
    case "handoff":
    case "transfer":
      return await runHandoff(rest);
    case "agents":
    case "status":
      return await runAgents(rest);
    case "logs":
    case "result":
    case "stop":
    case "cancel":
    case "respawn":
    case "remove":
    case "rm":
    case "attach":
      return await runSessionCommand(command, rest);
    case "native":
      return await runNative(rest);
    default:
      throw new BridgeError(`Unknown command '${command}'. Run 'cc-for-codex help'.`);
  }
}

async function runDoctor(args) {
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      cwd: { type: "string" },
      "claude-bin": { type: "string" },
      full: { type: "boolean" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) return printCommandHelp("doctor [--full] [--json]\n  Runs only local, non-model diagnostics and redacts auth identity fields.");
  const report = await doctor({
    cwd: values.cwd,
    claudeBin: values["claude-bin"],
    full: values.full,
  });
  printResult(report, values.json, renderDoctor);
  if (!report.ready) process.exitCode = 3;
}

async function runReviewGate(args) {
  const { values, positionals } = parseArgs({
    args,
    strict: true,
    allowPositionals: true,
    options: {
      cwd: { type: "string" },
      "confirm-review-gate": { type: "string" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    return printCommandHelp(
      "review-gate <status|enable|disable> [--json]\n  Opt-in Stop hook. Enable requires --confirm-review-gate enable-billed-stop-review.",
    );
  }
  if (positionals.length > 1) {
    throw new BridgeError("review-gate accepts exactly one action: status, enable, or disable.");
  }
  const action = positionals[0] || "status";
  const result = await reviewGate(action, {
    cwd: values.cwd,
    confirm: values["confirm-review-gate"],
  });
  printResult(result, values.json, (value) => [
    `Claude stop review gate: ${value.enabled ? "enabled" : "disabled"}`,
    `Repository: ${terminalLine(value.root)}`,
    ...(value.note ? [terminalLine(value.note)] : []),
  ].join("\n"));
}

async function runStopReviewHook(args) {
  if (args.length) throw new BridgeError("hook-stop-review does not accept command-line arguments.");
  // Leave a 30-second margin under the plugin hook's 600-second host timeout so
  // process-tree termination and fail-open output can complete deterministically.
  const deadlineAt = Date.now() + 570_000;
  const raw = await readOptionalStdin(process.stdin, Math.min(5_000, remainingInputTime(deadlineAt)));
  let input = {};
  if (Buffer.byteLength(raw || "", "utf8") > 1024 * 1024) {
    throw new BridgeError("Stop hook input exceeds the 1 MiB limit.");
  }
  if (raw?.trim()) {
    try {
      input = JSON.parse(raw);
    } catch {
      input = { invalid_hook_input: true };
    }
  }
  const result = input.invalid_hook_input
    ? {
        continue: true,
        systemMessage: "CC for Codex review gate failed open: Stop hook input was invalid JSON.",
        suppressOutput: false,
      }
    : await stopReviewGate(input, { deadlineAt });
  if (!(result.continue === true && result.suppressOutput === true && !result.systemMessage)) {
    process.stdout.write(`${serializeJson(result)}\n`);
  }
}

async function runAsk(args) {
  const { values, positionals } = parseArgs({
    args,
    strict: true,
    allowPositionals: true,
    options: {
      ...promptOptions,
      resume: { type: "string" },
      "confirm-concurrent-resume": { type: "string" },
      "text-only": { type: "boolean" },
    },
  });
  if (values.help) return printCommandHelp("ask [options] [prompt]\n  Read-only by default. Add --persist to receive a resumable session UUID.");
  const deadlineAt = commandDeadline(values["timeout-seconds"], 900);
  const prompt = await readPrompt({
    prompt: values.prompt,
    promptFile: values["prompt-file"],
    positionals,
    cwd: values.cwd,
    timeoutMs: remainingInputTime(deadlineAt),
  });
  const result = await ask(commonPromptValues(values, prompt, {
    resumeId: values.resume,
    confirmConcurrentResume: values["confirm-concurrent-resume"],
    textOnly: values["text-only"],
    deadlineAt,
  }));
  printClaudeResponse(result, values.json);
}

async function runResume(args) {
  const { values, positionals } = parseArgs({
    args,
    strict: true,
    allowPositionals: true,
    options: {
      ...promptOptions,
      session: { type: "string" },
      "confirm-concurrent-resume": { type: "string" },
      "text-only": { type: "boolean" },
    },
  });
  if (values.help) return printCommandHelp("resume --session <uuid> [options] [prompt]\n  Reasserts the bridge's read-only profile on a persisted session.");
  if (!values.session) throw new BridgeError("resume requires --session <uuid>.");
  const deadlineAt = commandDeadline(values["timeout-seconds"], 900);
  const prompt = await readPrompt({
    prompt: values.prompt,
    promptFile: values["prompt-file"],
    positionals,
    cwd: values.cwd,
    timeoutMs: remainingInputTime(deadlineAt),
  });
  const result = await resume(commonPromptValues(values, prompt, {
    resumeId: values.session,
    confirmConcurrentResume: values["confirm-concurrent-resume"],
    textOnly: values["text-only"],
    deadlineAt,
  }));
  printClaudeResponse(result, values.json);
}

async function runReview(args, forcedMode) {
  const { values, positionals } = parseArgs({
    args,
    strict: true,
    allowPositionals: true,
    options: {
      cwd: { type: "string" },
      "claude-bin": { type: "string" },
      base: { type: "string" },
      path: { type: "string", multiple: true },
      focus: { type: "string" },
      mode: { type: "string" },
      model: { type: "string" },
      effort: { type: "string" },
      "max-turns": { type: "string" },
      "max-budget-usd": { type: "string" },
      "fallback-model": { type: "string" },
      "timeout-seconds": { type: "string" },
      profile: { type: "string" },
      "confirm-native-profile": { type: "string" },
      persist: { type: "boolean" },
      background: { type: "boolean" },
      wait: { type: "boolean" },
      name: { type: "string" },
      "confirm-background": { type: "string" },
      "confirm-background-data": { type: "string" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    return printCommandHelp(
      "review [--wait|--background] [--base <ref>] [--path <path>] [--focus <text>] [--mode standard|adversarial]\n  Foreground uses a strict findings schema. Background requires usage and process-visible-prompt confirmations.",
    );
  }
  if (values.background && values.wait) {
    throw new BridgeError("review accepts --background or --wait, not both.");
  }
  const positionalFocus = positionals.join(" ").trim();
  if (values.focus && positionalFocus) throw new BridgeError("Provide review focus with --focus or positional text, not both.");
  const deadlineAt = commandDeadline(values["timeout-seconds"], 1_200);
  const result = await review({
    cwd: values.cwd,
    claudeBin: values["claude-bin"],
    base: values.base,
    paths: values.path || [],
    focus: values.focus || positionalFocus || undefined,
    mode: forcedMode === "adversarial" ? "adversarial" : values.mode || "standard",
    model: values.model,
    effort: values.effort,
    maxTurns: values["max-turns"],
    maxBudgetUsd: values["max-budget-usd"],
    fallbackModel: values["fallback-model"],
    timeoutSeconds: values["timeout-seconds"],
    profile: values.profile,
    confirmNativeProfile: values["confirm-native-profile"],
    persist: values.persist,
    background: values.background,
    name: values.name,
    confirmBackground: values["confirm-background"],
    confirmBackgroundData: values["confirm-background-data"],
    deadlineAt,
  });
  printResult(result, values.json || values.background, values.background ? undefined : renderReview);
}

async function runUltrareview(args) {
  const { values, positionals } = parseArgs({
    args,
    strict: true,
    allowPositionals: true,
    options: {
      cwd: { type: "string" },
      "claude-bin": { type: "string" },
      "timeout-minutes": { type: "string" },
      "confirm-cloud-review": { type: "string" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    return printCommandHelp(
      "ultrareview [PR|GitHub-PR-URL|base] --confirm-cloud-review upload-and-billing\n  Uploads review scope to Anthropic, may consume usage credits, and always forces --no-post.",
    );
  }
  if (positionals.length > 1) throw new BridgeError("ultrareview accepts at most one target.");
  const result = await ultrareview({
    cwd: values.cwd,
    claudeBin: values["claude-bin"],
    target: positionals[0],
    timeoutMinutes: values["timeout-minutes"],
    confirmCloudReview: values["confirm-cloud-review"],
  });
  printResult(result, values.json ?? true);
}

async function runDelegate(args) {
  const { values, positionals } = parseArgs({
    args,
    strict: true,
    allowPositionals: true,
    options: {
      ...promptOptions,
      background: { type: "boolean" },
      wait: { type: "boolean" },
      write: { type: "boolean" },
      name: { type: "string" },
      resume: { type: "string" },
      fresh: { type: "boolean" },
      "confirm-concurrent-resume": { type: "string" },
      "confirm-background": { type: "string" },
      "confirm-background-data": { type: "string" },
      "confirm-write": { type: "string" },
      "confirm-worktree-include": { type: "string" },
      "confirm-dangerous-permissions": { type: "string" },
      "write-permissions": { type: "string" },
    },
  });
  if (values.help) {
    return printCommandHelp(
      "delegate [--background|--wait] [--fresh|--resume <uuid>] [--write] [options] [prompt]\n  Read-only by default. --write requires a fresh isolated worktree and defaults to zero-prompt dangerous file permissions.\n  Use --write-permissions guarded (or CC_FOR_CODEX_WRITE_PERMISSIONS=guarded) for restricted pre-approved edits.\n  Background mode requires usage and process-visible-prompt confirmations.",
    );
  }
  if (values.profile !== undefined || values["confirm-native-profile"] !== undefined) {
    throw new BridgeError("delegate has fixed read/write profiles and does not accept --profile or --confirm-native-profile.");
  }
  if (values.background && values.wait) {
    throw new BridgeError("delegate accepts --background or --wait, not both.");
  }
  const deadlineAt = commandDeadline(values["timeout-seconds"], 1_800);
  const prompt = await readPrompt({
    prompt: values.prompt,
    promptFile: values["prompt-file"],
    positionals,
    cwd: values.cwd,
    timeoutMs: remainingInputTime(deadlineAt),
  });
  const result = await delegate(commonPromptValues(values, prompt, {
    background: values.background,
    write: values.write,
    name: values.name,
    resumeId: values.resume,
    fresh: values.fresh,
    confirmConcurrentResume: values["confirm-concurrent-resume"],
    confirmBackground: values["confirm-background"],
    confirmBackgroundData: values["confirm-background-data"],
    confirmWrite: values["confirm-write"],
    confirmWorktreeInclude: values["confirm-worktree-include"],
    confirmDangerousPermissions: values["confirm-dangerous-permissions"],
    writePermissions: values["write-permissions"],
    deadlineAt,
  }));
  if (values.background || values.json) printResult(result, true);
  else printClaudeResponse(result, false);
}

async function runHandoff(args) {
  const { values, positionals } = parseArgs({
    args,
    strict: true,
    allowPositionals: true,
    options: promptOptions,
  });
  if (values.help) {
    return printCommandHelp(
      "handoff [options] [brief]\n  Starts a fresh persisted Claude session from a Codex-authored brief. This is not transcript import.",
    );
  }
  const deadlineAt = commandDeadline(values["timeout-seconds"], 900);
  const prompt = await readPrompt({
    prompt: values.prompt,
    promptFile: values["prompt-file"],
    positionals,
    cwd: values.cwd,
    timeoutMs: remainingInputTime(deadlineAt),
  });
  const result = await handoff(commonPromptValues(values, prompt, { deadlineAt }));
  printClaudeResponse(result, values.json);
}

async function runAgents(args) {
  const { values, positionals } = parseArgs({
    args,
    strict: true,
    allowPositionals: true,
    options: {
      cwd: { type: "string" },
      "claude-bin": { type: "string" },
      all: { type: "boolean" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) return printCommandHelp("status [--all] [job-id]\n  Lists only sessions Claude reports under the canonical working directory.");
  if (positionals.length > 1) throw new BridgeError("status accepts at most one job ID.");
  const agents = await listAgents({
    cwd: values.cwd,
    claudeBin: values["claude-bin"],
    all: values.all,
    id: positionals[0],
  });
  printResult(agents, values.json, renderAgents);
}

async function runSessionCommand(rawCommand, args) {
  const action = rawCommand === "cancel" ? "stop" : rawCommand === "remove" ? "rm" : rawCommand;
  const { values, positionals } = parseArgs({
    args,
    strict: true,
    allowPositionals: true,
    options: {
      cwd: { type: "string" },
      "claude-bin": { type: "string" },
      "confirm-stop": { type: "string" },
      "confirm-respawn": { type: "string" },
      "confirm-remove": { type: "string" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) return printCommandHelp(`${rawCommand} <8-hex-job-id> [confirmation]\n  Resolves the ID against repo-scoped Claude agent state before acting.`);
  if (positionals.length !== 1) throw new BridgeError(`${rawCommand} requires exactly one 8-hex job ID.`);
  const confirm =
    action === "stop"
      ? values["confirm-stop"]
      : action === "respawn"
        ? values["confirm-respawn"]
        : action === "rm"
          ? values["confirm-remove"]
          : undefined;
  const result = await sessionAction(action, {
    cwd: values.cwd,
    claudeBin: values["claude-bin"],
    id: positionals[0],
    confirm,
  });
  if (action !== "attach") {
    printResult(result, values.json, (value) => value.output || JSON.stringify(value, null, 2));
    if (result.warning && !values.json) process.stderr.write(`Note: ${result.warning}\n`);
    if (action === "rm" && result.removed === false) process.exitCode = 4;
  }
}

async function runNative(args) {
  const separator = args.indexOf("--");
  if (separator < 0) {
    throw new BridgeError("native requires a '--' separator before Claude's own arguments.");
  }
  const wrapperArgs = args.slice(0, separator);
  const claudeArgs = args.slice(separator + 1);
  const { values } = parseArgs({
    args: wrapperArgs,
    strict: true,
    allowPositionals: false,
    options: {
      cwd: { type: "string" },
      "claude-bin": { type: "string" },
      tty: { type: "boolean" },
      "timeout-seconds": { type: "string" },
      "confirm-native": { type: "string" },
      "confirm-dangerous-permissions": { type: "string" },
      "confirm-mutation": { type: "string" },
      "confirm-cloud-review": { type: "string" },
    },
  });
  const deadlineAt = commandDeadline(values["timeout-seconds"], 1_800);
  const result = await nativeClaude({
    cwd: values.cwd,
    claudeBin: values["claude-bin"],
    tty: values.tty,
    timeoutSeconds: values["timeout-seconds"],
    confirmNative: values["confirm-native"],
    confirmDangerousPermissions: values["confirm-dangerous-permissions"],
    confirmMutation: values["confirm-mutation"],
    confirmCloudReview: values["confirm-cloud-review"],
    deadlineAt,
    args: claudeArgs,
    input: values.tty
      ? undefined
      : () => readOptionalStdin(process.stdin, remainingInputTime(deadlineAt)),
  });
  if (!values.tty) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
}

function commonPromptValues(values, prompt, extra = {}) {
  return {
    cwd: values.cwd,
    claudeBin: values["claude-bin"],
    prompt,
    model: values.model,
    effort: values.effort,
    maxTurns: values["max-turns"],
    maxBudgetUsd: values["max-budget-usd"],
    fallbackModel: values["fallback-model"],
    timeoutSeconds: values["timeout-seconds"],
    profile: values.profile,
    confirmNativeProfile: values["confirm-native-profile"],
    persist: values.persist,
    ...extra,
  };
}

function printClaudeResponse(result, json) {
  if (json) return printResult(result, true);
  if (result.result) process.stdout.write(`${result.result.trim()}\n`);
  else if (result.structuredOutput) process.stdout.write(`${serializeJson(result.structuredOutput)}\n`);
  else process.stdout.write(`${serializeJson(result)}\n`);
  if (result.sessionId) process.stderr.write(`Claude session: ${terminalLine(result.sessionId)}\n`);
  if (result.worktree) {
    process.stderr.write(`Claude worktree: ${terminalLine(result.worktree.path)}\n`);
    process.stderr.write(`Claude branch: ${terminalLine(result.worktree.branch)}\n`);
    process.stderr.write(`Claude base HEAD: ${terminalLine(result.worktree.head || "unknown")}\n`);
    process.stderr.write(`Write permissions: ${terminalLine(result.writePermissions || "unknown")}\n`);
  }
  if (result.warning) process.stderr.write(`Warning: ${terminalLine(result.warning)}\n`);
}

function terminalLine(value) {
  return sanitizeTerminalText(value)
    .replace(/[\n\t]+/gu, " ")
    .replace(/ {2,}/gu, " ")
    .trim();
}

function printResult(result, json = false, renderer) {
  const output = json || !renderer ? serializeJson(result) : renderer(result);
  process.stdout.write(`${output}\n`);
}

function serializeJson(value) {
  return JSON.stringify(value, null, 2).replace(
    /[\u007F-\u009F\u061C\u200E\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069]/gu,
    (character) => `\\u${character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`,
  );
}

function printCommandHelp(text) {
  process.stdout.write(`${text}\n`);
}

function commandDeadline(value, fallbackSeconds) {
  const seconds = parseBoundedInteger(value ?? String(fallbackSeconds), "--timeout-seconds", {
    min: 1,
    max: 7_200,
  });
  return Date.now() + seconds * 1_000;
}

function remainingInputTime(deadlineAt) {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) {
    throw new BridgeError("Operation timed out before input was available.", { exitCode: 124 });
  }
  return remaining;
}

main().catch((error) => {
  const message = terminalLine(error instanceof Error ? error.message : String(error));
  process.stderr.write(`cc-for-codex: ${message}\n`);
  process.exitCode = error instanceof BridgeError ? error.exitCode : 1;
});
