"use strict";

const assert = require("node:assert/strict");
const { RPC, record, recover } = require("../services/personalRiskLifecycleService");

const OWNER = "10000000-0000-4000-8000-000000000001";
const POSITION = "20000000-0000-4000-8000-000000000002";
const KEY = "30000000-0000-4000-8000-000000000003";

function builder(result, calls) {
  const query = {
    select(value) { calls.push(["select", value]); return query; },
    eq(...value) { calls.push(["eq", ...value]); return query; },
    limit(value) { calls.push(["limit", value]); return query; },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
  };
  return query;
}

function database(rpcResult, readResult) {
  const calls = [];
  return { calls, rpc: async (name, args) => (calls.push(["rpc", name, args]), typeof rpcResult === "function" ? rpcResult() : rpcResult),
    from: (table) => (calls.push(["from", table]), builder(readResult, calls)) };
}

function synchronousReadbackFailure(stage, diagnostic = "RAW_SYNC_DIAGNOSTIC") {
  const fail = () => { throw new Error(diagnostic); };
  const query = {
    select() { if (stage === "select") fail(); return query; },
    eq() { if (stage === "eq") fail(); return query; },
    limit() { return query; },
    then(resolve) { resolve({ data: [], error: null }); },
  };
  return {
    rpc: async () => ({ data: { accepted: true, stop_change_id: 9, direction: "TIGHTENING", replayed: false }, error: null }),
    from() { if (stage === "from") fail(); return query; },
  };
}

async function rejects(work, code, internalCode, commitState) {
  await assert.rejects(work, (error) => error.code === code && error.internalCode === internalCode &&
    (!commitState || error.commitState === commitState));
}

async function postCommitInvalid(work, mutationId = "9") {
  await assert.rejects(work, (error) => error.code === "LIFECYCLE_RESPONSE_INVALID" &&
    error.internalCode === "LIFECYCLE_RPC_RESPONSE_INVALID" && error.status === 502 &&
    error.commitState === "COMMITTED" && error.recoveryRequired === true && error.mutationId === mutationId);
}

async function recoveryInvalid(work) {
  await assert.rejects(work, (error) => error.code === "LIFECYCLE_RESPONSE_INVALID" &&
    error.internalCode === "LIFECYCLE_RPC_RESPONSE_INVALID" && error.status === 502 &&
    error.commitState === "UNKNOWN" && error.recoveryRequired === true);
}

(async () => {
  const exitRow = { id_text: "7", position_id: POSITION, client_idempotency_key: KEY,
    event_type: "PARTIAL_EXIT_CONFIRMED", broker_confirmed: true, broker_effective_at: "2026-09-18T15:00:00+00:00",
    result_open_quantity_text: "4.00000000", result_realized_pl_text: "30.41666667" };
  let db = database({ data: { event_id: 7, open_quantity: 4, realized_pnl: 30.4, replayed: false }, error: null },
    { data: [exitRow], error: null });
  assert.deepEqual(await record({ db, userId: OWNER, operation: "PARTIAL_EXIT", positionId: POSITION, idempotencyKey: KEY,
    values: { brokerEffectiveAt: "2026-09-18T15:00:00Z", price: "120", quantity: "2", fees: "0.4", taxes: "0.1", exitReason: null } }),
  { operation: "PARTIAL_EXIT", eventId: "7", positionId: POSITION, openQuantity: "4.00000000",
    realizedPnl: "30.41666667", brokerEffectiveAt: "2026-09-18T15:00:00+00:00", replayed: false });
  const exitRpc = db.calls.find((call) => call[0] === "rpc");
  assert.equal(exitRpc[1], RPC.PARTIAL_EXIT);
  assert.equal(exitRpc[2].p_broker_confirmed, true);
  assert.equal(exitRpc[2].p_event_type, "PARTIAL_EXIT_CONFIRMED");
  assert.equal(exitRpc[2].p_thesis_result, null);
  assert.equal(db.calls.some((call) => call.includes("user_id") && call.includes(OWNER)), true);

  const stopRow = { id_text: "9", position_id: POSITION, client_idempotency_key: KEY,
    prior_stop_text: "99.00000000", new_stop_text: "100.00000000", evidence_class: "OWNER_DECLARED", direction: "TIGHTENING" };
  db = database({ data: { accepted: true, stop_change_id: 9, direction: "TIGHTENING", replayed: true }, error: null },
    { data: [stopRow], error: null });
  const stop = await record({ db, userId: OWNER, operation: "TIGHTEN_STOP", positionId: POSITION, idempotencyKey: KEY,
    values: { newStop: "100", evidenceClass: "OWNER_DECLARED" } });
  assert.equal(stop.newStop, "100.00000000");
  assert.equal(stop.replayed, true);
  const stopRpc = db.calls.find((call) => call[0] === "rpc");
  assert.equal(stopRpc[1], "tighten_outcome_protective_stop");
  assert.equal(stopRpc[2].p_evidence_class, "OWNER_DECLARED");
  assert.equal(JSON.stringify(db.calls).includes("change_outcome_protective_stop"), false);
  db = database({ data: { accepted: true, stop_change_id: 9, direction: "TIGHTENING", replayed: false }, error: null },
    { data: [{ ...stopRow, evidence_class: "BROKER_CONFIRMED" }], error: null });
  await record({ db, userId: OWNER, operation: "TIGHTEN_STOP", positionId: POSITION, idempotencyKey: KEY,
    values: { newStop: "100", evidenceClass: "BROKER_CONFIRMED" } });
  assert.equal(db.calls.find((call) => call[0] === "rpc")[2].p_evidence_class, "BROKER_CONFIRMED");
  db = database({ data: null, error: { code: "23505", message: "idempotency conflict" } }, { data: [], error: null });
  await rejects(() => record({ db, userId: OWNER, operation: "TIGHTEN_STOP", positionId: POSITION, idempotencyKey: KEY,
    values: { newStop: "100", evidenceClass: "BROKER_CONFIRMED" } }), "IDEMPOTENCY_CONFLICT", "LIFECYCLE_RPC_REJECTED");

  db = database(() => { throw new Error("socket disconnected SECRET"); }, { data: [], error: null });
  await rejects(() => record({ db, userId: OWNER, operation: "TIGHTEN_STOP", positionId: POSITION, idempotencyKey: KEY,
    values: { newStop: "100", evidenceClass: "OWNER_DECLARED" } }), "LIFECYCLE_COMMIT_UNKNOWN", "LIFECYCLE_RPC_COMMIT_AMBIGUOUS", "UNKNOWN");
  db = database({ data: null, error: { name: "FetchError", code: "ETIMEDOUT", message: "SECRET" } }, { data: [], error: null });
  await rejects(() => record({ db, userId: OWNER, operation: "TIGHTEN_STOP", positionId: POSITION, idempotencyKey: KEY,
    values: { newStop: "100", evidenceClass: "OWNER_DECLARED" } }), "LIFECYCLE_COMMIT_UNKNOWN", "LIFECYCLE_RPC_COMMIT_AMBIGUOUS", "UNKNOWN");
  db = database({ data: null, error: { message: "fetch failed" } }, { data: [], error: null });
  await rejects(() => record({ db, userId: OWNER, operation: "TIGHTEN_STOP", positionId: POSITION, idempotencyKey: KEY,
    values: { newStop: "100", evidenceClass: "BROKER_CONFIRMED" } }),
  "LIFECYCLE_COMMIT_UNKNOWN", "LIFECYCLE_RPC_COMMIT_AMBIGUOUS", "UNKNOWN");
  db = database({ data: { accepted: true, stop_change_id: 9, direction: "TIGHTENING", replayed: false }, error: null },
    { data: null, error: { code: "XX001", message: "SECRET" } });
  await rejects(() => record({ db, userId: OWNER, operation: "TIGHTEN_STOP", positionId: POSITION, idempotencyKey: KEY,
    values: { newStop: "100", evidenceClass: "BROKER_CONFIRMED" } }), "LIFECYCLE_COMMITTED_READBACK_PENDING", "LIFECYCLE_POST_COMMIT_READBACK_FAILED", "COMMITTED");
  db = database({ data: { accepted: true }, error: null }, { data: [], error: null });
  await rejects(() => record({ db, userId: OWNER, operation: "TIGHTEN_STOP", positionId: POSITION, idempotencyKey: KEY,
    values: { newStop: "100", evidenceClass: "OWNER_DECLARED" } }), "LIFECYCLE_RESPONSE_INVALID", "LIFECYCLE_RPC_RESPONSE_INVALID", "UNKNOWN");
  await rejects(() => record({ db: null, userId: OWNER, operation: "TIGHTEN_STOP", positionId: POSITION, idempotencyKey: KEY,
    values: { newStop: "100", evidenceClass: "OWNER_DECLARED" } }), "LIFECYCLE_UNAVAILABLE", "LIFECYCLE_CONTEXT_UNAVAILABLE");

  const success = { data: { accepted: true, stop_change_id: 9, direction: "TIGHTENING", replayed: false }, error: null };
  for (const malformed of [
    { ...stopRow, direction: "LOOSENING" },
    { ...stopRow, new_stop_text: "1e2" },
    { ...stopRow, position_id: "40000000-0000-4000-8000-000000000004" },
    { ...stopRow, client_idempotency_key: "50000000-0000-4000-8000-000000000005" },
    { ...stopRow, evidence_class: "BROKER_CONFIRMED" },
  ]) {
    db = database(success, { data: [malformed], error: null });
    await postCommitInvalid(() => record({ db, userId: OWNER, operation: "TIGHTEN_STOP", positionId: POSITION,
      idempotencyKey: KEY, values: { newStop: "100", evidenceClass: "OWNER_DECLARED" } }));
  }
  db = database(success, { data: [stopRow, stopRow], error: null });
  await postCommitInvalid(() => record({ db, userId: OWNER, operation: "TIGHTEN_STOP", positionId: POSITION,
    idempotencyKey: KEY, values: { newStop: "100", evidenceClass: "OWNER_DECLARED" } }));
  db = database(success, { data: { ...stopRow }, error: null });
  await postCommitInvalid(() => record({ db, userId: OWNER, operation: "TIGHTEN_STOP", positionId: POSITION,
    idempotencyKey: KEY, values: { newStop: "100", evidenceClass: "OWNER_DECLARED" } }));
  for (const stage of ["from", "select", "eq"]) {
    db = synchronousReadbackFailure(stage);
    await assert.rejects(() => record({ db, userId: OWNER, operation: "TIGHTEN_STOP", positionId: POSITION,
      idempotencyKey: KEY, values: { newStop: "100", evidenceClass: "OWNER_DECLARED" } }),
    (error) => error.code === "LIFECYCLE_COMMITTED_READBACK_PENDING" &&
      error.internalCode === "LIFECYCLE_POST_COMMIT_READBACK_FAILED" && error.status === 503 &&
      error.commitState === "COMMITTED" && error.recoveryRequired === true && error.mutationId === "9" &&
      !JSON.stringify(error).includes("RAW_SYNC_DIAGNOSTIC"), `mutation ${stage}`);
  }
  db = database({ data: { event_id: 7, replayed: false }, error: null },
    { data: [{ ...exitRow, event_type: "FINAL_EXIT_CONFIRMED" }], error: null });
  await postCommitInvalid(() => record({ db, userId: OWNER, operation: "PARTIAL_EXIT", positionId: POSITION,
    idempotencyKey: KEY, values: { brokerEffectiveAt: "2026-09-18T15:00:00Z", price: "120",
      quantity: "2", fees: "0.4", taxes: "0.1", exitReason: null } }), "7");

  db = database(null, { data: [stopRow], error: null });
  const recovered = await recover({ db, userId: OWNER, operation: "TIGHTEN_STOP", positionId: POSITION, idempotencyKey: KEY });
  assert.equal(recovered.state, "COMMITTED");
  assert.equal(db.calls.some((call) => call[0] === "rpc"), false, "recovery is non-mutating");
  db = database(null, { data: [], error: null });
  assert.equal((await recover({ db, userId: OWNER, operation: "TIGHTEN_STOP", positionId: POSITION, idempotencyKey: KEY })).state, "NOT_FOUND");
  db = database(null, { data: null, error: { code: "XX001" } });
  await rejects(() => recover({ db, userId: OWNER, operation: "TIGHTEN_STOP", positionId: POSITION, idempotencyKey: KEY }),
    "LIFECYCLE_RECOVERY_UNAVAILABLE", "LIFECYCLE_RECOVERY_LOOKUP_FAILED");
  for (const malformed of [{ ...stopRow, direction: "LOOSENING" }, { ...stopRow, prior_stop_text: "NaN" },
    { ...stopRow, position_id: "40000000-0000-4000-8000-000000000004" }]) {
    db = database(null, { data: [malformed], error: null });
    await recoveryInvalid(() => recover({ db, userId: OWNER, operation: "TIGHTEN_STOP", positionId: POSITION,
      idempotencyKey: KEY }));
  }
  db = database(null, { data: [stopRow, stopRow], error: null });
  await recoveryInvalid(() => recover({ db, userId: OWNER, operation: "TIGHTEN_STOP", positionId: POSITION,
    idempotencyKey: KEY }));
  db = database(null, { data: { ...stopRow }, error: null });
  await recoveryInvalid(() => recover({ db, userId: OWNER, operation: "TIGHTEN_STOP", positionId: POSITION,
    idempotencyKey: KEY }));
  for (const stage of ["from", "select", "eq"]) {
    db = synchronousReadbackFailure(stage);
    await assert.rejects(() => recover({ db, userId: OWNER, operation: "TIGHTEN_STOP", positionId: POSITION,
      idempotencyKey: KEY }), (error) => error.code === "LIFECYCLE_RECOVERY_UNAVAILABLE" &&
      error.internalCode === "LIFECYCLE_RECOVERY_LOOKUP_FAILED" && error.status === 503 &&
      error.commitState === "UNKNOWN" && error.recoveryRequired === true &&
      !JSON.stringify(error).includes("RAW_SYNC_DIAGNOSTIC"), `recovery ${stage}`);
  }
  console.log("Personal-risk lifecycle service contracts passed.");
})().catch((error) => { console.error(error); process.exit(1); });
