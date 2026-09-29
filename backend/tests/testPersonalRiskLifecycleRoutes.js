"use strict";

const assert = require("node:assert/strict");
const express = require("express");
const { createPersonalRiskLifecycleRouter } = require("../routes/personalRiskLifecycleRoutes");
const lifecycleService = require("../services/personalRiskLifecycleService");
const { createRequestObservability, resetObservabilityForTests } = require("../utils/observability");

const OWNER = "10000000-0000-4000-8000-000000000001";
const POSITION = "20000000-0000-4000-8000-000000000002";
const KEY = "30000000-0000-4000-8000-000000000003";
const exit = { positionId: POSITION, brokerConfirmed: true, brokerEffectiveAt: "2026-09-18T15:00:00Z",
  price: "120", quantity: "2", fees: "0.4", taxes: "0.1", exitReason: null };

async function server(service, logger, work) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: OWNER }; req.db = {}; next(); });
  app.use(createRequestObservability({ logger }));
  app.use("/api/personal-risk", createPersonalRiskLifecycleRouter({ lifecycleService: service, logger }));
  const listener = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => listener.once("listening", resolve));
  try { await work(`http://127.0.0.1:${listener.address().port}`); } finally { await new Promise((resolve) => listener.close(resolve)); }
}
async function request(base, path, options = {}) {
  const response = await fetch(base + path, { method: options.method || "GET", headers: { "content-type": "application/json",
    ...(options.headers || {}) }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  return { status: response.status, body: await response.json() };
}

(async () => {
  const calls = [];
  const service = { record: async (value) => (calls.push(value), { operation: value.operation, replayed: false }),
    recover: async (value) => (calls.push(value), { operation: value.operation, state: "NOT_FOUND" }) };
  await server(service, () => {}, async (base) => {
    let response;
    for (const [path, operation, body] of [
      ["/lifecycle/partial-exits", "PARTIAL_EXIT", exit],
      ["/lifecycle/final-exits", "FINAL_EXIT", exit],
      ["/lifecycle/protective-stop-tightenings", "TIGHTEN_STOP", { positionId: POSITION, newStop: "100", evidenceClass: "OWNER_DECLARED" }],
    ]) {
      const response = await request(base, `/api/personal-risk${path}`, { method: "POST", headers: { "Idempotency-Key": KEY }, body });
      assert.equal(response.status, 201, path);
      assert.equal(calls.at(-1).operation, operation);
      assert.equal(calls.at(-1).idempotencyKey, KEY);
    }
    assert.equal(calls.at(-1).values.evidenceClass, "OWNER_DECLARED");
    service.record = async (value) => (calls.push(value), { operation: value.operation, replayed: true });
    response = await request(base, "/api/personal-risk/lifecycle/protective-stop-tightenings", { method: "POST",
      headers: { "Idempotency-Key": KEY }, body: { positionId: POSITION, newStop: "100", evidenceClass: "BROKER_CONFIRMED" } });
    assert.equal(response.status, 200, "exact replay HTTP contract");
    assert.equal(calls.at(-1).values.evidenceClass, "BROKER_CONFIRMED");
    response = await request(base, `/api/personal-risk/lifecycle/recovery?operation=TIGHTEN_STOP&positionId=${POSITION}`,
      { headers: { "Idempotency-Key": KEY } });
    assert.equal(response.status, 200);
    assert.equal(calls.at(-1).operation, "TIGHTEN_STOP");
    for (const body of [{ ...exit, userId: OWNER }, { ...exit, owner_id: OWNER }, { ...exit, riskPolicyId: POSITION },
      { ...exit, brokerConfirmed: false }, { ...exit, extra: true }]) {
      response = await request(base, "/api/personal-risk/lifecycle/partial-exits", { method: "POST", headers: { "Idempotency-Key": KEY }, body });
      assert.equal(response.status, 400);
    }
    for (const evidenceClass of ["", "owner_declared", "ARBITRARY", null, true]) {
      response = await request(base, "/api/personal-risk/lifecycle/protective-stop-tightenings", { method: "POST",
        headers: { "Idempotency-Key": KEY }, body: { positionId: POSITION, newStop: "100", evidenceClass } });
      assert.equal(response.status, 400, String(evidenceClass));
    }
  });

  resetObservabilityForTests();
  const secrets = [KEY, "AUTH_SECRET", "98765.12345678", "NOTE_SECRET", "PG_DIAGNOSTIC_SECRET"];
  const output = [];
  const logger = (level, event, fields) => output.push(JSON.stringify({ level, event, fields }));
  const error = Object.assign(new Error(secrets[4]), { code: "LIFECYCLE_COMMIT_UNKNOWN", status: 503,
    internalCode: "LIFECYCLE_RPC_COMMIT_AMBIGUOUS", phase: "rpc", commitState: "UNKNOWN", recoveryRequired: true });
  await server({ record: async () => { throw error; }, recover: service.recover }, logger, async (base) => {
    const body = { ...exit, price: secrets[2], exitReason: secrets[3] };
    const response = await request(base, "/api/personal-risk/lifecycle/partial-exits", { method: "POST",
      headers: { "Idempotency-Key": KEY, Authorization: `Bearer ${secrets[1]}` }, body });
    assert.deepEqual(response, { status: 503, body: { success: false, code: "LIFECYCLE_COMMIT_UNKNOWN",
      recoveryRequired: true, commitState: "UNKNOWN" } });
  });
  const captured = output.join("\n");
  for (const secret of secrets) assert.equal(captured.includes(secret), false, secret);
  assert.match(captured, /LIFECYCLE_RPC_COMMIT_AMBIGUOUS/);
  assert.match(captured, /http_request/);

  const syncDiagnostic = "RAW_SYNC_QUERY_DIAGNOSTIC_91f4";
  const syncOutput = [];
  const syncLogger = (level, event, fields) => syncOutput.push(JSON.stringify({ level, event, fields }));
  const syncService = {
    record: (input) => lifecycleService.record({ ...input, db: {
      rpc: async () => ({ data: { accepted: true, stop_change_id: 9, direction: "TIGHTENING", replayed: false }, error: null }),
      from: () => { throw new Error(syncDiagnostic); },
    } }),
    recover: (input) => lifecycleService.recover({ ...input, db: {
      rpc: async () => ({ data: null, error: null }),
      from: () => { throw new Error(syncDiagnostic); },
    } }),
  };
  await server(syncService, syncLogger, async (base) => {
    const response = await request(base, "/api/personal-risk/lifecycle/protective-stop-tightenings", { method: "POST",
      headers: { "Idempotency-Key": KEY },
      body: { positionId: POSITION, newStop: "100", evidenceClass: "OWNER_DECLARED" } });
    assert.deepEqual(response, { status: 503, body: { success: false,
      code: "LIFECYCLE_COMMITTED_READBACK_PENDING", recoveryRequired: true, commitState: "COMMITTED" } });
    const recovery = await request(base,
      `/api/personal-risk/lifecycle/recovery?operation=TIGHTEN_STOP&positionId=${POSITION}`,
      { headers: { "Idempotency-Key": KEY } });
    assert.deepEqual(recovery, { status: 503, body: { success: false,
      code: "LIFECYCLE_RECOVERY_UNAVAILABLE", recoveryRequired: true, commitState: "UNKNOWN" } });
  });
  const syncCaptured = syncOutput.join("\n");
  assert.equal(syncCaptured.includes(syncDiagnostic), false);
  assert.match(syncCaptured, /LIFECYCLE_POST_COMMIT_READBACK_FAILED/);
  assert.match(syncCaptured, /LIFECYCLE_RECOVERY_LOOKUP_FAILED/);
  assert.match(syncCaptured, /"mutationId":"9"/);
  assert.match(syncCaptured, /http_request/);
  console.log("Personal-risk lifecycle routes, allowlists, stable states and actual middleware redaction passed.");
})().catch((error) => { console.error(error); process.exit(1); });
