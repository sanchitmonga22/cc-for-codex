import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  isPathInside,
  runProcess,
} from "../plugins/cc-for-codex/skills/claude-code/scripts/lib/runtime.mjs";
import { renderAgents } from "../plugins/cc-for-codex/skills/claude-code/scripts/lib/bridge.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(root, "plugins/cc-for-codex/skills/claude-code/scripts/cc-for-codex.mjs");
const launcher = resolve(root, "plugins/cc-for-codex/scripts/cc-for-codex");
const skillLauncher = resolve(root, "plugins/cc-for-codex/skills/claude-code/scripts/cc-for-codex");
const fakeClaude = resolve(root, "tests/fixtures/fake-claude.mjs");
const claudeAudit = resolve(root, "scripts/audit-claude-cli.mjs");
const runtimeUrl = new URL(
  "../plugins/cc-for-codex/skills/claude-code/scripts/lib/runtime.mjs",
  import.meta.url,
).href;
chmodSync(fakeClaude, 0o755);

test("plain agent rendering stays bounded for adversarial metadata", () => {
  const agents = Array.from({ length: 1_000 }, (_, index) => ({
    id: `job-${index}`,
    state: "working",
    name: index === 0 ? "n".repeat(100_000) : "short",
    cwd: index === 0 ? `/tmp/${"c".repeat(100_000)}` : "/tmp/repo",
  }));
  const rendered = renderAgents(agents);
  assert.ok(rendered.length < 60_000, `rendered output was ${rendered.length} bytes`);
  assert.match(rendered, /800 additional session\(s\) omitted/u);
  assert.doesNotMatch(rendered, /n{1000}/u);
});

test("recursive Claude CLI audit detects an unmapped nested option", () => {
  const cwd = mkdtempSync(join(tmpdir(), "ccfc-cli-audit-"));
  const normal = spawnSync(process.execPath, [claudeAudit, fakeClaude], {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
  assert.equal(normal.status, 0, normal.stderr || normal.stdout);
  assert.deepEqual(JSON.parse(normal.stdout).unmappedCommandSurfaces, []);

  const drifted = spawnSync(process.execPath, [claudeAudit, fakeClaude], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, FAKE_CLAUDE_EXTRA_NESTED_FLAG: "1" },
  });
  assert.notEqual(drifted.status, 0);
  assert.deepEqual(JSON.parse(drifted.stdout).unmappedCommandSurfaces, [
    { command: "auth status", missing: "--surprise" },
  ]);
  rmSync(cwd, { recursive: true, force: true });
});

test("path containment treats dot-dot-prefixed child names as descendants", () => {
  const parent = join(tmpdir(), "cc-for-codex-parent");
  assert.equal(isPathInside(parent, join(parent, "..config")), true);
  assert.equal(isPathInside(parent, join(parent, "...fixtures", "prompt.txt")), true);
  assert.equal(isPathInside(parent, join(parent, "..", "outside")), false);
});

test("doctor redacts identity and secret auth fields", () => {
  const fixture = makeFixture();
  const result = fixture.run(["doctor", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ready, true);
  assert.equal(report.auth.loggedIn, true);
  assert.equal(report.auth.authMethod, "claude.ai");
  assert.doesNotMatch(result.stdout, /secret@example|org-secret|Secret Org|private\/secret|never-print/u);
  fixture.cleanup();
});

test("default doctor renderer is usable and control-safe", () => {
  const fixture = makeFixture();
  const result = fixture.run(["doctor"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Safe bridge ready: yes/u);
  assert.equal(result.stdout.includes("\u001b"), false);
  fixture.cleanup();
});

test("doctor labels cannot be forged by a newline-bearing executable path", () => {
  const fixture = makeFixture();
  const external = mkdtempSync(join(tmpdir(), "ccfc-doctor-\nSafe bridge ready: yes-"));
  const copiedFake = join(external, "claude");
  writeFileSync(copiedFake, readFileSync(fakeClaude));
  chmodSync(copiedFake, 0o755);
  fixture.env.CC_FOR_CODEX_CLAUDE_BIN = copiedFake;

  const result = fixture.run(["doctor"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal((result.stdout.match(/^Safe bridge ready:/gmu) || []).length, 1);
  assert.equal((result.stdout.match(/^Claude binary:/gmu) || []).length, 1);
  assert.doesNotMatch(result.stdout, /Claude binary:[^\n]*\nSafe bridge ready: yes-/u);
  assert.equal(result.stdout.includes("\t"), false);
  fixture.cleanup();
  rmSync(external, { recursive: true, force: true });
});

test("invalid auth JSON is withheld", () => {
  const fixture = makeFixture({ FAKE_CLAUDE_INVALID_AUTH: "1" });
  const result = fixture.run(["doctor", "--json"]);
  assert.equal(result.status, 3);
  assert.match(result.stdout, /raw output was withheld/u);
  assert.doesNotMatch(result.stdout + result.stderr, /secret@example|org-secret/u);
  fixture.cleanup();
});

test("full doctor reports status without echoing diagnostic secrets", () => {
  const fixture = makeFixture({ FAKE_CLAUDE_DOCTOR_OUTPUT: "token=secret-token /private/settings\n" });
  const result = fixture.run(["doctor", "--full", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).doctor.ok, true);
  assert.doesNotMatch(result.stdout, /secret-token|private\/settings/u);
  fixture.cleanup();
});

test("stop review gate is disabled by default and enablement requires explicit billing consent", () => {
  const fixture = makeFixture();
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, "app.js"), "export const value = 1;\n");
  git(fixture.cwd, ["add", "app.js"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  writeFileSync(join(fixture.cwd, "app.js"), "export const value = 2;\n");

  const disabledHook = fixture.run(
    ["hook-stop-review"],
    { input: JSON.stringify({ hook_event_name: "Stop", cwd: fixture.cwd }) },
  );
  assert.equal(disabledHook.status, 0, disabledHook.stderr);
  assert.equal(disabledHook.stdout, "");
  assert.equal(fixture.calls().some((entry) => entry.args.includes("-p")), false);

  const denied = fixture.run(["review-gate", "enable", "--json"]);
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /enable-billed-stop-review/u);
  const stillDisabled = fixture.run(["review-gate", "status", "--json"]);
  assert.equal(JSON.parse(stillDisabled.stdout).enabled, false);

  const enabled = fixture.run([
    "review-gate",
    "enable",
    "--confirm-review-gate",
    "enable-billed-stop-review",
    "--json",
  ]);
  assert.equal(enabled.status, 0, enabled.stderr);
  assert.equal(JSON.parse(enabled.stdout).enabled, true);
  assert.equal(JSON.parse(fixture.run(["review-gate", "status", "--json"]).stdout).enabled, true);

  const disabled = fixture.run(["review-gate", "disable", "--json"]);
  assert.equal(disabled.status, 0, disabled.stderr);
  assert.equal(JSON.parse(disabled.stdout).enabled, false);
  fixture.cleanup();
});

test("disabled stop review hook is silent outside Git repositories", () => {
  const fixture = makeFixture();
  const result = fixture.run(
    ["hook-stop-review"],
    { input: JSON.stringify({ hook_event_name: "Stop", cwd: fixture.cwd }) },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.equal(fixture.calls().length, 0);
  fixture.cleanup();
});

test("enabled stop review gate blocks on findings, avoids loops, and allows clean reviews", () => {
  const fixture = makeFixture({ FAKE_CLAUDE_REVIEW_FINDING: "1" });
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, "app.js"), "export const value = 1;\n");
  git(fixture.cwd, ["add", "app.js"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  writeFileSync(join(fixture.cwd, "app.js"), "export const value = 2;\n");
  const enabled = fixture.run([
    "review-gate",
    "enable",
    "--confirm-review-gate",
    "enable-billed-stop-review",
  ]);
  assert.equal(enabled.status, 0, enabled.stderr);

  const blocked = fixture.run(
    ["hook-stop-review"],
    { input: JSON.stringify({ hook_event_name: "Stop", cwd: fixture.cwd }) },
  );
  assert.equal(blocked.status, 0, blocked.stderr);
  const blockedPayload = JSON.parse(blocked.stdout);
  assert.equal(blockedPayload.decision, "block");
  assert.match(blockedPayload.reason, /Claude stop-time review found 1 actionable issue/u);
  assert.match(blockedPayload.reason, /src\/example\.js:7/u);
  const reviewCall = fixture.calls().find((entry) => entry.args.includes("--json-schema"));
  assertProfile(reviewCall.args, { write: false, textOnly: true });

  const callsBeforeLoopGuard = fixture.calls().length;
  const loopGuard = fixture.run(
    ["hook-stop-review"],
    {
      input: JSON.stringify({
        hook_event_name: "Stop",
        cwd: fixture.cwd,
        stop_hook_active: true,
      }),
    },
  );
  assert.equal(loopGuard.stdout, "");
  assert.equal(fixture.calls().length, callsBeforeLoopGuard);

  fixture.env.FAKE_CLAUDE_REVIEW_FINDING = "0";
  const clean = fixture.run(
    ["hook-stop-review"],
    { input: JSON.stringify({ hook_event_name: "Stop", cwd: fixture.cwd }) },
  );
  assert.equal(clean.status, 0, clean.stderr);
  assert.equal(clean.stdout, "");
  fixture.cleanup();
});

test("stop review gate fails open with a visible warning", () => {
  const fixture = makeFixture({
    FAKE_CLAUDE_REVIEW_FINDING: "1",
    FAKE_CLAUDE_BAD_REVIEW: "missing-title",
  });
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, "app.js"), "export const value = 1;\n");
  git(fixture.cwd, ["add", "app.js"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  writeFileSync(join(fixture.cwd, "app.js"), "export const value = 2;\n");
  assert.equal(
    fixture.run([
      "review-gate",
      "enable",
      "--confirm-review-gate",
      "enable-billed-stop-review",
    ]).status,
    0,
  );

  const result = fixture.run(
    ["hook-stop-review"],
    { input: JSON.stringify({ hook_event_name: "Stop", cwd: fixture.cwd }) },
  );
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.continue, true);
  assert.match(payload.systemMessage, /failed open.*malformed review finding/iu);
  fixture.cleanup();
});

test("stop review gate never treats partial review evidence as clean", () => {
  for (const kind of ["untracked", "binary"]) {
    const fixture = makeFixture();
    initGitRepo(fixture.cwd);
    writeFileSync(join(fixture.cwd, "README.md"), "# fixture\n");
    git(fixture.cwd, ["add", "README.md"]);
    git(fixture.cwd, ["commit", "-m", "initial"]);
    if (kind === "untracked") {
      writeFileSync(join(fixture.cwd, "new-code.js"), "throw new Error('bug');\n");
    } else {
      writeFileSync(join(fixture.cwd, "asset.bin"), Buffer.from([0, 1, 2, 3]));
      git(fixture.cwd, ["add", "asset.bin"]);
      git(fixture.cwd, ["commit", "-m", "binary"]);
      writeFileSync(join(fixture.cwd, "asset.bin"), Buffer.from([0, 9, 2, 3]));
    }
    assert.equal(
      fixture.run([
        "review-gate",
        "enable",
        "--confirm-review-gate",
        "enable-billed-stop-review",
      ]).status,
      0,
    );

    const result = fixture.run(
      ["hook-stop-review"],
      { input: JSON.stringify({ hook_event_name: "Stop", cwd: fixture.cwd }) },
    );
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.decision, "block");
    assert.match(payload.reason, /evidence was partial/u);
    assert.match(
      payload.reason,
      kind === "untracked" ? /untracked file contents were omitted/u : /binary contents were omitted/u,
    );
    fixture.cleanup();
  }
});

test("stop review gate detects untracked files even when repository status color is forced", () => {
  const fixture = makeFixture();
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, "README.md"), "# fixture\n");
  git(fixture.cwd, ["add", "README.md"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  git(fixture.cwd, ["config", "color.status", "always"]);
  writeFileSync(join(fixture.cwd, "untracked.js"), "throw new Error('must review');\n");
  assert.equal(
    fixture.run([
      "review-gate",
      "enable",
      "--confirm-review-gate",
      "enable-billed-stop-review",
    ]).status,
    0,
  );

  const result = fixture.run(
    ["hook-stop-review"],
    { input: JSON.stringify({ hook_event_name: "Stop", cwd: fixture.cwd }) },
  );
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.decision, "block");
  assert.match(payload.reason, /untracked file contents were omitted/u);
  const modelCall = fixture.calls().find((entry) => entry.args.includes("--json-schema"));
  assert.match(modelCall.stdin, /^\?\? untracked\.js$/mu);
  assert.equal(modelCall.stdin.includes("\u001b"), false);
  fixture.cleanup();
});

test("doctor fails readiness when any guarded core flag is unavailable", () => {
  const fixture = makeFixture({ FAKE_CLAUDE_HIDE_FLAG: "--no-chrome" });
  const result = fixture.run(["doctor", "--json"]);
  assert.equal(result.status, 3);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ready, false);
  assert.deepEqual(report.missingSafetyCapabilities, ["--no-chrome"]);

  const askResult = fixture.run(["ask", "hello"]);
  assert.notEqual(askResult.status, 0);
  assert.match(askResult.stderr, /lacks required safety flags/u);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("-p")), false);
  fixture.cleanup();
});

test("doctor never reports ready when help or auth diagnostics exit nonzero", () => {
  for (const env of [
    { FAKE_CLAUDE_HELP_EXIT: "1" },
    { FAKE_CLAUDE_AUTH_EXIT: "1" },
  ]) {
    const fixture = makeFixture(env);
    const result = fixture.run(["doctor", "--json"]);
    assert.equal(result.status, 3);
    assert.equal(JSON.parse(result.stdout).ready, false);
    fixture.cleanup();
  }
});

test("doctor and commands fail clearly before launch when a core capability is unavailable", () => {
  const cases = [
    {
      env: { FAKE_CLAUDE_HIDE_FLAG: "--json-schema" },
      command: ["review", "--json"],
      missing: "structured output (--json-schema)",
      error: /lacks --json-schema.*structured review output/u,
    },
    {
      env: { FAKE_CLAUDE_HIDE_FLAG: "--bg" },
      command: [
        "delegate",
        "--background",
        "--confirm-background",
        "unbounded-usage",
        "--confirm-background-data",
        "process-visible-prompt",
        "hello",
      ],
      missing: "background agents (--bg, agents --json, and stop lifecycle control)",
      error: /lacks --bg.*background sessions/u,
    },
    {
      env: { FAKE_CLAUDE_HIDE_AGENTS_JSON: "1" },
      command: [
        "delegate",
        "--background",
        "--confirm-background",
        "unbounded-usage",
        "--confirm-background-data",
        "process-visible-prompt",
        "hello",
      ],
      missing: "background agents (--bg, agents --json, and stop lifecycle control)",
      error: /lacks agents --json.*verified background sessions/u,
    },
    {
      env: { FAKE_CLAUDE_HIDE_STOP_COMMAND: "1" },
      command: [
        "delegate",
        "--background",
        "--confirm-background",
        "unbounded-usage",
        "--confirm-background-data",
        "process-visible-prompt",
        "hello",
      ],
      missing: "background agents (--bg, agents --json, and stop lifecycle control)",
      error: /lacks the stop lifecycle command.*unbounded background session/u,
    },
    {
      env: { FAKE_CLAUDE_STOP_HELP_EXIT: "1" },
      command: [
        "delegate",
        "--background",
        "--confirm-background",
        "unbounded-usage",
        "--confirm-background-data",
        "process-visible-prompt",
        "hello",
      ],
      missing: "background agents (--bg, agents --json, and stop lifecycle control)",
      error: /stop lifecycle command could not be verified.*unbounded background session/u,
    },
    {
      env: { FAKE_CLAUDE_HIDE_FLAG: "--worktree" },
      command: [
        "delegate",
        "--write",
        "--confirm-write",
        "isolated-worktree",
        "--confirm-dangerous-permissions",
        "bypass-host-safety",
        "hello",
      ],
      missing: "isolated worktrees (--worktree)",
      error: /lacks --worktree.*isolated write delegation/u,
    },
    {
      env: { FAKE_CLAUDE_HIDE_FLAG: "--resume" },
      command: [
        "resume",
        "--session",
        "123e4567-e89b-42d3-a456-426614174000",
        "hello",
      ],
      missing: "session resume (--resume)",
      error: /lacks --resume.*session resume/u,
    },
  ];

  for (const entry of cases) {
    const fixture = makeFixture(entry.env);
    if (entry.command[0] === "review" || entry.command.includes("--write")) {
      initGitRepo(fixture.cwd);
      writeFileSync(join(fixture.cwd, "app.js"), "export const value = 1;\n");
      git(fixture.cwd, ["add", "app.js"]);
      git(fixture.cwd, ["commit", "-m", "initial"]);
      writeFileSync(join(fixture.cwd, "app.js"), "export const value = 2;\n");
    }
    const doctorResult = fixture.run(["doctor", "--json"]);
    assert.equal(doctorResult.status, 3, doctorResult.stderr);
    const report = JSON.parse(doctorResult.stdout);
    assert.equal(report.ready, false);
    assert.ok(report.missingCoreCapabilities.includes(entry.missing));

    const commandResult = fixture.run(entry.command);
    assert.notEqual(commandResult.status, 0);
    assert.match(commandResult.stderr, entry.error);
    assert.equal(
      fixture.calls().some((call) => call.args.includes("-p") || call.args.includes("--bg")),
      false,
    );
    fixture.cleanup();
  }
});

test("ask sends an injection-shaped prompt on stdin with the exact safe profile", () => {
  const fixture = makeFixture();
  const sentinel = join(fixture.cwd, "should-not-exist");
  const prompt = `--dangerously-skip-permissions; touch ${sentinel}; $(touch ${sentinel})`;
  const result = fixture.run(["ask", "--json"], { input: prompt });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(sentinel), false);
  const calls = fixture.calls();
  const modelCall = calls.find((call) => call.args.includes("-p"));
  assert.ok(modelCall);
  assert.match(modelCall.stdin, /--dangerously-skip-permissions/u);
  assert.equal(modelCall.args.includes(prompt), false);
  assertProfile(modelCall.args, { write: false });
  assert.ok(modelCall.args.includes("--no-session-persistence"));
  assert.equal(JSON.parse(result.stdout).sessionId, undefined);
  fixture.cleanup();
});

test("only persisted foreground calls expose a resumable Claude session UUID", () => {
  const fixture = makeFixture();
  const ephemeral = fixture.run(["ask", "hello"]);
  assert.equal(ephemeral.status, 0, ephemeral.stderr);
  assert.doesNotMatch(ephemeral.stderr, /Claude session:/u);

  const persisted = fixture.run(["ask", "--persist", "--json", "hello"]);
  assert.equal(persisted.status, 0, persisted.stderr);
  assert.equal(
    JSON.parse(persisted.stdout).sessionId,
    "123e4567-e89b-42d3-a456-426614174000",
  );
  fixture.cleanup();
});

test("persisted calls fail closed without a canonical resumable session UUID", () => {
  for (const sessionId of [undefined, "not-a-session-id"]) {
    const fixture = makeFixture({
      FAKE_CLAUDE_RESPONSE: JSON.stringify({
        type: "result",
        result: "handoff accepted",
        ...(sessionId ? { session_id: sessionId } : {}),
      }),
    });
    const result = fixture.run(["handoff", "--prompt", "brief", "--json"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /resumability could not be verified/u);
    fixture.cleanup();
  }
});

test("native profile really loads local customizations only after exact confirmation", () => {
  const fixture = makeFixture();
  const denied = fixture.run(["ask", "--profile", "native", "hello"]);
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /load-local-customizations/u);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("-p")), false);

  const allowed = fixture.run([
    "ask",
    "--profile",
    "native",
    "--confirm-native-profile",
    "load-local-customizations",
    "hello",
  ]);
  assert.equal(allowed.status, 0, allowed.stderr);
  const modelCall = fixture.calls().find((entry) => entry.args.includes("-p"));
  assert.equal(modelCall.args.includes("--safe-mode"), false);
  assert.equal(modelCall.args.includes("--restricted"), false);
  assert.equal(modelCall.args.includes("--strict-mcp-config"), false);
  assert.equal(modelCall.args.includes("--no-chrome"), true);
  assert.equal(modelCall.args[modelCall.args.indexOf("--permission-mode") + 1], "dontAsk");
  assert.equal(modelCall.args[modelCall.args.indexOf("--tools") + 1], "Read,Glob,Grep");
  fixture.cleanup();
});

test("decoded model text cannot inject terminal controls into plain output", () => {
  const fixture = makeFixture({
    FAKE_CLAUDE_RESPONSE: JSON.stringify({
      type: "result",
      result: "\u001b]0;owned\u0007visible\u001b[31mred\u001b[0m\rnext\u009b31m",
    }),
  });
  const result = fixture.run(["ask", "hello"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("\u001b"), false);
  assert.equal(result.stdout.includes("\r"), false);
  assert.equal(result.stdout.includes("\u009b"), false);
  assert.equal(result.stdout.includes("\u2028"), false);
  assert.doesNotMatch(result.stdout, /\n\[P1\] separator-forged/u);
  assert.match(result.stdout, /visiblered/u);
  fixture.cleanup();
});

test("model and unknown wrapper flags are rejected before a model call", () => {
  const fixture = makeFixture();
  const badModel = fixture.run(["ask", "--model", "--evil", "hello"]);
  assert.notEqual(badModel.status, 0);
  const unknown = fixture.run(["ask", "--not-a-real-option", "hello"]);
  assert.notEqual(unknown.status, 0);
  const modelCalls = fixture.calls().filter((call) => call.args.includes("-p"));
  assert.equal(modelCalls.length, 0);
  fixture.cleanup();
});

test("an explicitly empty Claude binary never falls through to PATH or the environment", () => {
  const fixture = makeFixture();
  const result = fixture.run(["ask", "--claude-bin", "", "hello"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Claude executable must be a non-empty command name or absolute path/u);
  assert.equal(fixture.calls().length, 0);
  fixture.cleanup();
});

test("explicitly empty base and resume values fail before a paid model call", () => {
  const askFixture = makeFixture();
  const askResult = askFixture.run(["ask", "--resume", "", "hello"]);
  assert.notEqual(askResult.status, 0);
  assert.match(askResult.stderr, /canonical UUID/u);
  assert.equal(askFixture.calls().some((entry) => entry.args.includes("-p")), false);
  askFixture.cleanup();

  const delegateFixture = makeFixture();
  const delegateResult = delegateFixture.run(["delegate", "--resume", "", "hello"]);
  assert.notEqual(delegateResult.status, 0);
  assert.match(delegateResult.stderr, /canonical UUID/u);
  assert.equal(delegateFixture.calls().some((entry) => entry.args.includes("-p")), false);
  const writeResult = delegateFixture.run([
    "delegate",
    "--write",
    "--resume",
    "",
    "--confirm-write",
    "isolated-worktree",
    "--confirm-dangerous-permissions",
    "bypass-host-safety",
    "hello",
  ]);
  assert.notEqual(writeResult.status, 0);
  assert.match(writeResult.stderr, /Write delegation cannot resume/u);
  assert.equal(delegateFixture.calls().some((entry) => entry.args.includes("--worktree")), false);
  delegateFixture.cleanup();

  const reviewFixture = makeFixture();
  initGitRepo(reviewFixture.cwd);
  writeFileSync(join(reviewFixture.cwd, "app.js"), "export const value = 1;\n");
  git(reviewFixture.cwd, ["add", "app.js"]);
  git(reviewFixture.cwd, ["commit", "-m", "initial"]);
  const reviewResult = reviewFixture.run(["review", "--base", "", "--json"]);
  assert.notEqual(reviewResult.status, 0);
  assert.match(reviewResult.stderr, /Base ref must be a non-option git ref/u);
  assert.equal(reviewFixture.calls().some((entry) => entry.args.includes("--json-schema")), false);
  reviewFixture.cleanup();
});

test("CLI parse errors cannot inject terminal control sequences", () => {
  const fixture = makeFixture();
  const attempts = [
    ["unknown-\u001b]0;owned\u0007command\nforged\t\u202e"],
    ["ask", "--not-a-real-option\nforged\t\u202e", "hello"],
    ["ask", "--cwd", join(fixture.cwd, "missing\nforged\t\u202e"), "hello"],
  ];
  for (const args of attempts) {
    const result = fixture.run(args);
    assert.notEqual(result.status, 0);
    assert.equal(result.stderr.includes("\u001b"), false);
    assert.equal(result.stderr.includes("\u0007"), false);
    assert.equal(result.stderr.includes("\t"), false);
    assert.equal(result.stderr.includes("\u202e"), false);
    assert.equal(result.stderr.trim().split("\n").length, 1);
    assert.equal((result.stderr.match(/cc-for-codex:/gu) || []).length, 1);
  }
  fixture.cleanup();
});

test("prompt files and stdin are bounded before model invocation", () => {
  const fileFixture = makeFixture();
  writeFileSync(join(fileFixture.cwd, "oversized.txt"), "x".repeat(1024 * 1024 + 1));
  const fileResult = fileFixture.run(["ask", "--prompt-file", "oversized.txt"]);
  assert.notEqual(fileResult.status, 0);
  assert.match(fileResult.stderr, /byte safety limit/u);
  assert.equal(fileFixture.calls().some((entry) => entry.args.includes("-p")), false);
  fileFixture.cleanup();

  const stdinFixture = makeFixture();
  const stdinResult = stdinFixture.run(["ask"], { input: "x".repeat(1024 * 1024 + 1) });
  assert.notEqual(stdinResult.status, 0);
  assert.match(stdinResult.stderr, /byte safety limit/u);
  assert.equal(stdinFixture.calls().some((entry) => entry.args.includes("-p")), false);
  stdinFixture.cleanup();
});

test("a held-open prompt pipe cannot outlive the command deadline", { timeout: 4_000 }, async () => {
  const cwd = mkdtempSync(join(tmpdir(), "ccfc-held-stdin-"));
  const log = join(cwd, "fake-claude.jsonl");
  const child = spawn(
    process.execPath,
    [cli, "ask", "--timeout-seconds", "1"],
    {
      cwd,
      env: { ...process.env, CC_FOR_CODEX_CLAUDE_BIN: fakeClaude, FAKE_CLAUDE_LOG: log },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  child.stdin.on("error", () => {});
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const started = Date.now();
  const result = await new Promise((resolvePromise, rejectPromise) => {
    child.once("error", rejectPromise);
    child.once("close", (code, signal) => resolvePromise({ code, signal }));
  });
  assert.equal(result.code, 124);
  assert.equal(result.signal, null);
  assert.ok(Date.now() - started < 2_500, "stdin timeout should share the one-second command deadline");
  assert.match(stderr, /timed out before end-of-input/u);
  assert.equal(existsSync(log), false);
  rmSync(cwd, { recursive: true, force: true });
});

test("foreground tuning accepts documented fallback lists and ultracode effort", () => {
  const fixture = makeFixture();
  const result = fixture.run([
    "ask",
    "--fallback-model",
    "sonnet,haiku",
    "--effort",
    "ultracode",
    "--max-budget-usd",
    "0.001",
    "hello",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const call = fixture.calls().find((entry) => entry.args.includes("-p"));
  assert.equal(call.args[call.args.indexOf("--fallback-model") + 1], "sonnet,haiku");
  assert.equal(call.args[call.args.indexOf("--effort") + 1], "ultracode");
  assert.equal(call.args[call.args.indexOf("--max-budget-usd") + 1], "0.001");

  const zeroBudget = fixture.run(["ask", "--max-budget-usd", "0", "hello"]);
  assert.notEqual(zeroBudget.status, 0);
  assert.match(zeroBudget.stderr, /greater than 0/u);
  assert.equal(fixture.calls().filter((entry) => entry.args.includes("-p")).length, 1);
  fixture.cleanup();
});

test("documented max-turns guard is enforced even when Claude help omits it", () => {
  const fixture = makeFixture({ FAKE_CLAUDE_HIDE_MAX_TURNS: "1" });
  const result = fixture.run(["ask", "--json", "hello"]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.guardrails.maxTurns, true);
  assert.equal(report.guardrails.outerTimeout, true);
  const call = fixture.calls().find((entry) => entry.args.includes("-p"));
  assert.equal(call.args[call.args.indexOf("--max-turns") + 1], "12");

  const explicit = fixture.run(["ask", "--max-turns", "2", "hello"]);
  assert.equal(explicit.status, 0, explicit.stderr);
  const explicitCall = fixture.calls().filter((entry) => entry.args.includes("-p")).at(-1);
  assert.equal(explicitCall.args[explicitCall.args.indexOf("--max-turns") + 1], "2");
  fixture.cleanup();
});

test("review builds local diff context and requests the structured schema", () => {
  const fixture = makeFixture();
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, "app.js"), "export const answer = 41;\n");
  git(fixture.cwd, ["add", "app.js"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  writeFileSync(join(fixture.cwd, "app.js"), "export const answer = 42;\n");

  const result = fixture.run(["review", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.review.findings.length, 0);
  const modelCall = fixture.calls().find((call) => call.args.includes("--json-schema"));
  assert.ok(modelCall);
  assert.match(modelCall.stdin, /export const answer = 42/u);
  assert.match(modelCall.stdin, /untrusted_diff/u);
  assertProfile(modelCall.args, { write: false, textOnly: true });

  fixture.env.FAKE_CLAUDE_STRUCTURED_CONTROL = "1";
  fixture.env.FAKE_CLAUDE_REVIEW_FINDING = "1";
  const rendered = fixture.run(["review"]);
  assert.equal(rendered.status, 0, rendered.stderr);
  assert.equal(rendered.stdout.includes("\u001b"), false);
  assert.match(rendered.stdout, /\[P2\] Concrete defect — src\/example\.js:7/u);
  assert.match(rendered.stdout, /Clean sections: correctness, security/u);

  fixture.env.FAKE_CLAUDE_BAD_REVIEW = "missing-title";
  const malformed = fixture.run(["review", "--json"]);
  assert.notEqual(malformed.status, 0);
  assert.match(malformed.stderr, /malformed review finding/u);
  fixture.cleanup();
});

test("plain persisted reviews print their resumable Claude session UUID", () => {
  const fixture = makeFixture();
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, "app.js"), "export const value = 1;\n");
  git(fixture.cwd, ["add", "app.js"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  writeFileSync(join(fixture.cwd, "app.js"), "export const value = 2;\n");

  const ephemeral = fixture.run(["review"]);
  assert.equal(ephemeral.status, 0, ephemeral.stderr);
  assert.doesNotMatch(ephemeral.stdout + ephemeral.stderr, /Claude session:/u);

  const persisted = fixture.run(["review", "--persist"]);
  assert.equal(persisted.status, 0, persisted.stderr);
  assert.match(
    persisted.stdout,
    /Claude session: 123e4567-e89b-42d3-a456-426614174000/u,
  );
  fixture.cleanup();
});

test("review rejects whitespace-only structured fields", () => {
  for (const badReview of ["whitespace-summary", "whitespace-finding", "whitespace-clean"]) {
    const fixture = makeFixture({ FAKE_CLAUDE_BAD_REVIEW: badReview });
    initGitRepo(fixture.cwd);
    writeFileSync(join(fixture.cwd, "app.js"), "export const value = 1;\n");
    git(fixture.cwd, ["add", "app.js"]);
    git(fixture.cwd, ["commit", "-m", "initial"]);
    writeFileSync(join(fixture.cwd, "app.js"), "export const value = 2;\n");
    const result = fixture.run(["review", "--json"]);
    assert.notEqual(result.status, 0, `${badReview} unexpectedly passed`);
    assert.match(result.stderr, /missing summary|malformed review finding|malformed clean_sections/u);
    fixture.cleanup();
  }
});

test("plain review rendering flattens record-breaking and bidi controls", () => {
  const fixture = makeFixture({
    FAKE_CLAUDE_STRUCTURED_LINE_CONTROL: "1",
    FAKE_CLAUDE_REVIEW_FINDING: "1",
  });
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, "app.js"), "export const value = 1;\n");
  git(fixture.cwd, ["add", "app.js"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  writeFileSync(join(fixture.cwd, "app.js"), "export const value = 2;\n");

  const result = fixture.run(["review"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("\u202e"), false);
  assert.equal(result.stdout.includes("\u009b"), false);
  assert.doesNotMatch(result.stdout, /\n\[P0\] forged/u);
  assert.equal(result.stdout.includes("\t"), false);

  const jsonResult = fixture.run(["review", "--json"]);
  assert.equal(jsonResult.status, 0, jsonResult.stderr);
  assert.equal(jsonResult.stdout.includes("\u202e"), false);
  assert.equal(jsonResult.stdout.includes("\u009b"), false);
  assert.equal(jsonResult.stdout.includes("\u2028"), false);
  assert.match(jsonResult.stdout, /\\u202E/u);
  assert.match(jsonResult.stdout, /\\u009B/u);
  assert.match(jsonResult.stdout, /\\u2028/u);
  assert.equal(JSON.parse(jsonResult.stdout).review.findings[0].title.includes("\u202e"), true);
  assert.equal(JSON.parse(jsonResult.stdout).review.findings[0].title.includes("\u009b"), true);
  assert.equal(JSON.parse(jsonResult.stdout).review.findings[0].title.includes("\u2028"), true);
  fixture.cleanup();
});

test("review preserves dangerous source controls as visible evidence", () => {
  const fixture = makeFixture();
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, "trojan.js"), "export const label = 'safe';\n");
  git(fixture.cwd, ["add", "trojan.js"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  writeFileSync(join(fixture.cwd, "trojan.js"), "export const label = '\u202eevil';\n");

  const result = fixture.run(["review", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).scope.partialEvidence, false);
  const modelCall = fixture.calls().find((entry) => entry.args.includes("--json-schema"));
  assert.match(modelCall.stdin, /<U\+202E>evil/u);
  assert.equal(modelCall.stdin.includes("\u202e"), false);
  fixture.cleanup();
});

test("review treats user paths as literal git pathspecs", () => {
  const fixture = makeFixture();
  initGitRepo(fixture.cwd);
  const magicName = ":(exclude)secret.js";
  writeFileSync(join(fixture.cwd, magicName), "export const selected = 1;\n");
  writeFileSync(join(fixture.cwd, "ordinary.js"), "export const ordinary = 1;\n");
  git(fixture.cwd, ["--literal-pathspecs", "add", "--", magicName, "ordinary.js"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  writeFileSync(join(fixture.cwd, magicName), "export const selected = 2;\n");
  writeFileSync(join(fixture.cwd, "ordinary.js"), "export const ordinary = 2;\n");

  const result = fixture.run(["review", "--path", magicName, "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const modelCall = fixture.calls().find((entry) => entry.args.includes("--json-schema"));
  assert.match(modelCall.stdin, /selected = 2/u);
  assert.doesNotMatch(modelCall.stdin, /ordinary = 2/u);
  fixture.cleanup();
});

test("review rejects an empty path instead of broadening scope", () => {
  const fixture = makeFixture();
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, "public.js"), "export const publicValue = 1;\n");
  writeFileSync(join(fixture.cwd, "secret.js"), "export const secretValue = 1;\n");
  git(fixture.cwd, ["add", "public.js", "secret.js"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  writeFileSync(join(fixture.cwd, "public.js"), "export const publicValue = 2;\n");
  writeFileSync(join(fixture.cwd, "secret.js"), "export const secretValue = 2;\n");

  const result = fixture.run(["review", "--path", "", "--json"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Review paths must be non-empty/u);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("--json-schema")), false);
  fixture.cleanup();
});

test("review rejects an unmatched path but accepts unchanged and deleted tracked paths", () => {
  const fixture = makeFixture();
  initGitRepo(fixture.cwd);
  mkdirSync(join(fixture.cwd, "src"));
  writeFileSync(join(fixture.cwd, "README.md"), "# unchanged\n");
  writeFileSync(join(fixture.cwd, "src", "app.js"), "export const app = 1;\n");
  writeFileSync(join(fixture.cwd, "src", "deleted.js"), "export const removed = true;\n");
  git(fixture.cwd, ["add", "README.md", "src/app.js", "src/deleted.js"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  writeFileSync(join(fixture.cwd, "src", "app.js"), "export const app = 2;\n");

  const typo = fixture.run(["review", "--path", "src/ap.js", "--json"]);
  assert.notEqual(typo.status, 0);
  assert.match(typo.stderr, /did not match/u);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("-p")), false);

  const unchanged = fixture.run(["review", "--path", "README.md", "--json"]);
  assert.equal(unchanged.status, 0, unchanged.stderr);
  assert.deepEqual(JSON.parse(unchanged.stdout).scope.paths, ["README.md"]);

  git(fixture.cwd, ["rm", "-q", "src/deleted.js"]);
  const deleted = fixture.run(["review", "--path", "src/deleted.js"]);
  assert.equal(deleted.status, 0, deleted.stderr);
  assert.match(deleted.stdout, /Scope: src\/deleted\.js/u);
  const deletedCall = fixture.calls().filter((entry) => entry.args.includes("--json-schema")).at(-1);
  assert.match(deletedCall.stdin, /export const removed = true/u);
  fixture.cleanup();
});

test("review refuses selected assume-unchanged and skip-worktree index entries", () => {
  for (const flag of ["--assume-unchanged", "--skip-worktree"]) {
    const fixture = makeFixture();
    initGitRepo(fixture.cwd);
    writeFileSync(join(fixture.cwd, "hidden.js"), "export const hidden = 1;\n");
    writeFileSync(join(fixture.cwd, "visible.js"), "export const visible = 1;\n");
    git(fixture.cwd, ["add", "hidden.js", "visible.js"]);
    git(fixture.cwd, ["commit", "-m", "initial"]);
    git(fixture.cwd, ["update-index", flag, "hidden.js"]);
    writeFileSync(join(fixture.cwd, "hidden.js"), "export const hidden = 2;\n");

    const full = fixture.run(["review", "--json"]);
    assert.notEqual(full.status, 0);
    assert.match(full.stderr, /assume-unchanged or skip-worktree/u);
    const selected = fixture.run(["review", "--path", "hidden.js", "--json"]);
    assert.notEqual(selected.status, 0);
    assert.match(selected.stderr, /assume-unchanged or skip-worktree/u);
    assert.equal(fixture.calls().some((entry) => entry.args.includes("-p")), false);

    writeFileSync(join(fixture.cwd, "visible.js"), "export const visible = 2;\n");
    const visible = fixture.run(["review", "--path", "visible.js", "--json"]);
    assert.equal(visible.status, 0, visible.stderr);
    assert.deepEqual(JSON.parse(visible.stdout).scope.paths, ["visible.js"]);
    fixture.cleanup();
  }
});

test("review explicitly marks omitted untracked contents as partial", () => {
  const fixture = makeFixture();
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, "tracked.js"), "export const tracked = true;\n");
  git(fixture.cwd, ["add", "tracked.js"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  writeFileSync(join(fixture.cwd, "new-critical.js"), "throw new Error('untracked secret');\n");

  const jsonResult = fixture.run(["review", "--json"]);
  assert.equal(jsonResult.status, 0, jsonResult.stderr);
  const report = JSON.parse(jsonResult.stdout);
  assert.equal(report.scope.untrackedOmitted, true);
  assert.equal(report.scope.partialEvidence, true);
  const modelCall = fixture.calls().find((entry) => entry.args.includes("--json-schema"));
  assert.match(modelCall.stdin, /\?\? new-critical\.js/u);
  assert.match(modelCall.stdin, /Evidence partial: yes/u);
  assert.doesNotMatch(modelCall.stdin, /untracked secret/u);

  const rendered = fixture.run(["review"]);
  assert.equal(rendered.status, 0, rendered.stderr);
  assert.match(rendered.stdout, /untracked file contents were omitted/u);
  fixture.cleanup();
});

test("review marks tracked binary changes as partial evidence", () => {
  const fixture = makeFixture();
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, "asset.bin"), Buffer.from([0, 1, 2, 3]));
  git(fixture.cwd, ["add", "asset.bin"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  writeFileSync(join(fixture.cwd, "asset.bin"), Buffer.from([0, 9, 8, 7]));

  const result = fixture.run(["review", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.scope.binaryOmitted, true);
  assert.equal(report.scope.partialEvidence, true);
  const modelCall = fixture.calls().find((entry) => entry.args.includes("--json-schema"));
  assert.match(modelCall.stdin, /Evidence partial: yes/u);
  assert.match(modelCall.stdin, /Binary contents omitted: yes/u);

  const rendered = fixture.run(["review"]);
  assert.equal(rendered.status, 0, rendered.stderr);
  assert.match(rendered.stdout, /changed binary contents were omitted/u);
  fixture.cleanup();
});

test("review includes staged initial contents in an unborn repository", () => {
  const fixture = makeFixture();
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, "critical.js"), "throw new Error('initial staged defect');\n");
  git(fixture.cwd, ["add", "critical.js"]);

  const result = fixture.run(["review", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.scope.partialEvidence, false);
  const modelCall = fixture.calls().find((entry) => entry.args.includes("--json-schema"));
  assert.match(modelCall.stdin, /initial staged defect/u);
  fixture.cleanup();
});

test("review disables fsmonitor and rejects repository textconv executables", () => {
  const fixture = makeFixture();
  const helpers = mkdtempSync(join(tmpdir(), "ccfc-git-read-helpers-"));
  const fsmonitorSentinel = join(helpers, "fsmonitor-ran");
  const textconvSentinel = join(helpers, "textconv-ran");
  const fsmonitor = join(helpers, "fsmonitor.sh");
  const textconv = join(helpers, "textconv.sh");
  writeFileSync(fsmonitor, `#!/bin/sh\n: > "${fsmonitorSentinel}"\nexit 0\n`);
  writeFileSync(textconv, `#!/bin/sh\n: > "${textconvSentinel}"\n/bin/cat "$1"\n`);
  chmodSync(fsmonitor, 0o755);
  chmodSync(textconv, 0o755);

  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, ".gitattributes"), "*.dat diff=unsafe\n");
  writeFileSync(join(fixture.cwd, "sample.dat"), "before\n");
  git(fixture.cwd, ["add", ".gitattributes", "sample.dat"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  writeFileSync(join(fixture.cwd, "sample.dat"), "after\n");
  git(fixture.cwd, ["config", "core.fsmonitor", fsmonitor]);
  git(fixture.cwd, ["config", "diff.unsafe.textconv", textconv]);

  const result = fixture.run(["review", "--json"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /executable Git diff\/textconv configuration/u);
  assert.equal(existsSync(fsmonitorSentinel), false);
  assert.equal(existsSync(textconvSentinel), false);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("-p")), false);
  fixture.cleanup();
  rmSync(helpers, { recursive: true, force: true });
});

test("review Git inspection does not refresh the repository index", () => {
  const fixture = makeFixture();
  initGitRepo(fixture.cwd);
  const tracked = join(fixture.cwd, "README.md");
  writeFileSync(tracked, "# fixture\n");
  git(fixture.cwd, ["add", "README.md"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  const indexPath = join(fixture.cwd, ".git", "index");
  const before = readFileSync(indexPath);
  const future = new Date(Date.now() + 10_000);
  utimesSync(tracked, future, future);

  const result = fixture.run(["review", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readFileSync(indexPath), before);
  const modelCall = fixture.calls().find((entry) => entry.args.includes("--json-schema"));
  assert.equal(modelCall.gitOptionalLocks, "0");
  fixture.cleanup();
});

test("review snapshots split indexes without losing staged changes", () => {
  const fixture = makeFixture();
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, "staged.js"), "export const value = 1;\n");
  git(fixture.cwd, ["add", "staged.js"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  writeFileSync(join(fixture.cwd, "staged.js"), "export const value = 2;\n");
  git(fixture.cwd, ["add", "staged.js"]);
  git(fixture.cwd, ["update-index", "--split-index"]);
  const indexPath = join(fixture.cwd, ".git", "index");
  const before = readFileSync(indexPath);

  const result = fixture.run(["review", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readFileSync(indexPath), before);
  const modelCall = fixture.calls().find((entry) => entry.args.includes("--json-schema"));
  assert.match(modelCall.stdin, /export const value = 2/u);
  fixture.cleanup();
});

test("all guarded model launches neutralize repository Git startup helpers", () => {
  const fixture = makeFixture({ FAKE_CLAUDE_RUN_GIT_STATUS: "1" });
  const helpers = mkdtempSync(join(tmpdir(), "ccfc-claude-startup-helpers-"));
  const sentinel = join(helpers, "fsmonitor-ran");
  const fsmonitor = join(helpers, "fsmonitor.sh");
  writeFileSync(fsmonitor, `#!/bin/sh\n: > "${sentinel}"\nexit 0\n`);
  chmodSync(fsmonitor, 0o755);
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, "README.md"), "# fixture\n");
  git(fixture.cwd, ["add", "README.md"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  git(fixture.cwd, ["config", "core.fsmonitor", fsmonitor]);

  const commands = [
    ["ask", "inspect"],
    ["review", "--json"],
    ["delegate", "inspect"],
    [
      "review",
      "--background",
      "--confirm-background",
      "unbounded-usage",
      "--confirm-background-data",
      "process-visible-prompt",
      "--json",
    ],
    [
      "delegate",
      "--background",
      "--confirm-background",
      "unbounded-usage",
      "--confirm-background-data",
      "process-visible-prompt",
      "inspect",
    ],
  ];
  for (const args of commands) {
    const result = fixture.run(args);
    assert.equal(result.status, 0, `${args[0]}: ${result.stderr}`);
    assert.equal(existsSync(sentinel), false, `${args[0]} allowed core.fsmonitor to execute`);
  }
  fixture.cleanup();
  rmSync(helpers, { recursive: true, force: true });
});

test("plain-directory consultation does not require Git", () => {
  const fixture = makeFixture({ CC_FOR_CODEX_GIT_BIN: "/definitely/not/a/git-binary" });
  for (const args of [["ask", "inspect"], ["delegate", "inspect"]]) {
    const result = fixture.run(args);
    assert.equal(result.status, 0, `${args[0]}: ${result.stderr}`);
  }
  fixture.cleanup();
});

test("review cwd cannot be redirected by inherited Git repository variables", () => {
  const fixture = makeFixture();
  const other = mkdtempSync(join(tmpdir(), "ccfc-git-redirect-"));
  initGitRepo(fixture.cwd);
  initGitRepo(other);
  writeFileSync(join(fixture.cwd, "a.js"), "export const fromA = 1;\n");
  writeFileSync(join(other, "b.js"), "export const fromB = 1;\n");
  git(fixture.cwd, ["add", "a.js"]);
  git(other, ["add", "b.js"]);
  git(fixture.cwd, ["commit", "-m", "A initial"]);
  git(other, ["commit", "-m", "B initial"]);
  writeFileSync(join(fixture.cwd, "a.js"), "export const fromA = 2;\n");
  writeFileSync(join(other, "b.js"), "export const fromB = 2;\n");
  fixture.env.GIT_DIR = join(other, ".git");
  fixture.env.GIT_WORK_TREE = other;

  const result = fixture.run(["review", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.scope.root, realpathSync(fixture.cwd));
  const modelCall = fixture.calls().find((entry) => entry.args.includes("--json-schema"));
  assert.match(modelCall.stdin, /fromA = 2/u);
  assert.doesNotMatch(modelCall.stdin, /fromB = 2/u);
  fixture.cleanup();
  rmSync(other, { recursive: true, force: true });
});

test("review rejects a repository-controlled core.worktree scope escape", () => {
  const fixture = makeFixture();
  const outside = mkdtempSync(join(tmpdir(), "ccfc-core-worktree-"));
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, "secret.txt"), "inside baseline\n");
  git(fixture.cwd, ["add", "secret.txt"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  writeFileSync(join(outside, "secret.txt"), "OUTSIDE_SECRET_83721\n");
  writeFileSync(join(outside, ".git"), `gitdir: ${join(fixture.cwd, ".git")}\n`);
  git(fixture.cwd, ["config", "core.worktree", outside]);

  const result = fixture.run(["review", "--json"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /scope redirection/u);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("--json-schema")), false);
  assert.doesNotMatch(result.stdout + result.stderr, /OUTSIDE_SECRET_83721/u);
  fixture.cleanup();
  rmSync(outside, { recursive: true, force: true });
});

test("review rejects core.worktree broadening a nested repository to an ancestor", () => {
  const fixture = makeFixture();
  const nested = join(fixture.cwd, "nested");
  mkdirSync(nested);
  initGitRepo(nested);
  writeFileSync(join(fixture.cwd, "outside-secret.txt"), "ANCESTOR_SECRET_52091\n");
  git(nested, ["config", "core.worktree", fixture.cwd]);

  const result = fixture.run(["review", "--cwd", nested, "--json"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /scope redirection/u);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("--json-schema")), false);
  assert.doesNotMatch(result.stdout + result.stderr, /ANCESTOR_SECRET_52091/u);
  fixture.cleanup();
});

test("review rejects a symbolic-link .git marker before Claude starts", () => {
  const fixture = makeFixture();
  const victim = mkdtempSync(join(tmpdir(), "ccfc-git-marker-victim-"));
  initGitRepo(victim);
  writeFileSync(join(victim, "secret.txt"), "victim secret\n");
  git(victim, ["add", "secret.txt"]);
  git(victim, ["commit", "-m", "victim"]);
  symlinkSync(join(victim, ".git"), join(fixture.cwd, ".git"));

  const result = fixture.run(["review", "--json"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /symbolic link|scope redirection/u);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("--json-schema")), false);
  assert.doesNotMatch(result.stdout + result.stderr, /victim secret/u);

  fixture.cleanup();
  rmSync(victim, { recursive: true, force: true });
});

test("review rejects an arbitrary external gitdir pointer before Claude starts", () => {
  const fixture = makeFixture();
  const victim = mkdtempSync(join(tmpdir(), "ccfc-gitdir-victim-"));
  initGitRepo(victim);
  writeFileSync(join(victim, "secret.txt"), "external victim secret\n");
  git(victim, ["add", "secret.txt"]);
  git(victim, ["commit", "-m", "victim"]);
  writeFileSync(join(fixture.cwd, ".git"), `gitdir: ${realpathSync(join(victim, ".git"))}\n`);

  const result = fixture.run(["review", "--json"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unregistered external gitdir pointer|scope redirection/u);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("--json-schema")), false);
  assert.doesNotMatch(result.stdout + result.stderr, /external victim secret/u);

  fixture.cleanup();
  rmSync(victim, { recursive: true, force: true });
});

test("review rejects a directory marker whose commondir redirects outside the repository", () => {
  const fixture = makeFixture();
  const victim = mkdtempSync(join(tmpdir(), "ccfc-commondir-victim-"));
  initGitRepo(fixture.cwd);
  initGitRepo(victim);
  writeFileSync(join(victim, "secret.txt"), "OUT_OF_SCOPE_COMMONDIR\n");
  git(victim, ["add", "secret.txt"]);
  git(victim, ["commit", "-m", "victim"]);
  writeFileSync(join(fixture.cwd, ".git", "commondir"), `${realpathSync(join(victim, ".git"))}\n`);

  const result = fixture.run(["review", "--json"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /administrative directory escaped|scope redirection/u);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("--json-schema")), false);
  assert.doesNotMatch(result.stdout + result.stderr, /OUT_OF_SCOPE_COMMONDIR/u);

  fixture.cleanup();
  rmSync(victim, { recursive: true, force: true });
});

test("review rejects Git alternate object stores before Claude sees external blobs", () => {
  const fixture = makeFixture();
  const victim = mkdtempSync(join(tmpdir(), "ccfc-alternate-victim-"));
  initGitRepo(fixture.cwd);
  initGitRepo(victim);
  writeFileSync(join(victim, "secret.txt"), "OUT_OF_SCOPE_ALTERNATE\n");
  git(victim, ["add", "secret.txt"]);
  git(victim, ["commit", "-m", "victim"]);
  writeFileSync(join(fixture.cwd, ".git", "HEAD"), `${gitOutput(victim, ["rev-parse", "HEAD"])}\n`);
  writeFileSync(
    join(fixture.cwd, ".git", "objects", "info", "alternates"),
    `${realpathSync(join(victim, ".git", "objects"))}\n`,
  );

  const result = fixture.run(["review", "--json"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /refuses Git alternate object stores/u);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("--json-schema")), false);
  assert.doesNotMatch(result.stdout + result.stderr, /OUT_OF_SCOPE_ALTERNATE/u);

  fixture.cleanup();
  rmSync(victim, { recursive: true, force: true });
});

test("session stop and review-gate disable remain available after object storage becomes unsupported", () => {
  const fixture = makeFixture();
  const alternate = mkdtempSync(join(tmpdir(), "ccfc-lifecycle-alternate-"));
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, "README.md"), "# fixture\n");
  git(fixture.cwd, ["add", "README.md"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  assert.equal(
    fixture.run([
      "review-gate",
      "enable",
      "--confirm-review-gate",
      "enable-billed-stop-review",
    ]).status,
    0,
  );
  fixture.env.FAKE_CLAUDE_AGENTS = JSON.stringify([
    {
      id: "deadbeef",
      state: "working",
      status: "running",
      cwd: fixture.cwd,
      pid: 12345,
    },
  ]);
  writeFileSync(
    join(fixture.cwd, ".git", "objects", "info", "alternates"),
    `${realpathSync(alternate)}\n`,
  );

  const stopped = fixture.run([
    "stop",
    "deadbeef",
    "--confirm-stop",
    "stop:deadbeef",
  ]);
  assert.equal(stopped.status, 0, stopped.stderr);
  assert.equal(
    fixture.calls().some((entry) => entry.args[0] === "stop" && !entry.args.includes("--help")),
    true,
  );
  const disabled = fixture.run(["review-gate", "disable", "--json"]);
  assert.equal(disabled.status, 0, disabled.stderr);
  assert.equal(JSON.parse(disabled.stdout).enabled, false);

  fixture.cleanup();
  rmSync(alternate, { recursive: true, force: true });
});

test("review accepts a registered linked-worktree .git marker", () => {
  const fixture = makeFixture();
  const parent = mkdtempSync(join(tmpdir(), "ccfc-linked-marker-"));
  const main = join(parent, "main");
  const linked = join(parent, "linked");
  mkdirSync(main);
  initGitRepo(main);
  writeFileSync(join(main, "app.js"), "export const value = 1;\n");
  git(main, ["add", "app.js"]);
  git(main, ["commit", "-m", "initial"]);
  git(main, ["worktree", "add", "-q", "-b", "linked-marker-test", linked]);
  writeFileSync(join(linked, "app.js"), "export const value = 2;\n");

  const result = fixture.run(["review", "--cwd", linked, "--json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).scope.root, realpathSync(linked));
  assert.equal(fixture.calls().some((entry) => entry.args.includes("--json-schema")), true);

  fixture.cleanup();
  rmSync(parent, { recursive: true, force: true });
});

test("review Git discovery shares the outer command deadline", () => {
  const fixture = makeFixture();
  const helperDir = mkdtempSync(join(tmpdir(), "ccfc-slow-git-"));
  const slowGit = join(helperDir, "git");
  writeFileSync(slowGit, "#!/bin/sh\nsleep 2\nexit 1\n");
  chmodSync(slowGit, 0o755);
  fixture.env.CC_FOR_CODEX_GIT_BIN = slowGit;
  const started = Date.now();

  const result = fixture.run(["review", "--timeout-seconds", "1", "--json"]);
  assert.equal(result.status, 124);
  assert.ok(Date.now() - started < 3_000, "Git preflight must not receive a fresh timeout");
  assert.match(result.stderr, /timed out/u);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("--json-schema")), false);
  fixture.cleanup();
  rmSync(helperDir, { recursive: true, force: true });
});

test("multi-step repository preflight shares one outer command deadline", () => {
  const fixture = makeFixture();
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, "README.md"), "# fixture\n");
  git(fixture.cwd, ["add", "README.md"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  const helperDir = mkdtempSync(join(tmpdir(), "ccfc-slow-success-git-"));
  const slowGit = join(helperDir, "git");
  writeFileSync(slowGit, "#!/bin/sh\nsleep 0.3\nexec /usr/bin/git \"$@\"\n");
  chmodSync(slowGit, 0o755);
  fixture.env.CC_FOR_CODEX_GIT_BIN = slowGit;
  const started = Date.now();

  const result = fixture.run(["ask", "--timeout-seconds", "1", "inspect"]);
  const elapsed = Date.now() - started;
  assert.equal(result.status, 124, result.stderr);
  assert.ok(elapsed < 2_500, `repository preflight exceeded its shared deadline (${elapsed} ms)`);
  assert.match(result.stderr, /timed out/u);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("-p")), false);
  fixture.cleanup();
  rmSync(helperDir, { recursive: true, force: true });
});

test("review supports explicit foreground and guarded background modes", () => {
  const fixture = makeFixture();
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, "app.js"), "export const value = 1;\n");
  git(fixture.cwd, ["add", "app.js"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  writeFileSync(join(fixture.cwd, "app.js"), "export const value = 2;\n");

  const denied = fixture.run(["review", "--background"]);
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /unbounded-usage/u);

  const dataDenied = fixture.run([
    "review",
    "--background",
    "--confirm-background",
    "unbounded-usage",
  ]);
  assert.notEqual(dataDenied.status, 0);
  assert.match(dataDenied.stderr, /process-visible-prompt/u);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("--bg")), false);

  const background = fixture.run([
    "adversarial-review",
    "--background",
    "--confirm-background",
    "unbounded-usage",
    "--confirm-background-data",
    "process-visible-prompt",
    "race conditions",
  ]);
  assert.equal(background.status, 0, background.stderr);
  const report = JSON.parse(background.stdout);
  assert.equal(report.kind, "background-review");
  assert.equal(report.mode, "adversarial");
  const backgroundCall = fixture.calls().find((entry) => entry.args.includes("--bg"));
  assert.ok(backgroundCall);
  assertProfile(backgroundCall.args, { write: false, textOnly: true });
  assert.equal(backgroundCall.args.filter((arg) => arg === "--name").length, 1);
  assert.equal(backgroundCall.args.at(-2), "--bg");
  assert.match(backgroundCall.args.at(-1), /race conditions/u);

  const foreground = fixture.run(["review", "--wait", "--json"]);
  assert.equal(foreground.status, 0, foreground.stderr);
  fixture.cleanup();
});

test("all guarded model launches reject executable Git diff configuration", () => {
  for (const config of [
    ["diff.external", "external"],
    ["diff.evil.textconv", "textconv"],
    ["diff.evil.command", "driver-command"],
  ]) {
    const fixture = makeFixture({ FAKE_CLAUDE_RUN_GIT_DIFF: "1" });
    const helpers = mkdtempSync(join(tmpdir(), "ccfc-diff-helper-"));
    const sentinel = join(helpers, `${config[1]}-ran`);
    const helper = join(helpers, "helper.sh");
    writeFileSync(helper, `#!/bin/sh\n: > "${sentinel}"\nexit 0\n`);
    chmodSync(helper, 0o755);
    initGitRepo(fixture.cwd);
    writeFileSync(join(fixture.cwd, "app.js"), "export const value = 1;\n");
    git(fixture.cwd, ["add", "app.js"]);
    git(fixture.cwd, ["commit", "-m", "initial"]);
    writeFileSync(join(fixture.cwd, "app.js"), "export const value = 2;\n");
    git(fixture.cwd, ["config", config[0], helper]);

    for (const args of [
      ["ask", "inspect"],
      ["review", "--json"],
      ["delegate", "inspect"],
      [
        "ultrareview",
        "main",
        "--confirm-cloud-review",
        "upload-and-billing",
      ],
    ]) {
      const result = fixture.run(args);
      assert.notEqual(result.status, 0, `${config[0]} unexpectedly allowed ${args[0]}`);
      assert.match(result.stderr, /executable Git diff\/textconv configuration/u);
      assert.equal(existsSync(sentinel), false);
    }
    assert.equal(fixture.calls().some((entry) => entry.args.includes("-p")), false);
    fixture.cleanup();
    rmSync(helpers, { recursive: true, force: true });
  }
});

test("write delegation rejects repository includes that can activate in its generated worktree", () => {
  for (const condition of [
    "includeIf.onbranch:worktree-*.path",
    "includeIf.gitdir:**/.claude/worktrees/**.path",
  ]) {
    const fixture = makeFixture({ FAKE_CLAUDE_RUN_GIT_DIFF: "1" });
    const helpers = mkdtempSync(join(tmpdir(), "ccfc-conditional-include-"));
    const sentinel = join(helpers, "conditional-helper-ran");
    const helper = join(helpers, "helper.sh");
    writeFileSync(helper, `#!/bin/sh\n: > "${sentinel}"\n/bin/cat\n`);
    chmodSync(helper, 0o755);
    initGitRepo(fixture.cwd);
    writeFileSync(join(fixture.cwd, ".gitattributes"), "*.payload filter=unspecified diff=conditional\n");
    writeFileSync(join(fixture.cwd, "data.payload"), "payload\n");
    git(fixture.cwd, ["add", ".gitattributes", "data.payload"]);
    git(fixture.cwd, ["commit", "-m", "initial"]);
    writeFileSync(
      join(fixture.cwd, ".git", "conditional.inc"),
      `[filter "unspecified"]\n\tclean = ${helper}\n\tsmudge = ${helper}\n\tprocess = ${helper}\n[diff]\n\texternal = ${helper}\n`,
    );
    git(fixture.cwd, ["config", condition, "conditional.inc"]);

    const result = fixture.run([
      "delegate",
      "--write",
      "--write-permissions",
      "guarded",
      "--confirm-write",
      "isolated-worktree",
      "change one file",
    ]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /refuses repository Git include\/includeIf configuration/u);
    assert.equal(existsSync(sentinel), false);
    assert.equal(fixture.calls().some((entry) => entry.args.includes("--worktree")), false);
    fixture.cleanup();
    rmSync(helpers, { recursive: true, force: true });
  }
});

test("all guarded model launches reject filters in initialized submodules", () => {
  const fixture = makeFixture({ FAKE_CLAUDE_RUN_GIT_STATUS: "1" });
  const source = mkdtempSync(join(tmpdir(), "ccfc-filtered-submodule-source-"));
  const helpers = mkdtempSync(join(tmpdir(), "ccfc-filtered-submodule-helper-"));
  const sentinel = join(helpers, "nested-filter-ran");
  const filter = join(helpers, "filter.sh");
  writeFileSync(filter, `#!/bin/sh\n: > "${sentinel}"\n/bin/cat\n`);
  chmodSync(filter, 0o755);

  initGitRepo(source);
  writeFileSync(join(source, ".gitattributes"), "*.payload filter=evil\n");
  writeFileSync(join(source, "data.payload"), "first-value\n");
  git(source, ["add", ".gitattributes", "data.payload"]);
  git(source, ["commit", "-m", "initial"]);

  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, "README.md"), "# fixture\n");
  git(fixture.cwd, ["add", "README.md"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  git(fixture.cwd, [
    "-c",
    "protocol.file.allow=always",
    "submodule",
    "add",
    "-q",
    source,
    "vendor/child",
  ]);
  git(fixture.cwd, ["commit", "-m", "add submodule"]);

  const child = join(fixture.cwd, "vendor", "child");
  git(child, ["config", "filter.evil.clean", filter]);
  git(child, ["config", "filter.evil.smudge", filter]);
  git(child, ["config", "filter.evil.required", "true"]);
  writeFileSync(join(child, "data.payload"), "other-value\n");
  rmSync(sentinel, { force: true });

  const commands = [
    ["ask", "inspect"],
    ["review", "--json"],
    ["delegate", "inspect"],
    [
      "ultrareview",
      "main",
      "--confirm-cloud-review",
      "upload-and-billing",
    ],
  ];
  for (const args of commands) {
    const result = fixture.run(args);
    assert.notEqual(result.status, 0, `${args[0]} unexpectedly launched: ${result.stderr}`);
    assert.match(result.stderr, /tracked files with Git content filters.*vendor\/child/u);
    assert.equal(existsSync(sentinel), false, `${args[0]} executed the nested filter`);
  }
  assert.equal(fixture.calls().some((entry) => entry.args.includes("-p")), false);
  assert.equal(fixture.calls().some((entry) => entry.args[0] === "ultrareview"), false);

  fixture.cleanup();
  rmSync(source, { recursive: true, force: true });
  rmSync(helpers, { recursive: true, force: true });
});

test("ultrareview requires explicit cloud consent and always forces no-post", () => {
  const fixture = makeFixture();
  initGitRepo(fixture.cwd);
  const denied = fixture.run(["ultrareview", "main"]);
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /upload-and-billing/u);

  const allowed = fixture.run([
    "ultrareview",
    "main",
    "--timeout-minutes",
    "9",
    "--confirm-cloud-review",
    "upload-and-billing",
  ]);
  assert.equal(allowed.status, 0, allowed.stderr);
  const call = fixture.calls().find((entry) => entry.args[0] === "ultrareview" && entry.args.includes("--json"));
  assert.deepEqual(call.args, ["ultrareview", "main", "--json", "--no-post", "--timeout", "9"]);
  assert.equal(call.args.includes("--post"), false);
  fixture.cleanup();
});

test("ultrareview refuses to launch when no-post capability is unavailable", () => {
  const fixture = makeFixture({ FAKE_CLAUDE_HIDE_ULTRA_NO_POST: "1" });
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, "README.md"), "# fixture\n");
  git(fixture.cwd, ["add", "README.md"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);

  const result = fixture.run([
    "ultrareview",
    "main",
    "--confirm-cloud-review",
    "upload-and-billing",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /lacks required ultrareview controls \(--no-post\)/u);
  assert.equal(
    fixture.calls().some((entry) => entry.args[0] === "ultrareview" && entry.args.includes("--json")),
    false,
  );
  fixture.cleanup();
});

test("ultrareview neutralizes Git startup helpers and refuses tracked content filters", () => {
  const fixture = makeFixture({ FAKE_CLAUDE_RUN_GIT_STATUS: "1" });
  const helpers = mkdtempSync(join(tmpdir(), "ccfc-ultrareview-helpers-"));
  const fsmonitorSentinel = join(helpers, "fsmonitor-ran");
  const fsmonitor = join(helpers, "fsmonitor.sh");
  writeFileSync(fsmonitor, `#!/bin/sh\n: > "${fsmonitorSentinel}"\nexit 0\n`);
  chmodSync(fsmonitor, 0o755);
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, "README.md"), "# fixture\n");
  git(fixture.cwd, ["add", "README.md"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  git(fixture.cwd, ["config", "core.fsmonitor", fsmonitor]);

  const safe = fixture.run([
    "ultrareview",
    "main",
    "--confirm-cloud-review",
    "upload-and-billing",
  ]);
  assert.equal(safe.status, 0, safe.stderr);
  assert.equal(existsSync(fsmonitorSentinel), false);

  writeFileSync(join(fixture.cwd, ".gitattributes"), "*.payload filter=evil\n");
  writeFileSync(join(fixture.cwd, "data.payload"), "payload\n");
  git(fixture.cwd, ["add", ".gitattributes", "data.payload"]);
  git(fixture.cwd, ["commit", "-m", "add filter"]);
  const blocked = fixture.run([
    "ultrareview",
    "main",
    "--confirm-cloud-review",
    "upload-and-billing",
  ]);
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /tracked files with Git content filters/u);
  assert.equal(
    fixture.calls().filter((entry) => entry.args[0] === "ultrareview" && entry.args.includes("--json")).length,
    1,
  );
  fixture.cleanup();
  rmSync(helpers, { recursive: true, force: true });
});

test("write delegation is isolated, file-only, dangerous by default, and configurable", () => {
  const fixture = makeFixture();
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, "README.md"), "# fixture\n");
  git(fixture.cwd, ["add", "README.md"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  writeFileSync(join(fixture.cwd, ".worktreeinclude"), ".env\n");

  const missingWriteConfirm = fixture.run(["delegate", "--write", "fix it"]);
  assert.notEqual(missingWriteConfirm.status, 0);

  const includeDenied = fixture.run([
    "delegate",
    "--write",
    "--confirm-write",
    "isolated-worktree",
    "fix it",
  ]);
  assert.notEqual(includeDenied.status, 0);
  assert.match(includeDenied.stderr, /worktreeinclude/u);

  const dangerousDenied = fixture.run([
    "delegate",
    "--write",
    "--confirm-write",
    "isolated-worktree",
    "--confirm-worktree-include",
    "copy-ignored-files",
    "fix it",
  ]);
  assert.notEqual(dangerousDenied.status, 0);
  assert.match(dangerousDenied.stderr, /confirm-dangerous-permissions/u);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("--worktree")), false);

  const allowed = fixture.run([
    "delegate",
    "--write",
    "--confirm-write",
    "isolated-worktree",
    "--confirm-worktree-include",
    "copy-ignored-files",
    "--confirm-dangerous-permissions",
    "bypass-host-safety",
    "--json",
    "fix it",
  ]);
  assert.equal(allowed.status, 0, allowed.stderr);
  const delegated = JSON.parse(allowed.stdout);
  const call = fixture.calls().find((entry) => entry.args.includes("--worktree"));
  assert.ok(call);
  assertProfile(call.args, { write: true });
  assert.equal(delegated.writePermissions, "dangerous");
  assert.match(delegated.warning, /not an OS sandbox/u);
  assert.match(call.args[call.args.indexOf("--worktree") + 1], /^ccfc-[0-9]+-[0-9a-f]{6}$/u);
  assert.match(call.args[call.args.indexOf("--settings") + 1], /"baseRef":"head"/u);
  assert.equal(delegated.worktree.name, call.args[call.args.indexOf("--worktree") + 1]);
  assert.equal(delegated.worktree.branch, `worktree-${delegated.worktree.name}`);
  assert.equal(delegated.worktree.path.endsWith(`/.claude/worktrees/${delegated.worktree.name}`), true);

  const guarded = fixture.run([
    "delegate",
    "--write",
    "--write-permissions",
    "guarded",
    "--confirm-write",
    "isolated-worktree",
    "--confirm-worktree-include",
    "copy-ignored-files",
    "--json",
    "fix another thing",
  ]);
  assert.equal(guarded.status, 0, guarded.stderr);
  const guardedReport = JSON.parse(guarded.stdout);
  const guardedCall = fixture.calls().filter((entry) => entry.args.includes("--worktree")).at(-1);
  assertProfile(guardedCall.args, { write: true, dangerous: false });
  assert.equal(guardedReport.writePermissions, "guarded");
  assert.equal(guardedReport.warning, undefined);

  const plain = fixture.run([
    "delegate",
    "--write",
    "--confirm-write",
    "isolated-worktree",
    "--confirm-worktree-include",
    "copy-ignored-files",
    "--confirm-dangerous-permissions",
    "bypass-host-safety",
    "fix a third thing",
  ]);
  assert.equal(plain.status, 0, plain.stderr);
  assert.match(plain.stderr, /Claude worktree: .*\.claude\/worktrees\/ccfc-/u);
  assert.match(plain.stderr, /Claude branch: worktree-ccfc-/u);
  assert.match(plain.stderr, /Claude base HEAD: [0-9a-f]{40,64}/u);
  assert.match(plain.stderr, /Write permissions: dangerous/u);
  assert.match(plain.stderr, /Warning: Dangerous write permissions bypass/u);
  fixture.cleanup();
});

test("delegate rejects ignored profile options and invalid write-permission configuration", () => {
  const fixture = makeFixture();
  const ignoredProfile = fixture.run([
    "delegate",
    "--profile",
    "native",
    "--confirm-native-profile",
    "load-local-customizations",
    "inspect",
  ]);
  assert.notEqual(ignoredProfile.status, 0);
  assert.match(ignoredProfile.stderr, /fixed read\/write profiles/u);

  const invalidWritePermissions = fixture.run([
    "delegate",
    "--write",
    "--write-permissions",
    "anything",
    "--confirm-write",
    "isolated-worktree",
    "change",
  ]);
  assert.notEqual(invalidWritePermissions.status, 0);
  assert.match(invalidWritePermissions.stderr, /dangerous.*guarded/u);

  const readOnlyWritePermissions = fixture.run([
    "delegate",
    "--write-permissions",
    "guarded",
    "inspect",
  ]);
  assert.notEqual(readOnlyWritePermissions.status, 0);
  assert.match(readOnlyWritePermissions.stderr, /valid only with --write/u);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("-p")), false);
  fixture.cleanup();
});

test("write delegation rejects a generated worktree based on the wrong commit", () => {
  const fixture = makeFixture();
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, "README.md"), "first\n");
  git(fixture.cwd, ["add", "README.md"]);
  git(fixture.cwd, ["commit", "-m", "first"]);
  const wrongBase = gitOutput(fixture.cwd, ["rev-parse", "HEAD"]);
  writeFileSync(join(fixture.cwd, "README.md"), "second\n");
  git(fixture.cwd, ["add", "README.md"]);
  git(fixture.cwd, ["commit", "-m", "second"]);
  fixture.env.FAKE_CLAUDE_WORKTREE_BASE = wrongBase;

  const result = fixture.run([
    "delegate",
    "--write",
    "--confirm-write",
    "isolated-worktree",
    "--confirm-dangerous-permissions",
    "bypass-host-safety",
    "change one file",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /failed|could not be uniquely verified/u);
  assert.match(result.stderr, /worktree may remain/iu);
  fixture.cleanup();
});

test("write delegation rejects stale metadata for a missing generated worktree", () => {
  const fixture = makeFixture({ FAKE_CLAUDE_REMOVE_WORKTREE_AFTER_CREATE: "1" });
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, "README.md"), "baseline\n");
  git(fixture.cwd, ["add", "README.md"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);

  const result = fixture.run([
    "delegate",
    "--write",
    "--write-permissions",
    "guarded",
    "--confirm-write",
    "isolated-worktree",
    "change one file",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing|could not be uniquely verified/u);
  fixture.cleanup();
});

test("background write launch failure reports its verified worktree and job id", () => {
  const fixture = makeFixture({ FAKE_CLAUDE_BACKGROUND_EXIT_AFTER_WORKTREE: "1" });
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, "README.md"), "# fixture\n");
  git(fixture.cwd, ["add", "README.md"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);

  const result = fixture.run([
    "delegate",
    "--background",
    "--write",
    "--write-permissions",
    "guarded",
    "--confirm-background",
    "unbounded-usage",
    "--confirm-background-data",
    "process-visible-prompt",
    "--confirm-write",
    "isolated-worktree",
    "change one file",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Verified worktree:/u);
  assert.match(result.stderr, /\.claude\/worktrees\/ccfc-/u);
  assert.match(result.stderr, /branch worktree-ccfc-/u);
  assert.match(result.stderr, /background job deadbeef/u);
  assert.doesNotMatch(result.stderr, /private background failure details/u);
  fixture.cleanup();
});

test("write worktree verification supports repository paths containing newlines", () => {
  const fixture = makeFixture();
  const repo = join(fixture.cwd, "repo\nline");
  mkdirSync(repo);
  initGitRepo(repo);
  writeFileSync(join(repo, "README.md"), "# fixture\n");
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "-m", "initial"]);

  const result = fixture.run([
    "delegate",
    "--cwd",
    repo,
    "--write",
    "--write-permissions",
    "guarded",
    "--confirm-write",
    "isolated-worktree",
    "--json",
    "change one file",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.worktree.path.startsWith(`${realpathSync(repo)}/.claude/worktrees/ccfc-`), true);
  assert.match(report.worktree.branch, /^worktree-ccfc-/u);
  fixture.cleanup();
});

test("write delegation rejects symlinked worktree ancestry before launch", { skip: process.platform === "win32" }, () => {
  for (const level of [".claude", ".claude/worktrees"]) {
    const fixture = makeFixture();
    const outside = mkdtempSync(join(tmpdir(), "ccfc-worktree-outside-"));
    initGitRepo(fixture.cwd);
    writeFileSync(join(fixture.cwd, "README.md"), "# fixture\n");
    git(fixture.cwd, ["add", "README.md"]);
    git(fixture.cwd, ["commit", "-m", "initial"]);
    if (level === ".claude") {
      symlinkSync(outside, join(fixture.cwd, ".claude"), "dir");
    } else {
      mkdirSync(join(fixture.cwd, ".claude"));
      symlinkSync(outside, join(fixture.cwd, ".claude", "worktrees"), "dir");
    }

    const result = fixture.run([
      "delegate",
      "--write",
      "--write-permissions",
      "guarded",
      "--confirm-write",
      "isolated-worktree",
      "--json",
      "change one file",
    ]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /refuses a symlink, non-directory, or repository-external/u);
    assert.equal(fixture.calls().some((entry) => entry.args.includes("--worktree")), false);
    assert.deepEqual(readdirSync(outside), []);
    fixture.cleanup();
    rmSync(outside, { recursive: true, force: true });
  }
});

test("write delegation neutralizes checkout hooks", () => {
  const fixture = makeFixture();
  const helpers = mkdtempSync(join(tmpdir(), "ccfc-git-write-helpers-"));
  const hooks = join(helpers, "hooks");
  mkdirSync(hooks);
  const hookSentinel = join(helpers, "post-checkout-ran");
  const postCheckout = join(hooks, "post-checkout");
  writeFileSync(postCheckout, `#!/bin/sh\n: > "${hookSentinel}"\nexit 0\n`);
  chmodSync(postCheckout, 0o755);

  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, "README.md"), "# fixture\n");
  git(fixture.cwd, ["add", "README.md"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  git(fixture.cwd, ["config", "core.hooksPath", hooks]);

  const result = fixture.run([
    "delegate",
    "--write",
    "--confirm-write",
    "isolated-worktree",
    "--confirm-dangerous-permissions",
    "bypass-host-safety",
    "--json",
    "change one file",
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(hookSentinel), false);
  fixture.cleanup();
  rmSync(helpers, { recursive: true, force: true });
});

test("guarded review and write delegation refuse tracked Git content filters", () => {
  const fixture = makeFixture();
  const helpers = mkdtempSync(join(tmpdir(), "ccfc-git-filter-helpers-"));
  const sentinel = join(helpers, "filter-ran");
  const filter = join(helpers, "filter.sh");
  writeFileSync(filter, `#!/bin/sh\n: > "${sentinel}"\n/bin/cat\n`);
  chmodSync(filter, 0o755);
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, ".gitattributes"), "*.payload filter=evil\n");
  writeFileSync(join(fixture.cwd, "data.payload"), "payload\n");
  git(fixture.cwd, ["add", ".gitattributes", "data.payload"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  git(fixture.cwd, ["config", "filter.evil.clean", filter]);
  git(fixture.cwd, ["config", "filter.evil.smudge", filter]);
  git(fixture.cwd, ["config", "filter.evil.required", "true"]);
  writeFileSync(join(fixture.cwd, "data.payload"), "changed\n");

  const askResult = fixture.run(["ask", "inspect"]);
  assert.notEqual(askResult.status, 0);
  assert.match(askResult.stderr, /tracked files with Git content filters/u);

  const readDelegateResult = fixture.run(["delegate", "inspect"]);
  assert.notEqual(readDelegateResult.status, 0);
  assert.match(readDelegateResult.stderr, /tracked files with Git content filters/u);

  const reviewResult = fixture.run(["review", "--json"]);
  assert.notEqual(reviewResult.status, 0);
  assert.match(reviewResult.stderr, /tracked files with Git content filters/u);
  assert.equal(existsSync(sentinel), false);

  const writeResult = fixture.run([
    "delegate",
    "--write",
    "--confirm-write",
    "isolated-worktree",
    "--confirm-dangerous-permissions",
    "bypass-host-safety",
    "change one file",
  ]);
  assert.notEqual(writeResult.status, 0);
  assert.match(writeResult.stderr, /tracked files with Git content filters/u);
  assert.equal(existsSync(sentinel), false);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("--worktree") || entry.args.includes("-p")), false);
  fixture.cleanup();
  rmSync(helpers, { recursive: true, force: true });
});

test("guarded review and write detect filters introduced by working-tree attributes", () => {
  const fixture = makeFixture();
  const helpers = mkdtempSync(join(tmpdir(), "ccfc-working-filter-"));
  const sentinel = join(helpers, "filter-ran");
  const filter = join(helpers, "filter.sh");
  writeFileSync(filter, `#!/bin/sh\n: > "${sentinel}"\n/bin/cat\n`);
  chmodSync(filter, 0o755);
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, ".gitattributes"), "# initially safe\n");
  writeFileSync(join(fixture.cwd, "data.payload"), "baseline\n");
  git(fixture.cwd, ["add", ".gitattributes", "data.payload"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  git(fixture.cwd, ["config", "filter.evil.clean", filter]);
  git(fixture.cwd, ["config", "filter.evil.smudge", filter]);
  git(fixture.cwd, ["config", "filter.evil.required", "true"]);
  writeFileSync(join(fixture.cwd, ".gitattributes"), "*.payload filter=evil\n");
  writeFileSync(join(fixture.cwd, "data.payload"), "changed\n");

  const reviewResult = fixture.run(["review", "--json"]);
  assert.notEqual(reviewResult.status, 0);
  assert.match(reviewResult.stderr, /tracked files with Git content filters/u);
  assert.equal(existsSync(sentinel), false);

  const writeResult = fixture.run([
    "delegate",
    "--write",
    "--confirm-write",
    "isolated-worktree",
    "--confirm-dangerous-permissions",
    "bypass-host-safety",
    "change one file",
  ]);
  assert.notEqual(writeResult.status, 0);
  assert.match(writeResult.stderr, /tracked files with Git content filters/u);
  assert.equal(existsSync(sentinel), false);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("--worktree")), false);
  fixture.cleanup();
  rmSync(helpers, { recursive: true, force: true });
});

test("filter preflight includes HEAD paths deleted from the index and recreated in the worktree", () => {
  const fixture = makeFixture({ FAKE_CLAUDE_RUN_GIT_DIFF: "1" });
  const helpers = mkdtempSync(join(tmpdir(), "ccfc-recreated-filter-"));
  const sentinel = join(helpers, "filter-ran");
  const filter = join(helpers, "filter.sh");
  writeFileSync(filter, `#!/bin/sh\n: > "${sentinel}"\n/bin/cat\n`);
  chmodSync(filter, 0o755);
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, ".gitattributes"), "# safe\n");
  writeFileSync(join(fixture.cwd, "data.payload"), "first-value\n");
  git(fixture.cwd, ["add", ".gitattributes", "data.payload"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  git(fixture.cwd, ["rm", "--cached", "data.payload"]);
  git(fixture.cwd, ["config", "filter.evil.clean", filter]);
  git(fixture.cwd, ["config", "filter.evil.required", "true"]);
  writeFileSync(join(fixture.cwd, ".gitattributes"), "data.payload filter=evil\n");
  writeFileSync(join(fixture.cwd, "data.payload"), "other-value\n");

  for (const args of [["ask", "inspect"], ["review", "--json"], ["delegate", "inspect"]]) {
    const result = fixture.run(args);
    assert.notEqual(result.status, 0, `${args[0]} unexpectedly launched`);
    assert.match(result.stderr, /tracked files with Git content filters/u);
    assert.equal(existsSync(sentinel), false);
  }
  assert.equal(fixture.calls().some((entry) => entry.args.includes("-p")), false);
  fixture.cleanup();
  rmSync(helpers, { recursive: true, force: true });
});

test("filter preflight rejects the ambiguous literal driver name unspecified", () => {
  const fixture = makeFixture({ FAKE_CLAUDE_RUN_GIT_STATUS: "1" });
  const helpers = mkdtempSync(join(tmpdir(), "ccfc-unspecified-filter-"));
  const sentinel = join(helpers, "filter-ran");
  const filter = join(helpers, "filter.sh");
  writeFileSync(filter, `#!/bin/sh\n: > "${sentinel}"\n/bin/cat\n`);
  chmodSync(filter, 0o755);
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, ".gitattributes"), "*.payload filter=unspecified\n");
  writeFileSync(join(fixture.cwd, "data.payload"), "first-value\n");
  git(fixture.cwd, ["add", ".gitattributes", "data.payload"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  git(fixture.cwd, ["config", "filter.unspecified.clean", filter]);
  git(fixture.cwd, ["config", "filter.unspecified.required", "true"]);
  writeFileSync(join(fixture.cwd, "data.payload"), "other-value\n");

  const result = fixture.run(["ask", "inspect"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /filter configuration named 'unspecified'/u);
  assert.equal(existsSync(sentinel), false);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("-p")), false);
  fixture.cleanup();
  rmSync(helpers, { recursive: true, force: true });
});

test("write delegation detects filters in HEAD after staged attribute deletion", () => {
  const fixture = makeFixture();
  const helpers = mkdtempSync(join(tmpdir(), "ccfc-head-filter-"));
  const sentinel = join(helpers, "filter-ran");
  const filter = join(helpers, "filter.sh");
  writeFileSync(filter, `#!/bin/sh\n: > "${sentinel}"\n/bin/cat\n`);
  chmodSync(filter, 0o755);
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, ".gitattributes"), "*.payload filter=evil\n");
  writeFileSync(join(fixture.cwd, "data.payload"), "baseline\n");
  git(fixture.cwd, ["add", ".gitattributes", "data.payload"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  git(fixture.cwd, ["config", "filter.evil.clean", filter]);
  git(fixture.cwd, ["config", "filter.evil.smudge", filter]);
  git(fixture.cwd, ["config", "filter.evil.required", "true"]);
  git(fixture.cwd, ["rm", "-q", ".gitattributes"]);
  rmSync(sentinel, { force: true });

  const result = fixture.run([
    "delegate",
    "--write",
    "--confirm-write",
    "isolated-worktree",
    "--confirm-dangerous-permissions",
    "bypass-host-safety",
    "change one file",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /tracked files with Git content filters/u);
  assert.equal(existsSync(sentinel), false);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("--worktree")), false);
  fixture.cleanup();
  rmSync(helpers, { recursive: true, force: true });
});

test("guarded review and write reject partial-clone config reached through a local include", () => {
  const fixture = makeFixture();
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, "README.md"), "# fixture\n");
  git(fixture.cwd, ["add", "README.md"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  const includedConfig = join(fixture.cwd, ".git", "partial-clone.inc");
  writeFileSync(
    includedConfig,
    '[extensions]\n\tpartialClone = origin\n[remote "origin"]\n\tpromisor = true\n\tpartialCloneFilter = blob:none\n',
  );
  git(fixture.cwd, ["config", "--local", "include.path", includedConfig]);
  writeFileSync(join(fixture.cwd, "README.md"), "# changed\n");

  const reviewResult = fixture.run(["review", "--json"]);
  assert.notEqual(reviewResult.status, 0);
  assert.match(reviewResult.stderr, /partial or promisor repositories/u);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("--json-schema")), false);

  const writeResult = fixture.run([
    "delegate",
    "--write",
    "--confirm-write",
    "isolated-worktree",
    "--confirm-dangerous-permissions",
    "bypass-host-safety",
    "change one file",
  ]);
  assert.notEqual(writeResult.status, 0);
  assert.match(writeResult.stderr, /partial or promisor repositories/u);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("--worktree")), false);
  fixture.cleanup();
});

test("guarded review and write reject worktree-scoped promisor configuration", () => {
  const fixture = makeFixture();
  const linkedParent = mkdtempSync(join(tmpdir(), "ccfc-promisor-worktree-"));
  const linked = join(linkedParent, "linked");
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, "README.md"), "# fixture\n");
  git(fixture.cwd, ["add", "README.md"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  git(fixture.cwd, ["config", "extensions.worktreeConfig", "true"]);
  git(fixture.cwd, ["worktree", "add", "-q", linked]);
  git(linked, ["config", "--worktree", "remote.origin.promisor", "true"]);

  const reviewResult = fixture.run(["review", "--cwd", linked, "--json"]);
  assert.notEqual(reviewResult.status, 0);
  assert.match(reviewResult.stderr, /partial or promisor repositories/u);

  const writeResult = fixture.run([
    "delegate",
    "--cwd",
    linked,
    "--write",
    "--confirm-write",
    "isolated-worktree",
    "--confirm-dangerous-permissions",
    "bypass-host-safety",
    "change one file",
  ]);
  assert.notEqual(writeResult.status, 0);
  assert.match(writeResult.stderr, /partial or promisor repositories/u);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("--json-schema") || entry.args.includes("--worktree")), false);
  git(fixture.cwd, ["worktree", "remove", "-f", linked]);
  fixture.cleanup();
  rmSync(linkedParent, { recursive: true, force: true });
});

test("review omits initialized submodule contents and reports partial evidence", () => {
  const fixture = makeFixture();
  const source = mkdtempSync(join(tmpdir(), "ccfc-submodule-source-"));

  initGitRepo(source);
  writeFileSync(join(source, "data.payload"), "baseline\n");
  git(source, ["add", "data.payload"]);
  git(source, ["commit", "-m", "initial"]);
  initGitRepo(fixture.cwd);
  git(fixture.cwd, ["-c", "protocol.file.allow=always", "submodule", "add", "-q", source, "nested"]);
  git(fixture.cwd, ["commit", "-m", "add submodule"]);
  writeFileSync(join(fixture.cwd, "nested", "data.payload"), "changed in nested repo\n");

  const result = fixture.run(["review", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.scope.submodulesOmitted, true);
  assert.equal(report.scope.partialEvidence, true);
  const modelCall = fixture.calls().find((entry) => entry.args.includes("--json-schema"));
  assert.match(modelCall.stdin, /Submodules omitted: yes/u);
  assert.doesNotMatch(modelCall.stdin, /changed in nested repo/u);

  const narrowed = fixture.run(["review", "--path", "nested/data.payload", "--json"]);
  assert.equal(narrowed.status, 0, narrowed.stderr);
  const narrowedReport = JSON.parse(narrowed.stdout);
  assert.equal(narrowedReport.scope.submodulesOmitted, true);
  assert.equal(narrowedReport.scope.partialEvidence, true);
  const narrowedCall = fixture.calls().filter((entry) => entry.args.includes("--json-schema")).at(-1);
  assert.match(narrowedCall.stdin, /Submodules omitted: yes/u);
  assert.doesNotMatch(narrowedCall.stdin, /changed in nested repo/u);
  fixture.cleanup();
  rmSync(source, { recursive: true, force: true });
});

test("an unchanged submodule does not make an unrelated review or stop gate partial", () => {
  const fixture = makeFixture();
  const source = mkdtempSync(join(tmpdir(), "ccfc-clean-submodule-source-"));
  initGitRepo(source);
  writeFileSync(join(source, "data.txt"), "baseline\n");
  git(source, ["add", "data.txt"]);
  git(source, ["commit", "-m", "initial"]);
  initGitRepo(fixture.cwd);
  git(fixture.cwd, ["-c", "protocol.file.allow=always", "submodule", "add", "-q", source, "nested"]);
  writeFileSync(join(fixture.cwd, "README.md"), "before\n");
  git(fixture.cwd, ["add", "README.md"]);
  git(fixture.cwd, ["commit", "-m", "baseline"]);
  writeFileSync(join(fixture.cwd, "README.md"), "after\n");

  const reviewResult = fixture.run(["review", "--json"]);
  assert.equal(reviewResult.status, 0, reviewResult.stderr);
  assert.equal(JSON.parse(reviewResult.stdout).scope.submodulesOmitted, false);
  assert.equal(JSON.parse(reviewResult.stdout).scope.partialEvidence, false);

  assert.equal(
    fixture.run([
      "review-gate",
      "enable",
      "--confirm-review-gate",
      "enable-billed-stop-review",
    ]).status,
    0,
  );
  const hookResult = fixture.run(
    ["hook-stop-review"],
    { input: JSON.stringify({ hook_event_name: "Stop", cwd: fixture.cwd }) },
  );
  assert.equal(hookResult.status, 0, hookResult.stderr);
  assert.equal(hookResult.stdout, "");
  fixture.cleanup();
  rmSync(source, { recursive: true, force: true });
});

test("review recognizes literal backslashes in POSIX submodule paths", { skip: process.platform === "win32" }, () => {
  const fixture = makeFixture();
  const source = mkdtempSync(join(tmpdir(), "ccfc-backslash-submodule-source-"));
  const submodulePath = "nested\\repo";
  initGitRepo(source);
  writeFileSync(join(source, "data.txt"), "baseline\n");
  git(source, ["add", "data.txt"]);
  git(source, ["commit", "-m", "initial"]);
  initGitRepo(fixture.cwd);
  git(fixture.cwd, ["-c", "protocol.file.allow=always", "submodule", "add", "-q", source, submodulePath]);
  git(fixture.cwd, ["commit", "-m", "add backslash submodule"]);
  writeFileSync(join(fixture.cwd, submodulePath, "data.txt"), "changed in nested repo\n");

  const result = fixture.run(["review", "--path", `${submodulePath}/data.txt`, "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.scope.submodulesOmitted, true);
  assert.equal(report.scope.partialEvidence, true);
  const modelCall = fixture.calls().find((entry) => entry.args.includes("--json-schema"));
  assert.match(modelCall.stdin, /Submodules omitted: yes/u);
  assert.doesNotMatch(modelCall.stdin, /changed in nested repo/u);
  fixture.cleanup();
  rmSync(source, { recursive: true, force: true });
});

test("review marks a staged submodule deletion as omitted evidence", () => {
  const fixture = makeFixture();
  const source = mkdtempSync(join(tmpdir(), "ccfc-deleted-submodule-source-"));
  initGitRepo(source);
  writeFileSync(join(source, "README.md"), "# nested\n");
  git(source, ["add", "README.md"]);
  git(source, ["commit", "-m", "initial"]);
  initGitRepo(fixture.cwd);
  git(fixture.cwd, ["-c", "protocol.file.allow=always", "submodule", "add", "-q", source, "nested"]);
  git(fixture.cwd, ["commit", "-m", "add submodule"]);
  git(fixture.cwd, ["rm", "-q", "-f", "nested"]);

  const result = fixture.run(["review", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.scope.submodulesOmitted, true);
  assert.equal(report.scope.partialEvidence, true);
  const modelCall = fixture.calls().find((entry) => entry.args.includes("--json-schema"));
  assert.match(modelCall.stdin, /Submodules omitted: yes/u);
  fixture.cleanup();
  rmSync(source, { recursive: true, force: true });
});

test("write delegation fails closed on control-bearing filter attributes", () => {
  const fixture = makeFixture();
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, ".gitattributes"), "*.payload filter=a\u001bb\n");
  writeFileSync(join(fixture.cwd, "data.payload"), "payload\n");
  git(fixture.cwd, ["add", ".gitattributes", "data.payload"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);

  const result = fixture.run([
    "delegate",
    "--write",
    "--confirm-write",
    "isolated-worktree",
    "--confirm-dangerous-permissions",
    "bypass-host-safety",
    "change one file",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unsupported filter attribute/u);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("--worktree")), false);
  fixture.cleanup();
});

test("failed write delegation reports any verified generated worktree", () => {
  const fixture = makeFixture({
    FAKE_CLAUDE_RESPONSE: JSON.stringify({
      type: "result",
      subtype: "error_max_turns",
      terminal_reason: "max_turns",
      is_error: true,
      result: "private partial edit details",
    }),
    FAKE_CLAUDE_EXIT: "1",
  });
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, "README.md"), "# fixture\n");
  git(fixture.cwd, ["add", "README.md"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);

  const result = fixture.run([
    "delegate",
    "--write",
    "--confirm-write",
    "isolated-worktree",
    "--confirm-dangerous-permissions",
    "bypass-host-safety",
    "change one file",
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Verified worktree:/u);
  assert.match(result.stderr, /\.claude\/worktrees\/ccfc-/u);
  assert.match(result.stderr, /branch worktree-ccfc-/u);
  assert.match(result.stderr, /git worktree list/u);
  assert.doesNotMatch(result.stderr, /private partial edit details/u);
  fixture.cleanup();
});

test("guarded Claude calls cannot rediscover a repository-local Git shim", () => {
  const fixture = makeFixture();
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, "README.md"), "# fixture\n");
  git(fixture.cwd, ["add", "README.md"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  const localBin = join(fixture.cwd, "bin");
  const outsideBin = mkdtempSync(join(tmpdir(), "ccfc-outside-bin-"));
  const sentinel = join(fixture.cwd, "repo-local-git-ran");
  mkdirSync(localBin);
  writeFileSync(
    join(localBin, "git"),
    `#!/bin/sh\n: > "${sentinel}"\nexit 91\n`,
  );
  chmodSync(join(localBin, "git"), 0o755);
  symlinkSync(join(localBin, "git"), join(outsideBin, "git"));
  fixture.env.PATH = `${outsideBin}:${localBin}:${fixture.env.PATH}`;

  const result = fixture.run([
    "delegate",
    "--write",
    "--confirm-write",
    "isolated-worktree",
    "--confirm-dangerous-permissions",
    "bypass-host-safety",
    "change one file",
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(sentinel), false);
  fixture.cleanup();
  rmSync(outsideBin, { recursive: true, force: true });
});

test("write delegation rejects an unborn repository before a model call", () => {
  const fixture = makeFixture();
  initGitRepo(fixture.cwd);
  const result = fixture.run([
    "delegate",
    "--write",
    "--confirm-write",
    "isolated-worktree",
    "fix it",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /at least one commit/u);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("--worktree")), false);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("-p")), false);
  fixture.cleanup();
});

test("write delegation rejects sparse-checkout repositories", () => {
  const fixture = makeFixture();
  initGitRepo(fixture.cwd);
  mkdirSync(join(fixture.cwd, "a"));
  mkdirSync(join(fixture.cwd, "b"));
  writeFileSync(join(fixture.cwd, "a", "x.txt"), "x\n");
  writeFileSync(join(fixture.cwd, "b", "y.txt"), "y\n");
  git(fixture.cwd, ["add", "a/x.txt", "b/y.txt"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  git(fixture.cwd, ["sparse-checkout", "set", "a"]);
  assert.equal(existsSync(join(fixture.cwd, "b", "y.txt")), false);

  const result = fixture.run([
    "delegate",
    "--write",
    "--confirm-write",
    "isolated-worktree",
    "--confirm-dangerous-permissions",
    "bypass-host-safety",
    "change one file",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /refuses sparse-checkout repositories/u);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("--worktree")), false);
  fixture.cleanup();
});

test("rescue supports explicit fresh and UUID resume routing", () => {
  const fixture = makeFixture({ FAKE_CLAUDE_JOB_STATE: "stopped" });
  const sessionId = "123e4567-e89b-42d3-a456-426614174000";
  const resumed = fixture.run(["rescue", "--resume", sessionId, "--json", "continue"]);
  assert.equal(resumed.status, 0, resumed.stderr);
  const resumedCall = fixture.calls().find((entry) => entry.args.includes("--resume"));
  assert.equal(resumedCall.args[resumedCall.args.indexOf("--resume") + 1], sessionId);
  assert.equal(resumedCall.args.includes("--no-session-persistence"), false);

  const fresh = fixture.run(["rescue", "--fresh", "--json", "start over"]);
  assert.equal(fresh.status, 0, fresh.stderr);
  const freshCall = fixture.calls().filter((entry) => entry.args.includes("-p")).at(-1);
  assert.equal(freshCall.args.includes("--resume"), false);
  assert.equal(freshCall.args.includes("--no-session-persistence"), true);

  const conflicting = fixture.run([
    "rescue",
    "--fresh",
    "--resume",
    sessionId,
    "continue",
  ]);
  assert.notEqual(conflicting.status, 0);
  assert.match(conflicting.stderr, /--fresh or --resume/u);
  fixture.cleanup();
});

test("background delegation requires usage acknowledgement and verifies its job", () => {
  const fixture = makeFixture();
  const denied = fixture.run(["delegate", "--background", "investigate"]);
  assert.notEqual(denied.status, 0);
  const dataDenied = fixture.run([
    "delegate",
    "--background",
    "--confirm-background",
    "unbounded-usage",
    "investigate",
  ]);
  assert.notEqual(dataDenied.status, 0);
  assert.match(dataDenied.stderr, /process-visible-prompt/u);
  const allowed = fixture.run([
    "delegate",
    "--background",
    "--confirm-background",
    "unbounded-usage",
    "--confirm-background-data",
    "process-visible-prompt",
    "investigate",
  ]);
  assert.equal(allowed.status, 0, allowed.stderr);
  const report = JSON.parse(allowed.stdout);
  assert.equal(report.session.id, "deadbeef");
  assert.match(report.warning, /no max-budget/u);

  const tooLarge = fixture.run(
    [
      "delegate",
      "--background",
      "--confirm-background",
      "unbounded-usage",
      "--confirm-background-data",
      "process-visible-prompt",
    ],
    { input: "x".repeat(70 * 1024) },
  );
  assert.notEqual(tooLarge.status, 0);
  assert.match(tooLarge.stderr, /cross-platform argv limit/u);
  fixture.cleanup();
});

test("background verification failures preserve the launched job recovery ID", () => {
  const fixture = makeFixture({ FAKE_CLAUDE_AGENTS_DELAY_MS: "2000" });
  const result = fixture.run([
    "delegate",
    "--background",
    "--timeout-seconds",
    "1",
    "--confirm-background",
    "unbounded-usage",
    "--confirm-background-data",
    "process-visible-prompt",
    "investigate",
  ]);
  assert.equal(result.status, 124);
  assert.match(result.stderr, /launch may have succeeded/u);
  assert.match(result.stderr, /deadbeef/u);
  assert.match(result.stderr, /stop deadbeef --confirm-stop stop:deadbeef/u);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("--bg")), true);
  fixture.cleanup();
});

test("all background launch failures preserve a printed recovery job ID", () => {
  for (const command of ["review", "delegate"]) {
    const fixture = makeFixture({ FAKE_CLAUDE_BACKGROUND_EXIT_AFTER_WORKTREE: "1" });
    initGitRepo(fixture.cwd);
    writeFileSync(join(fixture.cwd, "README.md"), "# fixture\n");
    git(fixture.cwd, ["add", "README.md"]);
    git(fixture.cwd, ["commit", "-m", "initial"]);
    const result = fixture.run([
      command,
      "--background",
      "--confirm-background",
      "unbounded-usage",
      "--confirm-background-data",
      "process-visible-prompt",
      "inspect",
    ]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /background job deadbeef/u);
    assert.match(result.stderr, /stop deadbeef --confirm-stop stop:deadbeef/u);
    assert.doesNotMatch(result.stderr, /private background failure details/u);
    fixture.cleanup();
  }
});

test("Gitless plain-directory background jobs remain listable and stoppable", () => {
  const fixture = makeFixture({ CC_FOR_CODEX_GIT_BIN: "/definitely/not/a/git-binary" });
  const started = fixture.run([
    "delegate",
    "--background",
    "--confirm-background",
    "unbounded-usage",
    "--confirm-background-data",
    "process-visible-prompt",
    "inspect",
  ]);
  assert.equal(started.status, 0, started.stderr);
  assert.equal(JSON.parse(started.stdout).session.id, "deadbeef");

  const status = fixture.run(["status", "--json"]);
  assert.equal(status.status, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout)[0].id, "deadbeef");
  const stopped = fixture.run([
    "stop",
    "deadbeef",
    "--confirm-stop",
    "stop:deadbeef",
    "--json",
  ]);
  assert.equal(stopped.status, 0, stopped.stderr);
  assert.match(JSON.parse(stopped.stdout).output, /stop ok for deadbeef/u);
  fixture.cleanup();
});

test("background write delegation launched from a subdirectory remains repo-scoped", () => {
  const fixture = makeFixture();
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, "README.md"), "# fixture\n");
  git(fixture.cwd, ["add", "README.md"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  const nested = join(fixture.cwd, "src");
  mkdirSync(nested);

  const launched = fixture.run([
    "delegate",
    "--cwd",
    nested,
    "--background",
    "--write",
    "--confirm-background",
    "unbounded-usage",
    "--confirm-background-data",
    "process-visible-prompt",
    "--confirm-write",
    "isolated-worktree",
    "--confirm-dangerous-permissions",
    "bypass-host-safety",
    "change one file",
  ]);
  assert.equal(launched.status, 0, launched.stderr);
  const session = JSON.parse(launched.stdout).session;
  assert.match(session.cwd, /\.claude\/worktrees\/ccfc-/u);

  const status = fixture.run(["status", "--cwd", nested, "--all", "--json"]);
  assert.equal(status.status, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).some((entry) => entry.id === "deadbeef"), true);

  const stopped = fixture.run([
    "stop",
    "deadbeef",
    "--cwd",
    nested,
    "--confirm-stop",
    "stop:deadbeef",
  ]);
  assert.equal(stopped.status, 0, stopped.stderr);
  fixture.cleanup();
});

test("session actions are scoped and destructive removal needs exact terminal-state confirmation", () => {
  const fixture = makeFixture({
    FAKE_CLAUDE_AGENTS: JSON.stringify([
      {
        id: "deadbeef",
        sessionId: "123e4567-e89b-42d3-a456-426614174000",
        state: "done",
        cwd: "__CWD__",
        startedAt: Date.now(),
      },
    ]),
  });
  fixture.env.FAKE_CLAUDE_AGENTS = fixture.env.FAKE_CLAUDE_AGENTS.replace("__CWD__", fixture.cwd);
  const denied = fixture.run(["remove", "deadbeef"]);
  assert.notEqual(denied.status, 0);
  const allowed = fixture.run(["remove", "deadbeef", "--confirm-remove", "remove:deadbeef", "--json"]);
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.equal(fixture.calls().some((call) => call.args.includes("--discard-unpushed")), false);

  const malformed = fixture.run(["logs", "../../bad"]);
  assert.notEqual(malformed.status, 0);
  fixture.cleanup();
});

test("respawn refuses repository filters before restarting a session", () => {
  const fixture = makeFixture({
    FAKE_CLAUDE_JOB_STATE: "stopped",
    FAKE_CLAUDE_RUN_GIT_STATUS: "1",
  });
  const helpers = mkdtempSync(join(tmpdir(), "ccfc-respawn-filter-"));
  const sentinel = join(helpers, "filter-ran");
  const filter = join(helpers, "filter.sh");
  writeFileSync(filter, `#!/bin/sh\n: > "${sentinel}"\n/bin/cat\n`);
  chmodSync(filter, 0o755);
  initGitRepo(fixture.cwd);
  writeFileSync(join(fixture.cwd, ".gitattributes"), "*.payload filter=evil\n");
  writeFileSync(join(fixture.cwd, "data.payload"), "payload\n");
  git(fixture.cwd, ["add", ".gitattributes", "data.payload"]);
  git(fixture.cwd, ["commit", "-m", "initial"]);
  git(fixture.cwd, ["config", "filter.evil.clean", filter]);
  git(fixture.cwd, ["config", "filter.evil.smudge", filter]);
  git(fixture.cwd, ["config", "filter.evil.required", "true"]);

  const result = fixture.run([
    "respawn",
    "deadbeef",
    "--confirm-respawn",
    "respawn:deadbeef",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /tracked files with Git content filters/u);
  assert.equal(existsSync(sentinel), false);
  assert.equal(fixture.calls().some((entry) => entry.args[0] === "respawn"), false);
  fixture.cleanup();
  rmSync(helpers, { recursive: true, force: true });
});

test("respawn accepts only an unambiguously stopped session", () => {
  for (const signals of [
    { state: "working" },
    { state: "blocked" },
    { state: "done" },
    { state: "failed" },
    { state: "stopped", status: "waiting" },
    { state: "stopped", waitingFor: "approval" },
  ]) {
    const fixture = makeFixture({
      FAKE_CLAUDE_AGENTS: JSON.stringify([
        { id: "deadbeef", cwd: "__CWD__", startedAt: Date.now(), ...signals },
      ]),
    });
    fixture.env.FAKE_CLAUDE_AGENTS = fixture.env.FAKE_CLAUDE_AGENTS.replace(
      "__CWD__",
      fixture.cwd,
    );
    const result = fixture.run([
      "respawn",
      "deadbeef",
      "--confirm-respawn",
      "respawn:deadbeef",
    ]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unambiguously stopped/u);
    assert.equal(fixture.calls().some((entry) => entry.args[0] === "respawn"), false);
    fixture.cleanup();
  }

  const stopped = makeFixture({ FAKE_CLAUDE_JOB_STATE: "stopped" });
  const allowed = stopped.run([
    "respawn",
    "deadbeef",
    "--confirm-respawn",
    "respawn:deadbeef",
  ]);
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.equal(stopped.calls().some((entry) => entry.args[0] === "respawn"), true);
  stopped.cleanup();
});

test("plain status rendering flattens untrusted agent metadata", () => {
  const fixture = makeFixture();
  fixture.env.FAKE_CLAUDE_AGENTS = JSON.stringify([
    {
      id: "deadbeef",
      state: "done\nP0 forged\tstate\u202e",
      name: "worker\nP0 forged name\u202e",
      cwd: fixture.cwd,
      startedAt: Date.now(),
    },
  ]);
  const result = fixture.run(["status", "--all"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("\u202e"), false);
  assert.doesNotMatch(result.stdout, /\nP0 forged/u);
  assert.equal(result.stdout.includes("\t"), false);
  assert.equal(result.stdout.trim().split("\n").length, 2);
  fixture.cleanup();
});

test("session scope cannot be redirected by inherited Git repository variables", () => {
  const fixture = makeFixture();
  const other = mkdtempSync(join(tmpdir(), "ccfc-session-redirect-"));
  initGitRepo(fixture.cwd);
  initGitRepo(other);
  writeFileSync(join(fixture.cwd, "README.md"), "# A\n");
  writeFileSync(join(other, "README.md"), "# B\n");
  git(fixture.cwd, ["add", "README.md"]);
  git(other, ["add", "README.md"]);
  git(fixture.cwd, ["commit", "-m", "A initial"]);
  git(other, ["commit", "-m", "B initial"]);
  fixture.env.GIT_DIR = join(other, ".git");
  fixture.env.GIT_WORK_TREE = other;
  fixture.env.FAKE_CLAUDE_AGENTS = JSON.stringify([
    {
      id: "deadbeef",
      state: "done",
      cwd: realpathSync(fixture.cwd),
      startedAt: Date.now(),
    },
  ]);

  const result = fixture.run(["logs", "deadbeef", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).session.id, "deadbeef");
  fixture.cleanup();
  rmSync(other, { recursive: true, force: true });
});

test(
  "cancelling Git scope discovery cannot fall through to session actions",
  { skip: process.platform === "win32", timeout: 8_000 },
  async () => {
    const fixture = makeFixture({
      FAKE_CLAUDE_AGENTS: JSON.stringify([
        {
          id: "deadbeef",
          state: "done",
          cwd: "__CWD__",
          startedAt: Date.now(),
        },
      ]),
    });
    initGitRepo(fixture.cwd);
    fixture.env.FAKE_CLAUDE_AGENTS = fixture.env.FAKE_CLAUDE_AGENTS.replace(
      "__CWD__",
      realpathSync(fixture.cwd),
    );
    const helperDir = mkdtempSync(join(tmpdir(), "ccfc-cancel-git-"));
    const ready = join(helperDir, "ready");
    const slowGit = join(helperDir, "git");
    writeFileSync(slowGit, `#!/bin/sh\n: > "${ready}"\nsleep 30\n`);
    chmodSync(slowGit, 0o755);
    fixture.env.CC_FOR_CODEX_GIT_BIN = slowGit;

    for (const args of [
      ["status", "--json"],
      ["remove", "deadbeef", "--confirm-remove", "remove:deadbeef", "--json"],
    ]) {
      rmSync(ready, { force: true });
      const child = spawn(process.execPath, [cli, ...args], {
        cwd: fixture.cwd,
        env: fixture.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stderr = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      for (let attempt = 0; attempt < 40 && !existsSync(ready); attempt += 1) {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
      }
      assert.equal(existsSync(ready), true, "slow Git helper should have started");
      child.kill("SIGTERM");
      const closed = await new Promise((resolvePromise, rejectPromise) => {
        child.once("error", rejectPromise);
        child.once("close", (code, signal) => resolvePromise({ code, signal }));
      });
      assert.equal(closed.code, 143);
      assert.equal(closed.signal, null);
      assert.match(stderr, /interrupted by SIGTERM/u);
    }
    assert.equal(fixture.calls().some((entry) => entry.args[0] === "rm"), false);
    fixture.cleanup();
    rmSync(helperDir, { recursive: true, force: true });
  },
);

test("active and cross-repository sessions cannot be removed", () => {
  const active = makeFixture();
  const activeResult = active.run([
    "remove",
    "deadbeef",
    "--confirm-remove",
    "remove:deadbeef",
  ]);
  assert.notEqual(activeResult.status, 0);
  assert.match(activeResult.stderr, /agent signal is active or non-terminal/u);
  active.cleanup();

  const contradictory = makeFixture();
  contradictory.env.FAKE_CLAUDE_AGENTS = JSON.stringify([
    {
      id: "deadbeef",
      state: "done",
      status: "running",
      pid: 4321,
      cwd: contradictory.cwd,
      startedAt: Date.now(),
    },
  ]);
  const contradictoryResult = contradictory.run([
    "remove",
    "deadbeef",
    "--confirm-remove",
    "remove:deadbeef",
  ]);
  assert.notEqual(contradictoryResult.status, 0);
  assert.match(contradictoryResult.stderr, /agent signal is active or non-terminal/u);
  assert.equal(contradictory.calls().some((entry) => entry.args[0] === "rm"), false);
  contradictory.cleanup();

  for (const unsafeSignals of [
    { status: "waiting" },
    { status: "starting" },
    { status: "unknown" },
    { waitingFor: "approval" },
    { pid: "4321" },
  ]) {
    const unsafe = makeFixture();
    unsafe.env.FAKE_CLAUDE_AGENTS = JSON.stringify([
      {
        id: "deadbeef",
        state: "done",
        cwd: unsafe.cwd,
        startedAt: Date.now(),
        ...unsafeSignals,
      },
    ]);
    const unsafeResult = unsafe.run([
      "remove",
      "deadbeef",
      "--confirm-remove",
      "remove:deadbeef",
    ]);
    assert.notEqual(unsafeResult.status, 0);
    assert.match(unsafeResult.stderr, /agent signal is active or non-terminal/u);
    assert.equal(unsafe.calls().some((entry) => entry.args[0] === "rm"), false);
    unsafe.cleanup();
  }

  const outside = makeFixture();
  const other = mkdtempSync(join(tmpdir(), "ccfc-other-"));
  outside.env.FAKE_CLAUDE_AGENTS = JSON.stringify([
    { id: "deadbeef", state: "done", cwd: other, startedAt: Date.now() },
  ]);
  const crossRepo = outside.run(["logs", "deadbeef"]);
  assert.notEqual(crossRepo.status, 0);
  assert.match(crossRepo.stderr, /not uniquely found/u);
  rmSync(other, { recursive: true, force: true });
  outside.cleanup();
});

test("terminal jobs remain manageable after a nested worktree directory disappears", () => {
  const fixture = makeFixture();
  const missingWorktree = join(fixture.cwd, ".claude", "worktrees", "already-gone");
  fixture.env.FAKE_CLAUDE_AGENTS = JSON.stringify([
    {
      id: "deadbeef",
      state: "done",
      cwd: missingWorktree,
      startedAt: Date.now(),
    },
  ]);
  const result = fixture.run([
    "remove",
    "deadbeef",
    "--confirm-remove",
    "remove:deadbeef",
    "--json",
  ]);
  assert.equal(result.status, 0, result.stderr);
  fixture.cleanup();
});

test("remove reports when Claude keeps a protected worktree", () => {
  const fixture = makeFixture({
    FAKE_CLAUDE_JOB_STATE: "done",
    FAKE_CLAUDE_RM_KEEPS: "1",
    FAKE_CLAUDE_ACTION_OUTPUT: "kept deadbeef: has commits that are not pushed anywhere",
  });
  const result = fixture.run([
    "remove",
    "deadbeef",
    "--confirm-remove",
    "remove:deadbeef",
    "--json",
  ]);
  assert.equal(result.status, 4);
  const report = JSON.parse(result.stdout);
  assert.equal(report.removed, false);
  assert.match(report.warning, /kept the session\/worktree/u);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("--discard-unpushed")), false);
  fixture.cleanup();
});

test("status scopes id-less sessions and sanitizes decoded agent fields", () => {
  const fixture = makeFixture();
  const other = mkdtempSync(join(tmpdir(), "ccfc-other-"));
  fixture.env.FAKE_CLAUDE_AGENTS = JSON.stringify([
    {
      sessionId: "223e4567-e89b-42d3-a456-426614174000",
      state: "working",
      name: "cross-repo",
      cwd: other,
      kind: "interactive",
      startedAt: Date.now(),
    },
    {
      id: "deadbeef",
      sessionId: "123e4567-e89b-42d3-a456-426614174000",
      state: "working",
      name: "\u001b]0;owned\u0007visible",
      cwd: fixture.cwd,
      kind: "background",
      startedAt: Date.now(),
    },
  ]);
  const json = fixture.run(["status", "--all", "--json"]);
  assert.equal(json.status, 0, json.stderr);
  assert.equal(JSON.parse(json.stdout).length, 1);

  const plain = fixture.run(["status", "--all"]);
  assert.equal(plain.status, 0, plain.stderr);
  assert.equal(plain.stdout.includes("\u001b"), false);
  assert.match(plain.stdout, /visible/u);
  assert.doesNotMatch(plain.stdout, /cross-repo/u);
  rmSync(other, { recursive: true, force: true });
  fixture.cleanup();
});

test("agent scope authorization uses the raw cwd before terminal sanitization", () => {
  const fixture = makeFixture();
  const disguisedOutside = join(
    dirname(fixture.cwd),
    `\u001b]0;hidden\u0007${basename(fixture.cwd)}`,
    "job",
  );
  fixture.env.FAKE_CLAUDE_AGENTS = JSON.stringify([
    {
      id: "deadbeef",
      sessionId: "123e4567-e89b-42d3-a456-426614174000",
      state: "working",
      cwd: disguisedOutside,
      kind: "background",
      startedAt: Date.now(),
    },
  ]);

  const status = fixture.run(["status", "--all", "--json"]);
  assert.equal(status.status, 0, status.stderr);
  assert.deepEqual(JSON.parse(status.stdout), []);

  const stop = fixture.run([
    "stop",
    "deadbeef",
    "--confirm-stop",
    "stop:deadbeef",
  ]);
  assert.notEqual(stop.status, 0);
  assert.match(stop.stderr, /not uniquely found/u);
  assert.equal(fixture.calls().some((entry) => entry.args[0] === "stop"), false);
  fixture.cleanup();
});

test("resume refuses a running session unless copy semantics are acknowledged", () => {
  const fixture = makeFixture();
  fixture.env.FAKE_CLAUDE_AGENTS = JSON.stringify([
    {
      id: "deadbeef",
      sessionId: "123e4567-e89b-42d3-a456-426614174000",
      state: "working",
      cwd: fixture.cwd,
      startedAt: Date.now(),
    },
  ]);
  const denied = fixture.run(
    ["resume", "--session", "123e4567-e89b-42d3-a456-426614174000"],
    { input: "continue" },
  );
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /may create a copy/u);

  const allowed = fixture.run(
    [
      "resume",
      "--session",
      "123e4567-e89b-42d3-a456-426614174000",
      "--confirm-concurrent-resume",
      "may-create-copy",
    ],
    { input: "continue" },
  );
  assert.equal(allowed.status, 0, allowed.stderr);
  const call = fixture.calls().find((entry) => entry.args.includes("--resume"));
  assert.ok(call);
  assertProfile(call.args, { write: false });
  fixture.cleanup();
});

test("resume treats ambiguous lifecycle signals as potentially active", () => {
  for (const signals of [
    { status: "waiting" },
    { status: "starting" },
    { waitingFor: "input" },
    { state: "stopped", status: "waiting" },
  ]) {
    const fixture = makeFixture();
    fixture.env.FAKE_CLAUDE_AGENTS = JSON.stringify([
      {
        id: "deadbeef",
        sessionId: "123e4567-e89b-42d3-a456-426614174000",
        cwd: fixture.cwd,
        startedAt: Date.now(),
        ...signals,
      },
    ]);
    const denied = fixture.run([
      "resume",
      "--session",
      "123e4567-e89b-42d3-a456-426614174000",
      "continue",
    ]);
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /active or ambiguous lifecycle signals/u);
    assert.equal(fixture.calls().some((entry) => entry.args.includes("--resume")), false);
    fixture.cleanup();
  }
});

test("resume concurrency checks canonicalize UUID letter casing", () => {
  const fixture = makeFixture();
  const lower = "123e4567-e89b-42d3-a456-426614174abc";
  const upper = lower.toUpperCase();
  fixture.env.FAKE_CLAUDE_AGENTS = JSON.stringify([
    {
      id: "deadbeef",
      sessionId: lower,
      state: "working",
      cwd: fixture.cwd,
      startedAt: Date.now(),
    },
  ]);

  const denied = fixture.run(["resume", "--session", upper, "continue"]);
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /may create a copy/u);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("--resume")), false);

  const allowed = fixture.run([
    "resume",
    "--session",
    upper,
    "--confirm-concurrent-resume",
    "may-create-copy",
    "continue",
  ]);
  assert.equal(allowed.status, 0, allowed.stderr);
  const modelCall = fixture.calls().find((entry) => entry.args.includes("--resume"));
  assert.equal(modelCall.args[modelCall.args.indexOf("--resume") + 1], lower);
  fixture.cleanup();
});

test("resume also detects live interactive sessions without a state field", () => {
  const fixture = makeFixture();
  const sessionId = "123e4567-e89b-42d3-a456-426614174000";
  fixture.env.FAKE_CLAUDE_AGENTS = JSON.stringify([
    {
      sessionId,
      status: "waiting",
      waitingFor: "input needed",
      kind: "interactive",
      pid: 123,
      cwd: fixture.cwd,
      startedAt: Date.now(),
    },
  ]);
  const denied = fixture.run(["resume", "--session", sessionId], { input: "continue" });
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /may create a copy/u);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("--resume")), false);
  fixture.cleanup();
});

test("resume detects a live session UUID outside the current repository", () => {
  const fixture = makeFixture();
  const sessionId = "123e4567-e89b-42d3-a456-426614174000";
  const outside = mkdtempSync(join(tmpdir(), "ccfc-live-elsewhere-"));
  fixture.env.FAKE_CLAUDE_AGENTS = JSON.stringify([
    {
      sessionId,
      state: "working",
      status: "running",
      pid: 4321,
      cwd: outside,
      kind: "interactive",
      startedAt: Date.now(),
    },
  ]);

  const denied = fixture.run(["resume", "--session", sessionId, "continue"]);
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /may create a copy/u);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("--resume")), false);

  const allowed = fixture.run([
    "resume",
    "--session",
    sessionId,
    "--confirm-concurrent-resume",
    "may-create-copy",
    "continue",
  ]);
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("--resume")), true);
  rmSync(outside, { recursive: true, force: true });
  fixture.cleanup();
});

test("resume agent lookup shares the outer command deadline", () => {
  const fixture = makeFixture({ FAKE_CLAUDE_AGENTS_DELAY_MS: "2000" });
  const started = Date.now();
  const result = fixture.run([
    "resume",
    "--session",
    "123e4567-e89b-42d3-a456-426614174000",
    "--timeout-seconds",
    "1",
    "continue",
  ]);
  assert.equal(result.status, 124);
  assert.ok(Date.now() - started < 2_500, "agent lookup must not get a fresh 30-second timeout");
  assert.match(result.stderr, /timed out/u);
  assert.equal(fixture.calls().some((entry) => entry.args.includes("--resume")), false);
  fixture.cleanup();
});

test("captured Claude output cannot emit terminal control sequences", () => {
  const fixture = makeFixture({ FAKE_CLAUDE_CONTROL_OUTPUT: "1" });
  const result = fixture.run(["logs", "deadbeef"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("\u001b"), false);
  assert.equal(result.stdout.includes("\u0000"), false);
  assert.match(result.stdout, /reddone/u);
  fixture.cleanup();
});

test("runaway and oversized model output fail closed", { timeout: 10_000 }, () => {
  const hanging = makeFixture({ FAKE_CLAUDE_HANG: "1" });
  const timeout = hanging.run(["ask", "--timeout-seconds", "1", "hello"]);
  assert.notEqual(timeout.status, 0);
  assert.match(timeout.stderr, /timed out/u);
  hanging.cleanup();

  const huge = makeFixture({ FAKE_CLAUDE_HUGE_OUTPUT: "1" });
  const outputLimit = huge.run(["ask", "hello"]);
  assert.notEqual(outputLimit.status, 0);
  assert.match(outputLimit.stderr, /output limit/u);
  huge.cleanup();
});

test("nonzero Claude output is withheld from wrapper errors", () => {
  const fixture = makeFixture({
    FAKE_CLAUDE_RESPONSE: "stdout-private-token",
    FAKE_CLAUDE_STDERR: "stderr-private-token",
    FAKE_CLAUDE_EXIT: "1",
  });
  const result = fixture.run(["ask", "hello"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /stdout and stderr were withheld/u);
  assert.doesNotMatch(result.stdout + result.stderr, /private-token/u);
  fixture.cleanup();
});

test("bounded Claude guard failures expose recovery UUIDs only for persisted calls", () => {
  const response = JSON.stringify({
    type: "result",
    subtype: "error_max_turns",
    terminal_reason: "max_turns",
    is_error: true,
    session_id: "123e4567-e89b-42d3-a456-426614174000",
    errors: ["private provider detail"],
  });
  const ephemeral = makeFixture({
    FAKE_CLAUDE_RESPONSE: response,
    FAKE_CLAUDE_STDERR: "private stderr detail",
    FAKE_CLAUDE_EXIT: "1",
  });
  const ephemeralResult = ephemeral.run(["ask", "hello"]);
  assert.equal(ephemeralResult.status, 1);
  assert.match(ephemeralResult.stderr, /maximum turn limit reached/u);
  assert.doesNotMatch(ephemeralResult.stderr, /123e4567-e89b-42d3-a456-426614174000/u);
  assert.doesNotMatch(ephemeralResult.stdout + ephemeralResult.stderr, /private provider|private stderr/u);
  ephemeral.cleanup();

  const persisted = makeFixture({
    FAKE_CLAUDE_RESPONSE: response,
    FAKE_CLAUDE_STDERR: "private stderr detail",
    FAKE_CLAUDE_EXIT: "1",
  });
  const persistedResult = persisted.run(["ask", "--persist", "hello"]);
  assert.equal(persistedResult.status, 1);
  assert.match(persistedResult.stderr, /123e4567-e89b-42d3-a456-426614174000/u);
  assert.match(persistedResult.stderr, /can be continued/u);
  assert.doesNotMatch(persistedResult.stdout + persistedResult.stderr, /private provider|private stderr/u);
  persisted.cleanup();
});

test("zero-exit Claude error and malformed result envelopes fail closed", () => {
  const errorFixture = makeFixture({
    FAKE_CLAUDE_RESPONSE: JSON.stringify({
      type: "result",
      subtype: "error_during_execution",
      is_error: true,
      errors: ["private execution detail"],
    }),
  });
  const errorResult = errorFixture.run(["ask", "hello"]);
  assert.notEqual(errorResult.status, 0);
  assert.match(errorResult.stderr, /execution error/u);
  assert.doesNotMatch(errorResult.stderr, /private execution detail/u);
  errorFixture.cleanup();

  const futureErrorFixture = makeFixture({
    FAKE_CLAUDE_RESPONSE: JSON.stringify({
      type: "result",
      subtype: "error_new_guard",
      is_error: false,
      result: "private partial result",
    }),
  });
  const futureError = futureErrorFixture.run(["ask", "hello"]);
  assert.notEqual(futureError.status, 0);
  assert.match(futureError.stderr, /unrecognized Claude error state/u);
  assert.doesNotMatch(futureError.stdout + futureError.stderr, /private partial result/u);
  futureErrorFixture.cleanup();

  const malformedFixture = makeFixture({ FAKE_CLAUDE_RESPONSE: "{}" });
  const malformed = malformedFixture.run(["ask", "hello"]);
  assert.notEqual(malformed.status, 0);
  assert.match(malformed.stderr, /invalid result envelope/u);
  malformedFixture.cleanup();
});

test("early child stdin closure rejects without an unhandled EPIPE", async () => {
  await assert.rejects(
    runProcess(
      process.execPath,
      ["-e", "process.stdin.destroy(); setTimeout(() => process.exit(0), 50)"],
      { input: "x".repeat(10 * 1024 * 1024), timeoutMs: 2_000 },
    ),
    /input could be delivered|input could be delivered|all input/u,
  );
});

test("timeout remains authoritative when a blocked stdin also fails", async () => {
  await assert.rejects(
    runProcess(
      process.execPath,
      ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"],
      { input: "x".repeat(1024 * 1024), timeoutMs: 200 },
    ),
    /timed out/u,
  );
});

test(
  "timeout escalation outlives a closed group leader and kills stubborn grandchildren",
  { skip: process.platform === "win32", timeout: 6_000 },
  async () => {
    const scratch = mkdtempSync(join(tmpdir(), "ccfc-process-group-"));
    const pidFile = join(scratch, "grandchild.pid");
    const grandchildProgram = `
      require("node:fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
      process.on("SIGTERM", () => {});
      setInterval(() => {}, 1000);
    `;
    const leaderProgram = `
      require("node:child_process").spawn(
        process.execPath,
        ["-e", ${JSON.stringify(grandchildProgram)}],
        { detached: false, stdio: "ignore" },
      );
      setInterval(() => {}, 1000);
    `;
    const outerProgram = `
      import { runProcess } from ${JSON.stringify(runtimeUrl)};
      try {
        await runProcess(process.execPath, ["-e", ${JSON.stringify(leaderProgram)}], { timeoutMs: 500 });
      } catch (error) {
        process.exitCode = error.exitCode;
      }
    `;
    const outer = spawn(process.execPath, ["--input-type=module", "-e", outerProgram], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    const closed = await new Promise((resolvePromise, rejectPromise) => {
      outer.once("error", rejectPromise);
      outer.once("close", (code, signal) => resolvePromise({ code, signal }));
    });
    assert.equal(closed.code, 124);
    assert.equal(closed.signal, null);
    assert.equal(existsSync(pidFile), true);
    const grandchildPid = Number(readFileSync(pidFile, "utf8"));
    let alive = true;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        process.kill(grandchildPid, 0);
      } catch (error) {
        if (error?.code === "ESRCH") {
          alive = false;
          break;
        }
        throw error;
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    }
    try {
      assert.equal(alive, false, "SIGKILL escalation must remove the whole child process group");
    } finally {
      if (alive) {
        try {
          process.kill(grandchildPid, "SIGKILL");
        } catch {
          // Best-effort cleanup for a failing regression.
        }
      }
      rmSync(scratch, { recursive: true, force: true });
    }
  },
);

test("parent cancellation terminates a stubborn child group and exits promptly", { timeout: 5_000 }, async () => {
  const program = `
    import { runProcess } from ${JSON.stringify(runtimeUrl)};
    try {
      await runProcess(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { timeoutMs: 10000 });
    } catch (error) {
      process.stderr.write(String(error.message));
      process.exitCode = error.exitCode;
    }
  `;
  const child = spawn(process.execPath, ["--input-type=module", "-e", program], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const closed = new Promise((resolvePromise, rejectPromise) => {
    child.once("error", rejectPromise);
    child.once("close", (code, signal) => resolvePromise({ code, signal }));
  });
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  const started = Date.now();
  child.kill("SIGTERM");
  const result = await closed;
  assert.ok(Date.now() - started < 2_000, "cancellation should escalate within one second");
  assert.equal(result.code, 143);
  assert.equal(result.signal, null);
  assert.match(stderr, /interrupted by SIGTERM/u);
});

test("native passthrough has independent native, mutation, cloud, and bypass gates", () => {
  const fixture = makeFixture();
  const noNative = fixture.run(["native", "--", "--version"]);
  assert.notEqual(noNative.status, 0);
  const ttyTimeout = fixture.run([
    "native",
    "--tty",
    "--timeout-seconds",
    "1",
    "--confirm-native",
    "run-native-claude",
    "--",
    "--version",
  ]);
  assert.notEqual(ttyTimeout.status, 0);
  assert.match(ttyTimeout.stderr, /does not support --timeout-seconds/u);
  const noBypass = fixture.run([
    "native",
    "--confirm-native",
    "run-native-claude",
    "--",
    "--dangerously-skip-permissions",
    "hello",
  ]);
  assert.notEqual(noBypass.status, 0);
  const prefixedMutation = fixture.run([
    "native",
    "--confirm-native",
    "run-native-claude",
    "--",
    "--verbose",
    "update",
    "--help",
  ]);
  assert.notEqual(prefixedMutation.status, 0);
  assert.match(prefixedMutation.stderr, /confirm-mutation/u);

  const conservativeReadFamily = fixture.run([
    "native",
    "--confirm-native",
    "run-native-claude",
    "--",
    "plugin",
    "list",
    "--json",
  ]);
  assert.notEqual(conservativeReadFamily.status, 0);
  assert.match(conservativeReadFamily.stderr, /confirm-mutation/u);

  const worktreeMutation = fixture.run([
    "native",
    "--confirm-native",
    "run-native-claude",
    "--",
    "--worktree",
    "test",
  ]);
  assert.notEqual(worktreeMutation.status, 0);
  assert.match(worktreeMutation.stderr, /confirm-mutation/u);

  const editPermission = fixture.run([
    "native",
    "--confirm-native",
    "run-native-claude",
    "--",
    "-p",
    "--tools",
    "Edit",
    "--permission-mode",
    "acceptEdits",
    "change foo",
  ]);
  assert.notEqual(editPermission.status, 0);
  assert.match(editPermission.stderr, /confirm-dangerous-permissions/u);

  const editPermissionEquals = fixture.run([
    "native",
    "--confirm-native",
    "run-native-claude",
    "--confirm-mutation",
    "mutate-claude-state",
    "--",
    "-p",
    "--tools=Edit",
    "--permission-mode=acceptEdits",
    "change foo",
  ]);
  assert.notEqual(editPermissionEquals.status, 0);
  assert.match(editPermissionEquals.stderr, /confirm-dangerous-permissions/u);

  const editMutationGate = fixture.run([
    "native",
    "--confirm-native",
    "run-native-claude",
    "--confirm-dangerous-permissions",
    "bypass-host-safety",
    "--",
    "-p",
    "--tools",
    "Edit",
    "--allowedTools",
    "Edit",
    "change foo",
  ]);
  assert.notEqual(editMutationGate.status, 0);
  assert.match(editMutationGate.stderr, /confirm-mutation/u);

  const settingsBypass = fixture.run([
    "native",
    "--confirm-native",
    "run-native-claude",
    "--confirm-mutation",
    "mutate-claude-state",
    "--",
    "-p",
    "--settings",
    JSON.stringify({
      permissions: { defaultMode: "bypassPermissions" },
      skipDangerousModePermissionPrompt: true,
    }),
    "change foo",
  ]);
  assert.notEqual(settingsBypass.status, 0);
  assert.match(settingsBypass.stderr, /confirm-dangerous-permissions/u);
  assert.equal(
    fixture.calls().some((entry) => entry.args.includes("skipDangerousModePermissionPrompt")),
    false,
  );

  const clusteredShortMutation = fixture.run([
    "native",
    "--confirm-native",
    "run-native-claude",
    "--",
    "-pwccfctest",
    "change foo",
  ]);
  assert.notEqual(clusteredShortMutation.status, 0);
  assert.match(clusteredShortMutation.stderr, /confirm-mutation/u);

  const maintenanceHooks = fixture.run([
    "native",
    "--confirm-native",
    "run-native-claude",
    "--",
    "-p",
    "--maintenance",
    "inspect hooks",
  ]);
  assert.notEqual(maintenanceHooks.status, 0);
  assert.match(maintenanceHooks.stderr, /confirm-mutation/u);

  const autoModeAlias = fixture.run([
    "native",
    "--confirm-native",
    "run-native-claude",
    "--",
    "--enable-auto-mode",
    "modify the checkout",
  ]);
  assert.notEqual(autoModeAlias.status, 0);
  assert.match(autoModeAlias.stderr, /confirm-mutation/u);

  const allowedAutoModeAlias = fixture.run([
    "native",
    "--confirm-native",
    "run-native-claude",
    "--confirm-mutation",
    "mutate-claude-state",
    "--",
    "--enable-auto-mode",
    "modify the checkout",
  ]);
  assert.equal(allowedAutoModeAlias.status, 0, allowedAutoModeAlias.stderr);

  const cloud = fixture.run([
    "native",
    "--confirm-native",
    "run-native-claude",
    "--confirm-mutation",
    "mutate-claude-state",
    "--",
    "--cloud",
    "review this",
  ]);
  assert.notEqual(cloud.status, 0);
  assert.match(cloud.stderr, /confirm-cloud-review/u);

  for (const command of ["remote-control", "self-hosted-runner"]) {
    const nativeCloudCommand = fixture.run([
      "native",
      "--confirm-native",
      "run-native-claude",
      "--confirm-mutation",
      "mutate-claude-state",
      "--",
      command,
    ]);
    assert.notEqual(nativeCloudCommand.status, 0);
    assert.match(nativeCloudCommand.stderr, /confirm-cloud-review/u);
  }

  for (const prompt of ["/code-review ultra", "/ultrareview focus on auth"]) {
    const slashCloud = fixture.run([
      "native",
      "--confirm-native",
      "run-native-claude",
      "--",
      "-p",
      prompt,
    ]);
    assert.notEqual(slashCloud.status, 0);
    assert.match(slashCloud.stderr, /confirm-cloud-review/u);
  }
  const stdinSlashCloud = fixture.run(
    ["native", "--confirm-native", "run-native-claude", "--", "-p"],
    { input: "/code-review ultra" },
  );
  assert.notEqual(stdinSlashCloud.status, 0);
  assert.match(stdinSlashCloud.stderr, /confirm-cloud-review/u);

  const allowedSlashCloud = fixture.run([
    "native",
    "--confirm-native",
    "run-native-claude",
    "--confirm-cloud-review",
    "upload-and-billing",
    "--",
    "-p",
    "/code-review ultra",
  ]);
  assert.equal(allowedSlashCloud.status, 0, allowedSlashCloud.stderr);

  const allowed = fixture.run([
    "native",
    "--confirm-native",
    "run-native-claude",
    "--confirm-mutation",
    "mutate-claude-state",
    "--confirm-cloud-review",
    "upload-and-billing",
    "--",
    "--cloud",
    "review this",
  ]);
  assert.equal(allowed.status, 0, allowed.stderr);

  const finitePipe = fixture.run(
    ["native", "--confirm-native", "run-native-claude", "--", "--version"],
    { input: "finite stdin payload" },
  );
  assert.equal(finitePipe.status, 0, finitePipe.stderr);
  const pipeCall = fixture.calls().find((entry) => entry.args.length === 1 && entry.args[0] === "--version");
  assert.equal(pipeCall.stdin, "finite stdin payload");

  const streamProtocol = fixture.run([
    "native",
    "--confirm-native",
    "run-native-claude",
    "--",
    "-p",
    "--input-format",
    "stream-json",
    "--output-format=stream-json",
  ]);
  assert.notEqual(streamProtocol.status, 0);
  assert.match(streamProtocol.stderr, /live duplex transport/u);
  const post = fixture.run([
    "native",
    "--confirm-native",
    "run-native-claude",
    "--confirm-cloud-review",
    "upload-and-billing",
    "--",
    "ultrareview",
    "123",
    "--post",
  ]);
  assert.notEqual(post.status, 0);
  assert.match(post.stderr, /never permits native --post/u);
  fixture.cleanup();
});

test("stream-json rejection does not wait for stdin EOF", { timeout: 3_000 }, async () => {
  const cwd = mkdtempSync(join(tmpdir(), "ccfc-stream-"));
  const child = spawn(
    process.execPath,
    [
      cli,
      "native",
      "--confirm-native",
      "run-native-claude",
      "--",
      "-p",
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
    ],
    {
      cwd,
      env: { ...process.env, CC_FOR_CODEX_CLAUDE_BIN: fakeClaude },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.stdin.on("error", () => {});
  child.stdin.write('{"type":"user"}\n');
  const result = await new Promise((resolvePromise, rejectPromise) => {
    child.once("error", rejectPromise);
    child.once("close", (code, signal) => resolvePromise({ code, signal }));
  });
  assert.notEqual(result.code, 0);
  assert.equal(result.signal, null);
  assert.match(stderr, /live duplex transport/u);
  rmSync(cwd, { recursive: true, force: true });
});

test("PATH resolver ignores a repository-local claude executable", () => {
  const cwd = mkdtempSync(join(tmpdir(), "ccfc-path-"));
  const localClaude = join(cwd, "claude");
  writeFileSync(localClaude, "#!/bin/sh\necho hijacked\n");
  chmodSync(localClaude, 0o755);
  const result = spawnSync(process.execPath, [cli, "doctor", "--json"], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, PATH: ".:", CC_FOR_CODEX_CLAUDE_BIN: "" },
  });
  assert.equal(result.status, 127);
  assert.doesNotMatch(result.stdout + result.stderr, /hijacked/u);
  rmSync(cwd, { recursive: true, force: true });
});

test("shell bootstrap rejects direct and symlinked repository-local node executables", () => {
  const cwd = mkdtempSync(join(tmpdir(), "ccfc-node-bootstrap-"));
  const externalBin = mkdtempSync(join(tmpdir(), "ccfc-node-symlink-"));
  const sentinel = join(cwd, "malicious-node-ran");
  const localNode = join(cwd, "node");
  writeFileSync(localNode, `#!/bin/sh\n: > "${sentinel}"\nexit 99\n`);
  chmodSync(localNode, 0o755);
  symlinkSync(localNode, join(externalBin, "node"));
  const trustedNodeDirectory = dirname(realpathSync(process.execPath));

  for (const firstEntry of [cwd, externalBin]) {
    const result = spawnSync(launcher, ["doctor", "--json"], {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${firstEntry}:${trustedNodeDirectory}:/usr/bin:/bin`,
        CC_FOR_CODEX_CLAUDE_BIN: fakeClaude,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).ready, true);
    assert.equal(existsSync(sentinel), false);
  }

  rmSync(cwd, { recursive: true, force: true });
  rmSync(externalBin, { recursive: true, force: true });
});

test("package bin launcher resolves an external symlink before locating the plugin", () => {
  const fixture = makeFixture();
  const binDirectory = mkdtempSync(join(tmpdir(), "ccfc-package-bin-"));
  const linkedLauncher = join(binDirectory, "cc-for-codex");
  symlinkSync(launcher, linkedLauncher);
  const result = spawnSync(linkedLauncher, ["doctor", "--json"], {
    cwd: fixture.cwd,
    encoding: "utf8",
    env: {
      ...fixture.env,
      PATH: `${binDirectory}:${dirname(realpathSync(process.execPath))}:/usr/bin:/bin`,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).ready, true);
  fixture.cleanup();
  rmSync(binDirectory, { recursive: true, force: true });
});

test("shell bootstraps clear inherited Node code-loading variables", () => {
  const fixture = makeFixture();
  const preload = join(fixture.cwd, "preload.cjs");
  const sentinel = join(fixture.cwd, "node-options-ran");
  writeFileSync(
    preload,
    `require("node:fs").writeFileSync(${JSON.stringify(sentinel)}, "executed");\n`,
  );
  for (const executable of [skillLauncher, launcher]) {
    rmSync(sentinel, { force: true });
    const result = spawnSync(executable, ["help"], {
      cwd: fixture.cwd,
      encoding: "utf8",
      env: {
        ...fixture.env,
        NODE_OPTIONS: `--require ${preload}`,
        NODE_PATH: fixture.cwd,
        PATH: `${dirname(realpathSync(process.execPath))}:/usr/bin:/bin`,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /CC for Codex/u);
    assert.equal(existsSync(sentinel), false);
  }
  fixture.cleanup();
});

test("shell bootstrap rejects Node from a linked worktree's shared checkout", () => {
  const main = mkdtempSync(join(tmpdir(), "ccfc-node-main-"));
  const linkedParent = mkdtempSync(join(tmpdir(), "ccfc-node-linked-parent-"));
  const linked = join(linkedParent, "worktree");
  const sentinel = join(main, "malicious-node-ran");
  const localNode = join(main, "node");
  initGitRepo(main);
  writeFileSync(join(main, "README.md"), "# fixture\n");
  git(main, ["add", "README.md"]);
  git(main, ["commit", "-m", "initial"]);
  git(main, ["worktree", "add", "-q", "-b", "linked-bootstrap-test", linked]);
  writeFileSync(localNode, `#!/bin/sh\n: > "${sentinel}"\nexit 99\n`);
  chmodSync(localNode, 0o755);

  const result = spawnSync(launcher, ["doctor", "--json"], {
    cwd: linked,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${main}:${dirname(realpathSync(process.execPath))}:/usr/bin:/bin`,
      CC_FOR_CODEX_CLAUDE_BIN: fakeClaude,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).ready, true);
  assert.equal(existsSync(sentinel), false);

  rmSync(main, { recursive: true, force: true });
  rmSync(linkedParent, { recursive: true, force: true });
});

test("PATH resolver also ignores absolute repository-local tool entries", () => {
  const cwd = mkdtempSync(join(tmpdir(), "ccfc-absolute-path-"));
  const localClaude = join(cwd, "claude");
  writeFileSync(localClaude, "#!/bin/sh\necho ABSOLUTE_REPO_HIJACK\n");
  chmodSync(localClaude, 0o755);
  const result = spawnSync(process.execPath, [cli, "doctor", "--json"], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${cwd}:/usr/bin:/bin`,
      CC_FOR_CODEX_CLAUDE_BIN: "",
    },
  });
  assert.equal(result.status, 127);
  assert.doesNotMatch(result.stdout + result.stderr, /ABSOLUTE_REPO_HIJACK/u);

  const explicit = spawnSync(
    process.execPath,
    [cli, "doctor", "--json", "--claude-bin", localClaude],
    { cwd, encoding: "utf8", env: process.env },
  );
  assert.notEqual(explicit.status, 0);
  assert.match(explicit.stderr, /inside the current repository\/workspace/u);
  rmSync(cwd, { recursive: true, force: true });
});

test("PATH resolver rejects dot-dot-prefixed repository child directories", () => {
  const cwd = mkdtempSync(join(tmpdir(), "ccfc-dotdot-path-"));
  const localBin = join(cwd, "..bin");
  const localClaude = join(localBin, "claude");
  mkdirSync(localBin);
  writeFileSync(localClaude, "#!/bin/sh\necho DOTDOT_REPO_HIJACK\n");
  chmodSync(localClaude, 0o755);
  const result = spawnSync(process.execPath, [cli, "doctor", "--json"], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${localBin}:/usr/bin:/bin`,
      CC_FOR_CODEX_CLAUDE_BIN: "",
    },
  });
  assert.equal(result.status, 127);
  assert.doesNotMatch(result.stdout + result.stderr, /DOTDOT_REPO_HIJACK/u);
  rmSync(cwd, { recursive: true, force: true });
});

test("PATH resolver rejects executables in an enclosing repository from a nested worktree", () => {
  const root = mkdtempSync(join(tmpdir(), "ccfc-enclosing-repo-"));
  mkdirSync(join(root, ".git"));
  const nested = join(root, ".claude", "worktrees", "task");
  mkdirSync(nested, { recursive: true });
  writeFileSync(join(nested, ".git"), "gitdir: ../../../.git/worktrees/task\n");
  const localClaude = join(root, "claude");
  writeFileSync(localClaude, "#!/bin/sh\necho ENCLOSING_REPO_HIJACK\n");
  chmodSync(localClaude, 0o755);

  const fromPath = spawnSync(process.execPath, [cli, "doctor", "--json"], {
    cwd: nested,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${root}:/usr/bin:/bin`,
      CC_FOR_CODEX_CLAUDE_BIN: "",
    },
  });
  assert.equal(fromPath.status, 127);
  assert.doesNotMatch(fromPath.stdout + fromPath.stderr, /ENCLOSING_REPO_HIJACK/u);

  const explicit = spawnSync(
    process.execPath,
    [cli, "doctor", "--json", "--claude-bin", localClaude],
    { cwd: nested, encoding: "utf8", env: process.env },
  );
  assert.notEqual(explicit.status, 0);
  assert.match(explicit.stderr, /inside the current repository\/workspace/u);
  rmSync(root, { recursive: true, force: true });
});

function makeFixture(extraEnv = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "ccfc-test-"));
  const log = `${cwd}.fake-claude.jsonl`;
  const env = {
    ...process.env,
    CC_FOR_CODEX_CLAUDE_BIN: fakeClaude,
    FAKE_CLAUDE_LOG: log,
    ...extraEnv,
  };
  return {
    cwd,
    env,
    run(args, options = {}) {
      return spawnSync(process.execPath, [cli, ...args], {
        cwd,
        encoding: "utf8",
        input: options.input,
        env,
        timeout: 15_000,
      });
    },
    calls() {
      if (!existsSync(log)) return [];
      return readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    },
    cleanup() {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(log, { force: true });
    },
  };
}

function assertProfile(args, { write, textOnly = false, dangerous = write }) {
  for (const flag of ["--safe-mode", "--strict-mcp-config", "--no-chrome", "--permission-prompts", "--tools"]) {
    assert.ok(args.includes(flag), `missing ${flag}`);
  }
  assert.equal(args[args.indexOf("--permission-prompts") + 1], "none");
  const tools = args[args.indexOf("--tools") + 1].split(",");
  assert.equal(tools.includes("Read"), !textOnly);
  if (textOnly) assert.equal(args[args.indexOf("--tools") + 1], "");
  assert.equal(tools.includes("Bash"), false);
  assert.equal(tools.includes("WebFetch"), false);
  assert.equal(tools.includes("Edit"), write);
  assert.equal(tools.includes("Write"), write);
  if (write && dangerous) {
    assert.equal(args.includes("--dangerously-skip-permissions"), true);
    assert.equal(args.includes("--restricted"), false);
    assert.equal(args.includes("--permission-mode"), false);
    assert.equal(args.includes("--allowedTools"), false);
  } else {
    assert.equal(args.includes("--restricted"), true);
    assert.equal(args[args.indexOf("--permission-mode") + 1], "dontAsk");
    assert.equal(args.includes("--dangerously-skip-permissions"), false);
  }
}

function initGitRepo(cwd) {
  git(cwd, ["init", "-q"]);
  git(cwd, ["config", "user.email", "tests@example.test"]);
  git(cwd, ["config", "user.name", "CC for Codex Tests"]);
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
}

function gitOutput(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
