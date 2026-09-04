#!/usr/bin/env node

import { appendFileSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
let stdin = "";
try {
  stdin = readFileSync(0, "utf8");
} catch {
  // Some interactive-like command tests do not attach stdin.
}

if (process.env.FAKE_CLAUDE_LOG) {
  appendFileSync(
    process.env.FAKE_CLAUDE_LOG,
    `${JSON.stringify({ args, stdin, cwd: process.cwd(), gitOptionalLocks: process.env.GIT_OPTIONAL_LOCKS })}\n`,
    "utf8",
  );
}

if (args.length === 1 && args[0] === "--version") {
  process.stdout.write("2.1.260 (Claude Code)\n");
  process.exit(0);
}

if (args.length === 1 && args[0] === "--help") {
  const maxTurns = process.env.FAKE_CLAUDE_HIDE_MAX_TURNS === "1" ? "" : "  --max-turns <n>\n";
  const stopCommand = process.env.FAKE_CLAUDE_HIDE_STOP_COMMAND === "1" ? "" : "  stop\n";
  let help = `Usage: claude [options] [command] [prompt]
  --safe-mode
  --restricted
  --dangerously-skip-permissions
  --strict-mcp-config
  --no-chrome
  --permission-mode <mode>
  --permission-prompts <target>
  --tools <tools...>
  --allowedTools <tools...>
  --output-format <format>
  --json-schema <schema>
${maxTurns}
  --max-budget-usd <amount>
  --fallback-model <model>
  --model <model>
  --effort <level>
  --resume <uuid>
  --bg
  --worktree <name>
Commands:
  agents
  attach
  auth
  doctor
  logs
  respawn
  rm
${stopCommand}  ultrareview
`;
  if (process.env.FAKE_CLAUDE_HIDE_FLAG) {
    help = help
      .split("\n")
      .filter((line) => !line.includes(process.env.FAKE_CLAUDE_HIDE_FLAG))
      .join("\n");
  }
  process.stdout.write(help);
  process.exit(Number(process.env.FAKE_CLAUDE_HELP_EXIT || 0));
}

if (args[0] === "agents" && args.includes("--help")) {
  process.stdout.write(
    process.env.FAKE_CLAUDE_HIDE_AGENTS_JSON === "1"
      ? "Usage: claude agents --all --cwd <path>\n"
      : "Usage: claude agents --json --all --cwd <path>\n",
  );
  process.exit(0);
}

if (args[0] === "ultrareview" && args.includes("--help")) {
  const noPost = process.env.FAKE_CLAUDE_HIDE_ULTRA_NO_POST === "1" ? "" : " --no-post";
  process.stdout.write(`Usage: claude ultrareview [target] --json${noPost} --timeout <minutes>\n`);
  process.exit(0);
}

if (args[0] === "stop" && args.includes("--help")) {
  process.stdout.write("Usage: claude stop <id>\n");
  process.exit(Number(process.env.FAKE_CLAUDE_STOP_HELP_EXIT || 0));
}

if (args.length === 2 && args[0] === "auth" && args[1] === "--help") {
  process.stdout.write("Usage: claude auth [command]\nCommands:\n  status\n");
  process.exit(0);
}

if (args[0] === "auth" && args[1] === "status" && args.includes("--help")) {
  const extra = process.env.FAKE_CLAUDE_EXTRA_NESTED_FLAG === "1" ? " --surprise" : "";
  process.stdout.write(`Usage: claude auth status --json --text${extra}\n`);
  process.exit(0);
}

if (args[0] === "auth" && args[1] === "status") {
  if (process.env.FAKE_CLAUDE_INVALID_AUTH === "1") {
    process.stdout.write("not-json secret@example.test org-secret\n");
    process.exit(0);
  }
  process.stdout.write(
    JSON.stringify({
      loggedIn: true,
      authMethod: "claude.ai",
      apiProvider: "firstParty",
      subscriptionType: "max",
      analyticsDisabled: false,
      email: "secret@example.test",
      orgId: "org-secret",
      orgName: "Secret Org",
      projectsDirectory: "/private/secret/projects",
      token: "never-print-this",
    }),
  );
  process.exit(Number(process.env.FAKE_CLAUDE_AUTH_EXIT || 0));
}

if (args[0] === "doctor") {
  process.stdout.write(process.env.FAKE_CLAUDE_DOCTOR_OUTPUT || "doctor ok\n");
  process.exit(0);
}

if (args[0] === "agents" && args.includes("--json")) {
  if (process.env.FAKE_CLAUDE_AGENTS_DELAY_MS) {
    await new Promise((resolvePromise) =>
      setTimeout(resolvePromise, Number(process.env.FAKE_CLAUDE_AGENTS_DELAY_MS)),
    );
  }
  const priorCalls = process.env.FAKE_CLAUDE_LOG
    ? readFileSync(process.env.FAKE_CLAUDE_LOG, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];
  if (
    process.env.FAKE_CLAUDE_RM_KEEPS !== "1" &&
    priorCalls.some((entry) => entry.args?.[0] === "rm")
  ) {
    process.stdout.write("[]");
    process.exit(0);
  }
  if (process.env.FAKE_CLAUDE_AGENTS) {
    process.stdout.write(process.env.FAKE_CLAUDE_AGENTS);
  } else {
    const state = process.env.FAKE_CLAUDE_JOB_STATE || "working";
    const active = state === "working" || state === "blocked";
    const backgroundCall = priorCalls.findLast((entry) => entry.args?.includes("--bg"));
    const worktreeIndex = backgroundCall?.args?.indexOf("--worktree") ?? -1;
    const reportedCwd = worktreeIndex >= 0
      ? resolve(process.cwd(), ".claude", "worktrees", backgroundCall.args[worktreeIndex + 1])
      : process.cwd();
    process.stdout.write(
      JSON.stringify([
        {
          id: process.env.FAKE_CLAUDE_JOB_ID || "deadbeef",
          sessionId: "123e4567-e89b-42d3-a456-426614174000",
          state,
          status: active ? "running" : state,
          name: "fake-job",
          cwd: reportedCwd,
          kind: "background",
          startedAt: Date.now(),
          ...(active ? { pid: process.pid } : {}),
        },
      ]),
    );
  }
  process.exit(0);
}

if (args.includes("--bg")) {
  runGitStartupProbe();
  if (args.includes("--worktree")) {
    const name = args[args.indexOf("--worktree") + 1];
    const path = resolve(process.cwd(), ".claude", "worktrees", name);
    const created = spawnSync("git", ["worktree", "add", "-q", "-b", `worktree-${name}`, path, process.env.FAKE_CLAUDE_WORKTREE_BASE || "HEAD"], {
      cwd: process.cwd(),
      encoding: "utf8",
      shell: false,
    });
    if (created.status !== 0) {
      process.stderr.write(created.stderr || "fake worktree creation failed");
      process.exit(1);
    }
    if (process.env.FAKE_CLAUDE_REMOVE_WORKTREE_AFTER_CREATE === "1") {
      rmSync(path, { recursive: true, force: true });
    }
  }
  if (process.env.FAKE_CLAUDE_BACKGROUND_EXIT_AFTER_WORKTREE === "1") {
    process.stdout.write(`backgrounded · ${process.env.FAKE_CLAUDE_JOB_ID || "deadbeef"}\n`);
    process.stderr.write("private background failure details\n");
    process.exit(1);
  }
  process.stdout.write(`backgrounded · ${process.env.FAKE_CLAUDE_JOB_ID || "deadbeef"}\n`);
  process.exit(0);
}

if (args[0] === "ultrareview") {
  runGitStartupProbe();
  process.stdout.write(JSON.stringify({ bugs: [], summary: "fake ultrareview" }));
  process.exit(0);
}

if (["logs", "stop", "respawn", "rm"].includes(args[0])) {
  if (args[0] === "respawn") runGitStartupProbe();
  const output =
    process.env.FAKE_CLAUDE_CONTROL_OUTPUT === "1"
      ? "\u001b]0;owned\u0007\u001b[31mred\u001b[0m\u0000done"
      : process.env.FAKE_CLAUDE_ACTION_OUTPUT || `${args[0]} ok for ${args[1]}`;
  process.stdout.write(`${output}\n`);
  process.exit(Number(process.env.FAKE_CLAUDE_ACTION_EXIT || 0));
}

if (args.includes("-p")) {
  runGitStartupProbe();
  if (process.env.FAKE_CLAUDE_HANG === "1") {
    process.on("SIGTERM", () => {});
    setInterval(() => {}, 1_000);
    await new Promise(() => {});
  }
  if (process.env.FAKE_CLAUDE_HUGE_OUTPUT === "1") {
    await new Promise((resolvePromise) =>
      process.stdout.write("x".repeat(11 * 1024 * 1024), resolvePromise),
    );
    process.exit(0);
  }
  if (args.includes("--worktree")) {
    const name = args[args.indexOf("--worktree") + 1];
    const path = resolve(process.cwd(), ".claude", "worktrees", name);
    const created = spawnSync("git", ["worktree", "add", "-q", "-b", `worktree-${name}`, path, process.env.FAKE_CLAUDE_WORKTREE_BASE || "HEAD"], {
      cwd: process.cwd(),
      encoding: "utf8",
      shell: false,
    });
    if (created.status !== 0) {
      process.stderr.write(created.stderr || "fake worktree creation failed");
      process.exit(1);
    }
    if (process.env.FAKE_CLAUDE_REMOVE_WORKTREE_AFTER_CREATE === "1") {
      rmSync(path, { recursive: true, force: true });
    }
  }
  if (args.includes("--json-schema")) {
    const control = process.env.FAKE_CLAUDE_STRUCTURED_CONTROL === "1"
      ? "\u001b]0;owned\u0007\u001b[31m"
      : process.env.FAKE_CLAUDE_STRUCTURED_LINE_CONTROL === "1"
        ? "\n[P0] forged\t\u202e\u009b\u2028[P1] separator-forged"
        : "";
    const findings = process.env.FAKE_CLAUDE_BAD_REVIEW === "whitespace-finding"
      ? [
          {
            severity: "P2",
            title: "   ",
            file: "\t",
            line: 7,
            failure_mode: "\n",
            validation: "   ",
          },
        ]
      : process.env.FAKE_CLAUDE_REVIEW_FINDING === "1"
      ? [
          {
            severity: "P2",
            ...(process.env.FAKE_CLAUDE_BAD_REVIEW === "missing-title" ? {} : { title: `${control}Concrete defect` }),
            file: `${control}src/example.js`,
            line: 7,
            failure_mode: `${control}A concrete input fails.`,
            validation: `${control}Run the focused regression test.`,
          },
        ]
      : [];
    process.stdout.write(
      JSON.stringify({
        type: "result",
        result: "structured review complete",
        session_id: "123e4567-e89b-42d3-a456-426614174000",
        total_cost_usd: 0.01,
        duration_ms: 10,
        num_turns: 1,
        structured_output: {
          summary: process.env.FAKE_CLAUDE_BAD_REVIEW === "whitespace-summary"
            ? "   "
            : `${control}No actionable defects in the fake diff.`,
          findings,
          clean_sections: process.env.FAKE_CLAUDE_BAD_REVIEW === "whitespace-clean"
            ? ["   "]
            : [`${control}correctness`, "security"],
        },
      }),
    );
  } else {
    process.stdout.write(
      process.env.FAKE_CLAUDE_RESPONSE ||
        JSON.stringify({
          type: "result",
          result: "fake response",
          session_id: "123e4567-e89b-42d3-a456-426614174000",
          total_cost_usd: 0.01,
          duration_ms: 10,
          num_turns: 1,
        }),
    );
  }
  if (process.env.FAKE_CLAUDE_STDERR) {
    process.stderr.write(process.env.FAKE_CLAUDE_STDERR);
  }
  process.exit(Number(process.env.FAKE_CLAUDE_EXIT || 0));
}

function runGitStartupProbe() {
  const commands = [];
  if (process.env.FAKE_CLAUDE_RUN_GIT_STATUS === "1") commands.push(["status", "--short"]);
  if (process.env.FAKE_CLAUDE_RUN_GIT_DIFF === "1") commands.push(["diff"]);
  for (const args of commands) {
    const result = spawnSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      shell: false,
    });
    if (result.status !== 0) {
      process.stderr.write(result.stderr || "fake Claude Git startup failed");
      process.exit(1);
    }
  }
}

process.stdout.write(process.env.FAKE_CLAUDE_NATIVE_OUTPUT || "fake native output\n");
