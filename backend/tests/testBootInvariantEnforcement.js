"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

// ============================================================
// AzaLens - Boot invariant enforcement, proven by execution
//
// testEnvironmentValidation.js calls validateEnvironment() directly.
// That proves the RULE is correct; it does not prove the deployed
// process enforces it. This suite proves enforcement by booting the
// real entrypoint - `node server.js`, the same thing package.json's
// start script runs - in a child process and observing what the
// operating system reports.
//
// server.js:10 calls assertEnvironmentValid() before express is even
// required and long before startServer()/app.listen() at :761-762.
// Every negative case below must therefore exit non-zero WITHOUT the
// port ever accepting a connection.
//
// Controlled environment:
//   * the child runs with cwd set to a temporary directory, so
//     `require("dotenv").config()` - which resolves .env relative to
//     process.cwd() - finds nothing and cannot inject a real value
//     that would mask a missing one;
//   * every case shares one complete synthetic environment and
//     differs ONLY in CLOSED_DEMO_ENABLED (or APP_ENV/NODE_ENV for
//     the precedence case), so a failure can only come from the
//     variable under test;
//   * the positive control is the proof of that: identical config
//     with a valid value must reach the listening stage.
//
// No value here is a credential. The Supabase strings are the same
// obviously-fake shapes used by testEnvironmentValidation.js, and no
// provider is contacted: booting the server opens a socket, it does
// not call Finnhub, Twelve Data or Halal Terminal.
// ============================================================

const SERVER_ENTRYPOINT = path.join(__dirname, "..", "server.js");
const START_SCRIPT = require("../package.json").scripts.start;

// Structurally valid, obviously fake. Not credentials.
const FAKE_PUBLISHABLE = "sb_publishable_notarealkey000000000";
const FAKE_SECRET = "sb_secret_notarealkey000000000";
const FAKE_ACCESS_CODE = "not-a-real-access-code";
const FAKE_SIGNING_SECRET = "0".repeat(48);

const PROJECT_REFS = {
  development: "xhxlgalaytuqdnmmwypv",
  production: "jexphwidcfbgxpthgwum",
};

function completeEnvironment(resolvedEnvironment) {
  const projectRef =
    resolvedEnvironment === "production"
      ? PROJECT_REFS.production
      : PROJECT_REFS.development;

  return {
    // Node needs a PATH to execute; nothing else is inherited.
    PATH: process.env.PATH,
    APP_ENV: resolvedEnvironment,
    NODE_ENV: resolvedEnvironment,
    FINNHUB_API_KEY: "boot-test-key",
    TWELVE_DATA_API_KEY: "boot-test-key",
    OBSERVABILITY_METRICS_TOKEN: "boot-test-token",
    SUPABASE_URL: `https://${projectRef}.supabase.co`,
    SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE,
    SUPABASE_SECRET_KEY: FAKE_SECRET,
    SHARIAH_DATA_MODE: "offline",
    CLOSED_DEMO_ACCESS_CODE: FAKE_ACCESS_CODE,
    CLOSED_DEMO_SIGNING_SECRET: FAKE_SIGNING_SECRET,
  };
}

// ------------------------------------------------------------
// Port helpers
// ------------------------------------------------------------

function reserveFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function portAccepts(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const settle = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(1500);
    socket.on("connect", () => settle(true));
    socket.on("timeout", () => settle(false));
    socket.on("error", () => settle(false));
  });
}

// ------------------------------------------------------------
// Child boot harness
// ------------------------------------------------------------

const CWD = fs.mkdtempSync(path.join(os.tmpdir(), "azalens-boot-"));

async function boot(environment, port) {
  const child = spawn(process.execPath, [SERVER_ENTRYPOINT], {
    cwd: CWD, // no .env is reachable from here
    env: { ...environment, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));

  const finished = new Promise((resolve) => {
    child.on("exit", (code, signal) => resolve({ code, signal }));
  });

  // Resolves as soon as the process logs that it is listening.
  const listening = new Promise((resolve) => {
    const check = () => {
      if (stdout.includes("service_started")) resolve(true);
    };
    child.stdout.on("data", check);
    setTimeout(() => resolve(false), 8000);
  });

  return {
    child,
    finished,
    listening,
    get stdout() {
      return stdout;
    },
    get stderr() {
      return stderr;
    },
  };
}

function assertNoSecretsLeaked(text, label) {
  for (const [name, value] of [
    ["access code", FAKE_ACCESS_CODE],
    ["signing secret", FAKE_SIGNING_SECRET],
    ["publishable key", FAKE_PUBLISHABLE],
    ["secret key", FAKE_SECRET],
    ["provider key", "boot-test-key"],
    ["metrics token", "boot-test-token"],
  ]) {
    assert.ok(
      !text.includes(value),
      `${label}: the ${name} must never appear in process output`
    );
  }
}

const results = [];

function record(name, detail) {
  results.push({ name, detail });
  console.log(`  ok    ${name}\n        ${detail}`);
}

// ------------------------------------------------------------
// Positive control
// ------------------------------------------------------------

async function positiveControl(resolvedEnvironment) {
  const port = await reserveFreePort();
  const env = {
    ...completeEnvironment(resolvedEnvironment),
    CLOSED_DEMO_ENABLED: "true",
  };

  const run = await boot(env, port);
  const reachedListening = await run.listening;
  const accepted = reachedListening ? await portAccepts(port) : false;

  run.child.kill("SIGTERM");
  await run.finished;

  assert.ok(
    reachedListening,
    `${resolvedEnvironment} positive control must reach the listening stage. stderr: ${run.stderr.slice(
      0,
      400
    )}`
  );
  assert.ok(
    accepted,
    `${resolvedEnvironment} positive control must actually accept a connection on ${port}`
  );
  assertNoSecretsLeaked(
    run.stdout + run.stderr,
    `${resolvedEnvironment} positive control`
  );

  record(
    `${resolvedEnvironment} + CLOSED_DEMO_ENABLED=true boots and listens`,
    `service_started logged, port ${port} accepted a TCP connection, terminated with SIGTERM`
  );
}

// ------------------------------------------------------------
// Negative cases
// ------------------------------------------------------------

async function negative(name, resolvedEnvironment, overrides, expectMalformed) {
  const port = await reserveFreePort();
  const base = completeEnvironment(resolvedEnvironment);

  // Deliberately delete rather than set undefined, so the child
  // genuinely does not receive the variable.
  const env = { ...base, ...overrides };
  if (overrides.__omitGate) {
    delete env.CLOSED_DEMO_ENABLED;
    delete env.__omitGate;
  }

  const run = await boot(env, port);
  const { code, signal } = await run.finished;
  const accepted = await portAccepts(port);
  const output = run.stdout + run.stderr;

  assert.notEqual(
    code,
    0,
    `${name}: startup must exit non-zero (got ${code}, signal ${signal})`
  );
  assert.equal(
    signal,
    null,
    `${name}: must be a deliberate exit, not a signal kill`
  );
  assert.ok(
    !run.stdout.includes("service_started"),
    `${name}: must never reach the listening stage`
  );
  assert.equal(
    accepted,
    false,
    `${name}: port ${port} must never have opened`
  );

  /*
    Distinguish a deliberate configuration-validation exit from an
    unrelated crash. The message must be the validation error naming
    the variable under test - not a module-resolution failure, not a
    TypeError, not a port conflict.
  */
  assert.match(
    output,
    /Environment validation failed for/,
    `${name}: must fail through environment validation, not an unrelated crash`
  );
  assert.match(
    output,
    /CLOSED_DEMO_ENABLED/,
    `${name}: the error must identify CLOSED_DEMO_ENABLED`
  );
  assert.ok(
    !/Cannot find module|is not a function|EADDRINUSE|SyntaxError/.test(
      output
    ),
    `${name}: must not be an unrelated dependency or runtime failure`
  );

  if (expectMalformed) {
    assert.match(
      output,
      /is not a valid boolean/,
      `${name}: a malformed value must be reported as invalid, not merely as "not true"`
    );
  }

  assertNoSecretsLeaked(output, name);

  const firstLine =
    output
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.includes("CLOSED_DEMO_ENABLED")) || "";

  record(
    name,
    `exit code ${code}, port ${port} never opened, message: "${firstLine.slice(
      0,
      150
    )}"`
  );
}

// ------------------------------------------------------------

async function run() {
  console.log(
    `\n[boot-invariant] Render start script: "${START_SCRIPT}"` +
      `\n[boot-invariant] entrypoint: backend/server.js` +
      `\n[boot-invariant] assertEnvironmentValid() at server.js:10, ` +
      `before require("express") at :12 and app.listen() at :762\n`
  );

  try {
    // 1. Positive control - production
    await positiveControl("production");

    // 2. Malformed production value
    await negative(
      'production + CLOSED_DEMO_ENABLED="ture" exits before listening',
      "production",
      { CLOSED_DEMO_ENABLED: "ture" },
      true
    );

    // 3. Missing production value
    await negative(
      "production + CLOSED_DEMO_ENABLED omitted exits before listening",
      "production",
      { __omitGate: true },
      false
    );

    // 4. False production value
    await negative(
      'production + CLOSED_DEMO_ENABLED="false" exits before listening',
      "production",
      { CLOSED_DEMO_ENABLED: "false" },
      false
    );

    // 5. Staging - valid and malformed
    await positiveControl("staging");
    await negative(
      'staging + CLOSED_DEMO_ENABLED="ture" exits before listening',
      "staging",
      { CLOSED_DEMO_ENABLED: "ture" },
      true
    );

    // 6. APP_ENV precedence: NODE_ENV says development, APP_ENV says
    //    production. Enforcement must follow the resolved environment.
    await negative(
      "APP_ENV=production + NODE_ENV=development + malformed value still fails",
      "production",
      { NODE_ENV: "development", CLOSED_DEMO_ENABLED: "ture" },
      true
    );
    await negative(
      "APP_ENV=production + NODE_ENV=development + omitted value still fails",
      "production",
      { NODE_ENV: "development", __omitGate: true },
      false
    );

    console.log(
      `\n[boot-invariant] ${results.length}/${results.length} startup cases proved by execution. ` +
        "No provider network calls were made."
    );
  } finally {
    fs.rmSync(CWD, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
