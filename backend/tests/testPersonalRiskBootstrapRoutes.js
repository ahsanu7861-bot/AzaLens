"use strict";

const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const { createPersonalRiskBootstrapRouter, normalizeEquity, normalizeTimestamp } = require("../routes/personalRiskBootstrapRoutes");
const { createRequestObservability, resetObservabilityForTests } = require("../utils/observability");

const KEY = "123e4567-e89b-42d3-a456-426614174000";
const NOW = Date.parse("2026-09-22T12:00:00Z");

async function withServer(service, work, logger = null) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: "owner" }; req.db = {}; next(); });
  if (logger) app.use(createRequestObservability({ logger }));
  app.use("/api/personal-risk", createPersonalRiskBootstrapRouter({ bootstrapService: service, now: () => NOW }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try { await work(`http://127.0.0.1:${server.address().port}`); } finally { await new Promise((resolve) => server.close(resolve)); }
}

async function rawRequest(base, path, rawHeaders) {
  const target = new URL(`${base}${path}`);
  const payload = JSON.stringify({ confirmed: true });
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: target.hostname, port: target.port, path: target.pathname,
      method: "POST", headers: [...rawHeaders, "Content-Length", Buffer.byteLength(payload)] }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: body ? JSON.parse(body) : null }));
    });
    req.once("error", reject);
    req.end(payload);
  });
}

async function request(base, path, { method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

(async () => {
  assert.equal(normalizeEquity("2533.17"), "2533.17");
  for (const bad of [2533.17, "0", "-1", "+1", "1e2", "01", "1.123456789", "10000000000000000"]) assert.throws(() => normalizeEquity(bad));
  assert.equal(normalizeTimestamp("2026-09-21T20:00:37+05:00", NOW), "2026-09-21T15:00:37Z");
  assert.equal(normalizeTimestamp("2026-09-22T12:00:00Z", NOW), "2026-09-22T12:00:00Z", "equality with server time passes");
  assert.throws(() => normalizeTimestamp("2026-09-22T12:00:00Z", NOW - 1), /later than current server time/, "one millisecond in the future fails");
  for (const bad of ["2026-09-21T20:00:37", "2026-02-30T00:00:00Z", "2026-09-22T12:00:01Z", "2026-09-21t20:00:37z", "2026-09-21T20:00:37.1Z"]) assert.throws(() => normalizeTimestamp(bad, NOW));

  const calls = [];
  const service = {
    createPolicy: async (input) => (calls.push(["policy", input]), { policyVersionId: "p", versionNo: "1", replayed: false }),
    createSchedule: async (input) => (calls.push(["schedule", input]), { scheduleVersionId: "s", versionNo: "1", replayed: true }),
    createEquity: async (input) => (calls.push(["equity", input]), { equitySnapshotId: "e", dailyBasisId: "d", weeklyBasisId: "w", dailyEffectiveEquity: "1", weeklyEffectiveEquity: "1", replayed: false }),
    getStatus: async (input) => (calls.push(["status", input]), { bootstrapComplete: false }),
  };
  await withServer(service, async (base) => {
    let response = await request(base, "/api/personal-risk/policy-versions", { method: "POST", headers: { "Idempotency-Key": KEY }, body: { confirmed: true } });
    assert.equal(response.status, 201);
    assert.deepEqual(Object.keys(calls[0][1]).sort(), ["db", "idempotencyKey", "userId"]);
    response = await request(base, "/api/personal-risk/cost-schedules", { method: "POST", headers: { "Idempotency-Key": KEY }, body: { confirmed: true } });
    assert.equal(response.status, 200, "exact replay uses 200");
    response = await request(base, "/api/personal-risk/equity-snapshots", { method: "POST", headers: { "Idempotency-Key": KEY }, body: { accountEquity: "2533.17", observedAt: "2026-09-21T20:00:37+05:00", accountValueConfirmed: true, basisTighteningConfirmed: false } });
    assert.equal(response.status, 201);
    assert.equal(calls[2][1].observedAt, "2026-09-21T15:00:37Z");
    response = await request(base, `/api/personal-risk/bootstrap-status?operation=POLICY_VERSION&observedAt=2026-09-21T15%3A00%3A37Z`, { headers: { "Idempotency-Key": KEY } });
    assert.equal(response.status, 200);
    assert.equal(calls[3][1].idempotencyKey, KEY);

    const invalid = [
      ["/policy-versions", { confirmed: true, max: "override" }, { "Idempotency-Key": KEY }],
      ["/policy-versions", { confirmed: true, idempotencyKey: KEY }, { "Idempotency-Key": KEY }],
      ["/policy-versions?key=x", { confirmed: true }, { "Idempotency-Key": KEY }],
      ["/policy-versions", { confirmed: true }, { "X-Idempotency-Key": KEY }],
      ["/policy-versions", { confirmed: true }, { "Idempotency_Key": KEY }],
      ["/policy-versions", { confirmed: true }, { "X.Idempotency.Marker": KEY }],
      ["/policy-versions", { confirmed: true }, { "Idempotency-Key": KEY, "X-Idempotency-Key": KEY }],
      ["/policy-versions", { confirmed: true }, { "Idempotency-Key": KEY.toUpperCase() }],
    ];
    for (const [path, body, headers] of invalid) {
      response = await request(base, `/api/personal-risk${path}`, { method: "POST", body, headers });
      assert.equal(response.status, 400, path);
      assert.equal(response.body.code, "PERSONAL_RISK_INPUT_INVALID");
    }
    response = await request(base, "/api/personal-risk/bootstrap-status?operation=ARBITRARY_RPC", { headers: { "Idempotency-Key": KEY } });
    assert.equal(response.status, 400);
    response = await request(base, "/api/personal-risk/equity-snapshots", { method: "POST", headers: { "Idempotency-Key": KEY }, body: { accountEquity: "2533.17", observedAt: "2026-09-22T12:00:01Z", accountValueConfirmed: true, basisTighteningConfirmed: false } });
    assert.equal(response.status, 400);
    assert.deepEqual(response.body, { success: false, code: "PERSONAL_RISK_INPUT_INVALID", message: "observedAt must not be later than current server time." });

    response = await rawRequest(base, "/api/personal-risk/policy-versions", ["Content-Type", "application/json",
      "Idempotency-Key", KEY, "Idempotency-Key", "223e4567-e89b-42d3-a456-426614174000"]);
    assert.equal(response.status, 400, "duplicate canonical raw headers are rejected");
  });

  const codes = {
    IDEMPOTENCY_CONFLICT: 409, NUMERIC_PRECISION_INVALID: 400, PERSONAL_RISK_INPUT_INVALID: 400,
    PERSONAL_RISK_FORBIDDEN: 403, PERSONAL_RISK_UNAVAILABLE: 503, PERSONAL_RISK_RESPONSE_INVALID: 502,
  };
  for (const [code, status] of Object.entries(codes)) {
    await withServer({ ...service, createPolicy: async () => { const error = new Error("raw database secret"); error.code = code; throw error; } }, async (base) => {
      const response = await request(base, "/api/personal-risk/policy-versions", { method: "POST", headers: { "Idempotency-Key": KEY }, body: { confirmed: true } });
      assert.equal(response.status, status);
      assert.deepEqual(response.body, { success: false, code });
      assert.doesNotMatch(JSON.stringify(response.body), /raw|database|secret/i);
    });
  }
  resetObservabilityForTests();
  const sentinels = ["AUTH_SENTINEL_7f91", "COOKIE_SENTINEL_7f91", "123e4567-e89b-42d3-a456-426614174091",
    "12345678.12345678", "MESSAGE_SENTINEL_7f91", "DETAILS_SENTINEL_7f91", "HINT_SENTINEL_7f91", "SQL_SENTINEL_7f91"];
  const writes = [];
  const failure = Object.assign(new Error(sentinels[4]), { code: "XX999", details: sentinels[5], hint: sentinels[6], sql: sentinels[7] });
  await withServer({ ...service, createEquity: async () => { throw failure; } }, async (base) => {
    const response = await request(base, "/api/personal-risk/equity-snapshots", { method: "POST", headers: {
      Authorization: `Bearer ${sentinels[0]}`, Cookie: `session=${sentinels[1]}`, "Idempotency-Key": sentinels[2],
    }, body: { accountEquity: sentinels[3], observedAt: "2026-09-21T15:00:37Z",
      accountValueConfirmed: true, basisTighteningConfirmed: false } });
    assert.deepEqual(response, { status: 503, body: { success: false, code: "PERSONAL_RISK_UNAVAILABLE" } });
  }, (level, event, fields) => { writes.push(JSON.stringify({ level, event, fields })); });
  assert.equal(writes.length, 1, "unmapped failure emits at most one request log");
  const captured = writes.join("\n");
  for (const sentinel of sentinels) assert.equal(captured.includes(sentinel), false, sentinel);
  assert.doesNotMatch(captured, /authorization|cookie|idempotency-key|accountEquity|req\.body|req\.headers/i);
  assert.match(captured, /"event":"http_request"/);
  console.log("PASS route: zero-future-skew boundary (equal accepted; +1ms rejected) and explicit Z/numeric-offset validation.");
  console.log("PASS route: public future-time error is PERSONAL_RISK_INPUT_INVALID with a safe, explicit message.");
  console.log("PASS route: real observability middleware captured one safe log; headers, body and database diagnostic sentinels were absent.");
  console.log("Personal-risk bootstrap route validation and redaction contracts passed.");
})().catch((error) => { console.error(error); process.exit(1); });
