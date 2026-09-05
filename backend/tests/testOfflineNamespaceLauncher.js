"use strict";

/*
  Durable proof of the safety contract of .github/scripts/run-offline.sh.

  That script is the whole privilege chain behind both offline browser phases:
  sudo -> unshare --net -> setpriv (drop to the runner UID) -> env -> command.
  Until now nothing tested it. It ran twice per CI run, always on a correctly
  isolated Linux runner, so every proof it printed was a proof about the runner
  rather than about the script. Delete a sentinel requirement, forward
  AZALENS_ACCEPT_BASELINES, report tee's exit status as the suite's, or lose an
  argument boundary, and CI stays green. `bash -n` catches syntax and nothing
  else.

  Method. Each scenario gets a private bin/ holding stubs for the five system
  tools the script shells out to - sudo, unshare, setpriv, ip, readlink - plus
  symlinks to the handful of real utilities it needs, and runs on a PATH that
  contains that directory and nothing else. The real launcher therefore runs
  unmodified while the test decides what the "kernel" reports. No namespace is
  created, nothing runs as root, no real sudo is ever invoked, and the
  authoritative privileged execution on Linux CI is untouched. Nothing here can
  reach the network: `ip route get` is answered from a string, curl and wget are
  not on the PATH at all, and the only command ever executed is a recording stub
  the test wrote itself.
*/

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "../..");
const LAUNCHER = path.join(REPO_ROOT, ".github/scripts/run-offline.sh");

assert.ok(fs.existsSync(LAUNCHER), `${LAUNCHER} is missing; the offline gate has no launcher.`);

const HOST_NETNS = "net:[4026531840]";
const CHILD_NETNS = "net:[4026532999]";

/*
  Every scenario runs on a PATH that holds nothing but this list plus the
  stubs. Making it hermetic is what lets the assertions below mean what they
  say: a scenario that omits `sudo` really has no sudo to fall back to, and no
  scenario can reach curl, wget, npx or a real network tool even by accident.
*/
const REAL_TOOLS = ["awk", "bash", "basename", "cat", "dirname", "env", "grep", "id", "sed", "tee"];

const realToolPath = (name) => {
  const found = spawnSync("/bin/sh", ["-c", `command -v ${name}`], { encoding: "utf8" });
  const resolved = (found.stdout ?? "").trim();
  assert.ok(resolved, `${name} is required to exercise the offline launcher but is not on PATH`);
  return resolved;
};

const REAL_TOOL_PATHS = new Map(REAL_TOOLS.map((name) => [name, realToolPath(name)]));

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "azalens-offline-"));
process.on("exit", () => fs.rmSync(workspace, { recursive: true, force: true }));

let serial = 0;

const shell = (dir, name, body) => {
  const file = path.join(dir, name);
  // rm first: some of these names are already symlinks to the real tool in this
  // scenario's bin/, and writeFileSync would follow the link and overwrite the
  // system binary rather than replace the link.
  fs.rmSync(file, { force: true });
  fs.writeFileSync(file, `#!/bin/sh\n${body}`, { mode: 0o755 });
  return file;
};

/*
  One scenario: a private bin/ of stubs, a private workdir, a log path, and a
  recording command. Every knob defaults to the shape a healthy isolated run
  has, so each test changes exactly the one fact it is about.
*/
function scenario({
  links = "1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 state UNKNOWN\\n",
  ipv4Routes = "",
  childNetns = CHILD_NETNS,
  routeProbeExit = 2,
  commandExit = 0,
  teeMode = "real",
  omitTools = [],
} = {}) {
  const root = path.join(workspace, `s-${(serial += 1)}`);
  const bin = path.join(root, "bin");
  const work = path.join(root, "work");
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(work, { recursive: true });

  const argvRecord = path.join(root, "argv.txt");
  const envRecord = path.join(root, "env.txt");
  const cwdRecord = path.join(root, "cwd.txt");

  const omitted = new Set(omitTools);
  for (const [name, target] of REAL_TOOL_PATHS) {
    if (!omitted.has(name)) fs.symlinkSync(target, path.join(bin, name));
  }

  const stub = (name, body) => {
    if (omitted.has(name)) return path.join(bin, name);
    return shell(bin, name, body);
  };

  stub("sudo", 'while [ "$1" = "-n" ]; do shift; done\nexec "$@"\n');
  stub(
    "unshare",
    [
      "while [ $# -gt 0 ]; do",
      '  case "$1" in',
      "    --net) shift ;;",
      "    --) shift; break ;;",
      "    *) break ;;",
      "  esac",
      "done",
      "AZ_FAKE_NETNS=child",
      "export AZ_FAKE_NETNS",
      'exec "$@"',
      "",
    ].join("\n"),
  );
  stub(
    "readlink",
    [
      'if [ "$1" = "/proc/self/ns/net" ]; then',
      '  if [ "${AZ_FAKE_NETNS:-host}" = "child" ]; then',
      `    echo '${childNetns}'`,
      "  else",
      `    echo '${HOST_NETNS}'`,
      "  fi",
      "  exit 0",
      "fi",
      'echo "fake readlink: unexpected target $*" >&2',
      "exit 1",
      "",
    ].join("\n"),
  );
  stub(
    "setpriv",
    [
      "while [ $# -gt 0 ]; do",
      '  case "$1" in',
      "    --reuid=*|--regid=*|--init-groups) shift ;;",
      "    --) shift; break ;;",
      "    *) break ;;",
      "  esac",
      "done",
      'exec "$@"',
      "",
    ].join("\n"),
  );
  stub(
    "ip",
    [
      'case "$*" in',
      '  "link set lo up") exit 0 ;;',
      `  "-o link show") printf '${links}' ;;`,
      '  "-o link show dev lo") echo "1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 state UNKNOWN" ;;',
      '  "-o -4 addr show dev lo") echo "1: lo    inet 127.0.0.1/8 scope host lo" ;;',
      '  "addr add 127.0.0.1/8 dev lo") exit 0 ;;',
      `  "-4 route show") printf '${ipv4Routes}' ;;`,
      '  "-6 route show") ;;',
      '  "route get 192.0.2.1")',
      routeProbeExit === 0
        ? '    echo "192.0.2.1 dev lo src 127.0.0.1"; exit 0 ;;'
        : `    echo "RTNETLINK answers: Network is unreachable" >&2; exit ${routeProbeExit} ;;`,
      '  *) echo "fake ip: unhandled invocation: $*" >&2; exit 99 ;;',
      "esac",
      "",
    ].join("\n"),
  );

  if (teeMode === "empty-log") {
    // Writes an empty log and succeeds: every proof sentinel disappears while
    // the isolated command still exits 0.
    shell(bin, "tee", 'cat > /dev/null\n: > "$1"\nexit 0\n');
  } else if (teeMode === "failing-writer") {
    shell(bin, "tee", 'cat > "$1"\nexit 3\n');
  }

  const command = shell(
    bin,
    "azalens-fake-suite",
    [
      `{ printf 'ARGC=%s\\n' "$#"; for a in "$@"; do printf 'ARG=[%s]\\n' "$a"; done; } > '${argvRecord}'`,
      `env > '${envRecord}'`,
      `pwd > '${cwdRecord}'`,
      `exit ${commandExit}`,
      "",
    ].join("\n"),
  );

  const logPath = path.join(root, "offline.log");

  const run = (args, extraEnv = {}) => {
    const result = spawnSync(LAUNCHER, args, {
      cwd: work,
      encoding: "utf8",
      env: {
        // Hermetic: nothing but this scenario's stubs and symlinks.
        PATH: bin,
        HOME: root,
        LC_ALL: "C",
        TZ: "UTC",
        ...extraEnv,
      },
    });
    return {
      status: result.status,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
      log: fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : null,
      argv: fs.existsSync(argvRecord) ? fs.readFileSync(argvRecord, "utf8") : null,
      childEnv: fs.existsSync(envRecord) ? fs.readFileSync(envRecord, "utf8") : null,
      childCwd: fs.existsSync(cwdRecord) ? fs.readFileSync(cwdRecord, "utf8").trim() : null,
    };
  };

  return { root, bin, work, logPath, command: path.basename(command), run };
}

const childEnvValue = (childEnv, name) => {
  const line = childEnv.split("\n").find((entry) => entry.startsWith(`${name}=`));
  return line === undefined ? null : line.slice(name.length + 1);
};

const uid = process.getuid();
const gid = process.getgid();

// ------------------------------------------------------------------
// 1. The required command runs inside the namespace, and says so.
// ------------------------------------------------------------------
{
  const s = scenario();
  const result = s.run(["e2e", s.logPath, s.command, "--flag", "value"]);

  assert.equal(result.status, 0, `healthy run exited ${result.status}:\n${result.output}`);
  assert.match(result.stdout, /OFFLINE_PHASE=e2e/);
  assert.match(result.stdout, new RegExp(`OFFLINE_HOST_NETNS=${HOST_NETNS.replace(/[[\]]/g, "\\$&")}`));
  assert.match(result.stdout, /OFFLINE_NETNS_PROOF=engaged/);
  assert.match(result.stdout, /OFFLINE_NONLOOPBACK_COUNT=0/);
  assert.match(result.stdout, /OFFLINE_LOOPBACK_PROOF=up/);
  assert.match(result.stdout, /OFFLINE_DEFAULT_ROUTE_COUNT=0/);
  assert.match(result.stdout, /OFFLINE_ROUTE_PROOF=no-external-route/);
  assert.match(result.stdout, new RegExp(`OFFLINE_TEST_UID_PROOF=${uid}:${gid}`));
  assert.match(result.stdout, /OFFLINE_COMMAND_PROOF=started/);
  assert.match(result.stdout, /OFFLINE_COMMAND_EXIT=0/);
  // The command really ran, in the invoking working directory.
  assert.equal(result.argv, "ARGC=2\nARG=[--flag]\nARG=[value]\n");
  assert.equal(fs.realpathSync(result.childCwd), fs.realpathSync(s.work));
  // And the log carries the same proof the outer stage then re-reads.
  assert.match(result.log, /OFFLINE_NETNS_PROOF=engaged/);
  assert.match(result.log, /OFFLINE_COMMAND_PROOF=started/);
}

// ------------------------------------------------------------------
// 2. Every isolation proof is load-bearing: remove one, the run fails closed.
// ------------------------------------------------------------------
{
  // The namespace never engaged: the child is the host namespace.
  const s = scenario({ childNetns: HOST_NETNS });
  const result = s.run(["visual", s.logPath, s.command]);

  assert.equal(result.status, 5, `expected exit 5, got ${result.status}:\n${result.output}`);
  assert.match(result.output, /Network isolation did not engage for visual/);
  assert.equal(result.argv, null, "the suite must not run when isolation did not engage");
}
{
  // A second interface exists inside the namespace.
  const s = scenario({
    links:
      "1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 state UNKNOWN\\n" +
      "2: eth0@if9: <BROADCAST,MULTICAST,UP> mtu 1500 state UP\\n",
  });
  const result = s.run(["visual", s.logPath, s.command]);

  assert.equal(result.status, 6, `expected exit 6, got ${result.status}:\n${result.output}`);
  assert.match(result.output, /1 non-loopback interface\(s\) exist inside the namespace/);
  assert.equal(result.argv, null, "the suite must not run with a non-loopback interface present");
}
{
  // A default route survived into the namespace.
  const s = scenario({ ipv4Routes: "default via 10.1.0.1 dev eth0\\n" });
  const result = s.run(["visual", s.logPath, s.command]);

  assert.equal(result.status, 8, `expected exit 8, got ${result.status}:\n${result.output}`);
  assert.match(result.output, /1 default route\(s\) exist inside the namespace/);
  assert.equal(result.argv, null, "the suite must not run with a default route present");
}
{
  // The reserved documentation address is routable, so something is reachable.
  const s = scenario({ routeProbeExit: 0 });
  const result = s.run(["visual", s.logPath, s.command]);

  assert.equal(result.status, 9, `expected exit 9, got ${result.status}:\n${result.output}`);
  assert.match(result.output, /192\.0\.2\.1 is routable inside the namespace/);
  assert.equal(result.argv, null, "the suite must not run when a reserved address is routable");
}

// ------------------------------------------------------------------
// 3. The child command's own status is the result - never the log writer's.
// ------------------------------------------------------------------
{
  const s = scenario({ commandExit: 7 });
  const result = s.run(["e2e", s.logPath, s.command]);

  assert.equal(result.status, 7, `a failing suite must propagate its status, got ${result.status}`);
  assert.match(result.output, /OFFLINE_COMMAND_EXIT=7/);
  assert.match(result.output, /The isolated e2e command exited 7/);
  assert.match(result.output, /OFFLINE_LOG_WRITER_EXIT=0/);
}
{
  // The suite passed but the log could not be written: the gate that reads the
  // log downstream cannot be trusted, so the step fails.
  const s = scenario({ teeMode: "failing-writer" });
  const result = s.run(["e2e", s.logPath, s.command]);

  assert.equal(result.status, 1, `a failed log writer must fail the step, got ${result.status}`);
  assert.match(result.output, /OFFLINE_ISOLATED_EXIT=0/);
  assert.match(result.output, /OFFLINE_LOG_WRITER_EXIT=3/);
  assert.match(result.output, /log writer exited 3/);
}
{
  // The suite passed, the log is empty: the proof sentinels are gone and the
  // gate must fail closed rather than accept an unverifiable pass.
  const s = scenario({ teeMode: "empty-log" });
  const result = s.run(["e2e", s.logPath, s.command]);

  assert.equal(result.status, 1, `a proofless log must fail the step, got ${result.status}`);
  assert.match(result.output, /missing required proof sentinels/);
  for (const sentinel of [
    "OFFLINE_NETNS_PROOF=engaged",
    "OFFLINE_NONLOOPBACK_COUNT=0",
    "OFFLINE_LOOPBACK_PROOF=up",
    "OFFLINE_DEFAULT_ROUTE_COUNT=0",
    "OFFLINE_ROUTE_PROOF=no-external-route",
    `OFFLINE_TEST_UID_PROOF=${uid}:${gid}`,
    "OFFLINE_COMMAND_PROOF=started",
    "OFFLINE_COMMAND_EXIT=0",
  ]) {
    assert.ok(
      result.output.includes(sentinel),
      `the failure must name the missing sentinel ${sentinel}`,
    );
  }
}

// ------------------------------------------------------------------
// 4. Environment forwarding is an explicit allowlist.
// ------------------------------------------------------------------
{
  const s = scenario();
  const result = s.run(["visual", s.logPath, s.command], {
    REVIEW_HEAD_SHA: "0123456789abcdef0123456789abcdef01234567",
    LANG: "C.UTF-8",
    LC_CTYPE: "C.UTF-8",
    // Credential- and provider-shaped variables that must not cross the
    // boundary. None is real: they exist only to be looked for on the far side.
    TWELVE_DATA_API_KEY: "stub-must-not-cross",
    FINNHUB_API_KEY: "stub-must-not-cross",
    SUPABASE_SERVICE_ROLE_KEY: "stub-must-not-cross",
    SUPABASE_URL: "https://stub.invalid",
    VITE_SUPABASE_ANON_KEY: "stub-must-not-cross",
    ANTHROPIC_API_KEY: "stub-must-not-cross",
    GITHUB_TOKEN: "stub-must-not-cross",
    AWS_SECRET_ACCESS_KEY: "stub-must-not-cross",
  });

  assert.equal(result.status, 0, `forwarding scenario exited ${result.status}:\n${result.output}`);

  const forwarded = result.childEnv;
  assert.ok(forwarded, "the suite must have recorded its environment");

  // Explicitly forwarded, because a spec reads it and locale moves pixels.
  assert.equal(childEnvValue(forwarded, "REVIEW_HEAD_SHA"), "0123456789abcdef0123456789abcdef01234567");
  assert.equal(childEnvValue(forwarded, "LANG"), "C.UTF-8");
  assert.equal(childEnvValue(forwarded, "LC_CTYPE"), "C.UTF-8");
  assert.equal(childEnvValue(forwarded, "LC_ALL"), "C");
  assert.equal(childEnvValue(forwarded, "TZ"), "UTC");
  // Set by the launcher itself.
  assert.equal(childEnvValue(forwarded, "CI"), "1");
  assert.equal(childEnvValue(forwarded, "NPM_CONFIG_UPDATE_NOTIFIER"), "false");

  for (const secret of [
    "TWELVE_DATA_API_KEY",
    "FINNHUB_API_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
    "ANTHROPIC_API_KEY",
    "GITHUB_TOKEN",
    "AWS_SECRET_ACCESS_KEY",
  ]) {
    assert.equal(
      childEnvValue(forwarded, secret),
      null,
      `${secret} must not be forwarded into the isolated run`,
    );
  }
  assert.ok(
    !forwarded.includes("stub-must-not-cross"),
    "no value of an unforwarded variable may appear in the isolated environment",
  );
  // The environment is the allowlist and nothing else.
  const names = forwarded
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(0, line.indexOf("=")))
    .filter((name) => name !== "" && name !== "_" && name !== "PWD" && name !== "SHLVL");
  assert.deepEqual(
    [...new Set(names)].sort(),
    [
      "CI",
      "HOME",
      "LANG",
      "LC_ALL",
      "LC_CTYPE",
      "NPM_CONFIG_UPDATE_NOTIFIER",
      "PATH",
      "REVIEW_HEAD_SHA",
      "TZ",
    ],
    "the isolated environment must be exactly the launcher's allowlist",
  );
}

// ------------------------------------------------------------------
// 5. Baseline acceptance cannot reach an offline verification run.
// ------------------------------------------------------------------
{
  const s = scenario();
  const result = s.run(["visual", s.logPath, s.command], { AZALENS_ACCEPT_BASELINES: "1" });

  assert.equal(result.status, 2, `expected exit 2, got ${result.status}:\n${result.output}`);
  assert.match(result.output, /AZALENS_ACCEPT_BASELINES is set/);
  assert.equal(result.argv, null, "the suite must not run at all when baseline acceptance is set");
}
{
  // The inner stage refuses it too, so the guard does not depend on the outer
  // stage being the only way in.
  const s = scenario();
  const result = spawnSync(
    LAUNCHER,
    [
      "--isolated",
      "visual",
      HOST_NETNS,
      String(uid),
      String(gid),
      s.root,
      s.bin,
      s.work,
      "AZALENS_ACCEPT_BASELINES=1",
      "--",
      s.command,
    ],
    { cwd: s.work, encoding: "utf8", env: { PATH: s.bin, HOME: s.root } },
  );

  assert.equal(result.status, 2, `inner guard expected exit 2, got ${result.status}`);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /AZALENS_ACCEPT_BASELINES must never be forwarded/,
  );
}

// ------------------------------------------------------------------
// 6. Argument boundaries survive three quoting layers unchanged.
// ------------------------------------------------------------------
{
  const s = scenario();
  const awkward = [
    "two words",
    "single'quote",
    'double"quote',
    "$(touch /tmp/azalens-should-never-exist)",
    "`id`",
    "*",
    "a;b|c&d",
    "trailing space ",
    "--",
    "-",
    "back\\slash",
    "new\nline",
  ];
  const result = s.run(["e2e", s.logPath, s.command, ...awkward]);

  assert.equal(result.status, 0, `argument scenario exited ${result.status}:\n${result.output}`);
  assert.equal(
    result.argv,
    `ARGC=${awkward.length}\n${awkward.map((a) => `ARG=[${a}]\n`).join("")}`,
    "every argument must arrive byte-identical, unsplit and unexpanded",
  );
  assert.ok(
    !fs.existsSync("/tmp/azalens-should-never-exist"),
    "an argument that looks like a command substitution must never be evaluated",
  );
}

// ------------------------------------------------------------------
// 7. A malformed invocation is refused, never partially honoured.
// ------------------------------------------------------------------
{
  const s = scenario();
  const cases = [
    // Argument-shape refusals carry exit 2 ...
    [2, [], /Usage: run-offline\.sh/],
    [2, ["e2e"], /Usage: run-offline\.sh/],
    [2, ["e2e", s.logPath], /Usage: run-offline\.sh/],
    [2, ["", s.logPath, s.command], /isolation label must not be empty/],
    [2, ["e2e", "", s.command], /log path must not be empty/],
    [2, ["e2e", path.join(s.root, "no-such-dir/offline.log"), s.command], /does not exist/],
    // ... and a command that is not on PATH is an environment refusal, exit 3,
    // deliberately distinct so a workflow can tell the two apart.
    [3, ["e2e", s.logPath, "azalens-command-that-does-not-exist"], /was not found on PATH/],
  ];

  for (const [expectedStatus, args, expected] of cases) {
    const result = s.run(args);
    assert.equal(
      result.status,
      expectedStatus,
      `malformed invocation ${JSON.stringify(args)} must exit ${expectedStatus}, got ${result.status}`,
    );
    assert.match(result.output, expected);
    assert.equal(result.argv, null, "no suite may run for a malformed invocation");
  }
}
{
  // A missing privilege tool is a hard stop with its own exit code, not a
  // silent fallback to an unisolated run.
  for (const tool of ["sudo", "unshare", "setpriv", "ip", "readlink", "tee"]) {
    const s = scenario({ omitTools: [tool] });
    const result = s.run(["e2e", s.logPath, s.command]);

    assert.equal(
      result.status,
      3,
      `a missing ${tool} must exit 3, got ${result.status}:\n${result.output}`,
    );
    assert.match(result.output, new RegExp(`Required executable '${tool}' is not available`));
    assert.equal(result.argv, null, `no suite may run without ${tool}`);
  }
}

// ------------------------------------------------------------------
// 8. Nothing in this file reached the network or a provider.
// ------------------------------------------------------------------
{
  // The only routing question the launcher asks is a kernel lookup of the
  // RFC 5737 documentation address, which is reserved and routed nowhere.
  const source = fs.readFileSync(LAUNCHER, "utf8");
  assert.match(source, /RESERVED_PROBE_ADDRESS="192\.0\.2\.1"/);
  const probes = source.match(/ip route get "\$RESERVED_PROBE_ADDRESS"/g) ?? [];
  assert.equal(probes.length, 1, "the launcher must probe exactly the one reserved address");
}

console.log(
  "Offline namespace launcher contract passed: isolation proofs load-bearing, " +
    "exit status propagated, environment allowlisted, arguments preserved, " +
    "malformed invocations refused.",
);
