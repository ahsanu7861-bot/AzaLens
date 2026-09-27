"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { databaseContainer, readStatus, sql } = require("./helpers/localSupabase");

const listOnly = process.argv.length === 3 && process.argv[2] === "--list";
assert.ok(process.argv.length === 2 || listOnly, "usage: node tests/testRiskDecisionParity.js [--list]");

const SELECTED_CASE_COUNT = 37;
const cases = [
  "opening: missing stop > aggregate > daily > weekly > capacity (per-position not evaluable without stop)",
  "opening: per-position > aggregate > daily > weekly > capacity",
  "opening: aggregate > daily > weekly > capacity",
  "opening: daily > weekly > capacity",
  "opening: weekly > capacity",
  "opening: capacity",
  "increase: per-position > aggregate > daily > weekly",
  "increase: aggregate > daily > weekly",
  "increase: daily > weekly",
  "increase: weekly",
  "stop loosening: per-position > aggregate > daily > weekly",
  "stop loosening: aggregate > daily > weekly",
  "stop loosening: daily > weekly",
  "stop loosening: weekly",
  "unavailable new-risk policy does not block stop tightening or broker-confirmed exit recording",
  "rejected new risk does not block stop tightening or broker-confirmed exit recording",
  ...["opening", "increase", "stop loosening"].flatMap((action) =>
    ["P8001", "P8002", "P8003", "P8004", "P8005"].map((code) => `${action}: ${code} reference-precondition precedence`)
  ),
  ...["opening", "increase", "stop loosening"].flatMap((action) => [
    `${action}: P8010 schedule proceeds bound precedence`,
    `${action}: P8011 schedule quantity bound`,
  ]),
];
assert.equal(cases.length, SELECTED_CASE_COUNT, "selected-case declaration must match the independently maintained case matrix");

if (listOnly) {
  for (const name of cases) console.log(`SELECTED risk decision parity: ${name}`);
  console.log(`COLLECTION risk decision parity: ${cases.length} cases; local database required; excluded from provider-free test:ci.`);
  process.exit(0);
}

readStatus();
const fixturePath = path.join(__dirname, "fixtures/riskDecisionParity.sql");
const fixture = fs.readFileSync(fixturePath);
const fixtureSha256 = crypto.createHash("sha256").update(fixture).digest("hex");
const tables = [
  ["auth", "users"],
  ["public", "personal_risk_policy_versions"],
  ["public", "broker_equity_snapshots"],
  ["public", "daily_risk_equity_bases"],
  ["public", "weekly_risk_equity_bases"],
  ["public", "broker_cost_schedule_versions"],
  ["public", "broker_cost_schedule_components"],
  ["public", "outcome_decision_snapshots"],
  ["public", "outcome_snapshot_provenance"],
  ["public", "outcome_positions"],
  ["public", "outcome_position_events"],
  ["public", "outcome_position_risk_state"],
  ["public", "outcome_position_increases"],
  ["public", "outcome_protective_stop_changes"],
  ["public", "outcome_exit_cost_allocations"],
  ["public", "personal_risk_evaluations"],
];
const countQuery = `select jsonb_build_object('pid',pg_backend_pid(),'counts',jsonb_object_agg(name,n),'markers',sum(markers))::text from (${tables.map(([schema, table]) => `select '${schema}.${table}' name,count(*) n,count(*) filter(where ${table === "users" ? "coalesce(email,'') like 'risk-decision-parity-%'" : "user_id::text like 'd0080000-%'"}) markers from ${schema}.${table}`).join(" union all ")}) q`;
const snapshot = () => JSON.parse(sql(countQuery));
const before = snapshot();
assert.equal(Number(before.markers), 0, "ordinary local database must not contain decision-parity fixture markers before the run");

const run = spawnSync("docker", ["exec", "-i", databaseContainer(), "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
  input: fixture,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});
const testPid = Number(run.stdout.match(/DECISION_PARITY_TEST_PID=(\d+)/)?.[1]);
assert.ok(Number.isInteger(testPid), "transaction session must report pg_backend_pid()");
const after = snapshot();
assert.notEqual(after.pid, testPid, "post-test proof must use a separate PostgreSQL backend");
assert.deepEqual(after.counts, before.counts, "every covered table count must exactly match after rollback");
assert.equal(Number(after.markers), 0, "no fixture user marker may survive rollback");
if (run.status !== 0) {
  process.stdout.write(run.stdout || "");
  process.stderr.write(run.stderr || "");
  console.error(`PASS failure rollback: separate backend PID ${after.pid} differs from transaction PID ${testPid}; exact before/after counts match; fixture markers=0.`);
  process.exit(run.status ?? 1);
}
assert.match(run.stdout, /DECISION_PARITY_ASSERTIONS_OK/);
assert.match(run.stdout, /DECISION_PARITY_ROLLBACK_OK/);
const completedCases = Number(run.stdout.match(/DECISION_PARITY_CASES_COMPLETED=(\d+)/)?.[1]);
assert.equal(completedCases, SELECTED_CASE_COUNT, "only fully asserted SQL cases may advance the completion counter");

process.stdout.write(run.stdout);
console.log(`COUNTS_BEFORE=${JSON.stringify(before.counts)}`);
console.log(`COUNTS_AFTER=${JSON.stringify(after.counts)}`);
console.log(`PASS risk decision parity: ${completedCases} actual Migration 008 RPC cases passed from fixture SHA-256 ${fixtureSha256}.`);
console.log(`PASS rollback: explicit success marker observed; separate backend PID ${after.pid} differs from transaction PID ${testPid}; exact before/after counts match; fixture markers=0.`);
