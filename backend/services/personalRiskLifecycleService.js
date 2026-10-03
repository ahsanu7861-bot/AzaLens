"use strict";

const RPC = Object.freeze({
  PARTIAL_EXIT: "append_risk_lifecycle_event",
  FINAL_EXIT: "append_risk_lifecycle_event",
  TIGHTEN_STOP: "tighten_outcome_protective_stop",
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTEGER = /^(?:0|[1-9][0-9]*)$/;
const DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const EVIDENCE_CLASSES = new Set(["OWNER_DECLARED", "BROKER_CONFIRMED"]);

class LifecycleError extends Error {
  constructor(code, internalCode, status, phase, options = {}) {
    super(code);
    this.code = code;
    this.internalCode = internalCode;
    this.status = status;
    this.phase = phase;
    this.commitState = options.commitState || "NOT_DISPATCHED";
    this.recoveryRequired = Boolean(options.recoveryRequired);
    this.mutationId = options.mutationId || null;
  }
}

function failure(code, internalCode, status, phase, options) {
  throw new LifecycleError(code, internalCode, status, phase, options);
}

function requireContext(db, userId) {
  if (!db || typeof db.rpc !== "function" || typeof db.from !== "function" || !UUID.test(String(userId))) {
    failure("LIFECYCLE_UNAVAILABLE", "LIFECYCLE_CONTEXT_UNAVAILABLE", 503, "context");
  }
}

function canonical(value, pattern = DECIMAL) {
  if (typeof value !== "string" || !pattern.test(value)) {
    failure("LIFECYCLE_RESPONSE_INVALID", "LIFECYCLE_RPC_RESPONSE_INVALID", 502, "readback");
  }
  return value;
}

function integer(value) { return canonical(value, INTEGER); }

function databaseFailure(error) {
  if (!error) return;
  const transportCode = String(error.code || "").toUpperCase();
  const transportName = String(error.name || "").toUpperCase();
  if (/^(?:ECONN|ETIMEDOUT|ABORT_ERR|UND_ERR)/.test(transportCode) ||
      transportName === "FETCHERROR" || transportName === "ABORTERROR") {
    failure("LIFECYCLE_COMMIT_UNKNOWN", "LIFECYCLE_RPC_COMMIT_AMBIGUOUS", 503, "rpc",
      { commitState: "UNKNOWN", recoveryRequired: true });
  }
  const mapped = {
    "23505": ["IDEMPOTENCY_CONFLICT", 409],
    "22003": ["NUMERIC_PRECISION_INVALID", 400],
    "22023": ["LIFECYCLE_INPUT_INVALID", 400],
    "42501": ["LIFECYCLE_FORBIDDEN", 403],
    "42883": ["LIFECYCLE_UNAVAILABLE", 503],
  }[String(error.code)];
  if (mapped) failure(mapped[0], "LIFECYCLE_RPC_REJECTED", mapped[1], "rpc");
  failure("LIFECYCLE_COMMIT_UNKNOWN", "LIFECYCLE_RPC_COMMIT_AMBIGUOUS", 503, "rpc",
    { commitState: "UNKNOWN", recoveryRequired: true });
}

function mutationResponse(data, operation) {
  if (!data || Array.isArray(data) || typeof data !== "object" || typeof data.replayed !== "boolean") {
    failure("LIFECYCLE_RESPONSE_INVALID", "LIFECYCLE_RPC_RESPONSE_INVALID", 502, "rpc-response",
      { commitState: "UNKNOWN", recoveryRequired: true });
  }
  const id = operation === "TIGHTEN_STOP" ? data.stop_change_id : data.event_id;
  if (!(typeof id === "number" && Number.isSafeInteger(id) && id > 0) &&
      !(typeof id === "string" && INTEGER.test(id) && id !== "0")) {
    failure("LIFECYCLE_RESPONSE_INVALID", "LIFECYCLE_RPC_RESPONSE_INVALID", 502, "rpc-response",
      { commitState: "UNKNOWN", recoveryRequired: true });
  }
  if (operation === "TIGHTEN_STOP" && (data.accepted !== true || data.direction !== "TIGHTENING")) {
    failure("LIFECYCLE_RESPONSE_INVALID", "LIFECYCLE_RPC_RESPONSE_INVALID", 502, "rpc-response",
      { commitState: "UNKNOWN", recoveryRequired: true });
  }
  return { mutationId: String(id), replayed: data.replayed };
}

async function selected(query, recovery = false) {
  let result;
  try { result = await query; } catch (_) {
    failure(recovery ? "LIFECYCLE_RECOVERY_UNAVAILABLE" : "LIFECYCLE_COMMITTED_READBACK_PENDING",
      recovery ? "LIFECYCLE_RECOVERY_LOOKUP_FAILED" : "LIFECYCLE_POST_COMMIT_READBACK_FAILED", 503,
      recovery ? "recovery" : "readback", { commitState: recovery ? "UNKNOWN" : "COMMITTED", recoveryRequired: true });
  }
  if (result?.error) {
    failure(recovery ? "LIFECYCLE_RECOVERY_UNAVAILABLE" : "LIFECYCLE_COMMITTED_READBACK_PENDING",
      recovery ? "LIFECYCLE_RECOVERY_LOOKUP_FAILED" : "LIFECYCLE_POST_COMMIT_READBACK_FAILED", 503,
      recovery ? "recovery" : "readback", { commitState: recovery ? "UNKNOWN" : "COMMITTED", recoveryRequired: true });
  }
  if (!Array.isArray(result?.data)) {
    failure("LIFECYCLE_RESPONSE_INVALID", "LIFECYCLE_RPC_RESPONSE_INVALID", 502,
      recovery ? "recovery" : "readback",
      { commitState: recovery ? "UNKNOWN" : "COMMITTED", recoveryRequired: true });
  }
  return result.data;
}

function exitResult(row, operation, replayed) {
  const expected = operation === "PARTIAL_EXIT" ? "PARTIAL_EXIT_CONFIRMED" : "FINAL_EXIT_CONFIRMED";
  if (!row || row.event_type !== expected || row.broker_confirmed !== true) {
    failure("LIFECYCLE_RESPONSE_INVALID", "LIFECYCLE_RPC_RESPONSE_INVALID", 502, "readback");
  }
  return {
    operation, eventId: integer(row.id_text), positionId: row.position_id,
    openQuantity: canonical(row.result_open_quantity_text), realizedPnl: canonical(row.result_realized_pl_text),
    brokerEffectiveAt: row.broker_effective_at, replayed,
  };
}

// A supplied expected class is always compared (never skipped as falsy); a durable row must carry a known class.
function stopResult(row, replayed, expectedEvidenceClass = null) {
  if (!row || row.direction !== "TIGHTENING" || !EVIDENCE_CLASSES.has(row.evidence_class) ||
      (expectedEvidenceClass != null && row.evidence_class !== expectedEvidenceClass)) {
    failure("LIFECYCLE_RESPONSE_INVALID", "LIFECYCLE_RPC_RESPONSE_INVALID", 502, "readback");
  }
  return { operation: "TIGHTEN_STOP", stopChangeId: integer(row.id_text), positionId: row.position_id,
    priorStop: canonical(row.prior_stop_text), newStop: canonical(row.new_stop_text),
    evidenceClass: row.evidence_class, direction: row.direction, replayed };
}

async function readback({ db, userId, operation, positionId, idempotencyKey, mutationId = null,
  expectedEvidenceClass = null, recovery = false }) {
  const isStop = operation === "TIGHTEN_STOP";
  const table = isStop ? "outcome_protective_stop_changes" : "outcome_position_events";
  const columns = isStop
    ? "id_text:id::text,position_id,client_idempotency_key,prior_stop_text:prior_stop::text,new_stop_text:new_stop::text,evidence_class,direction"
    : "id_text:id::text,position_id,client_idempotency_key,event_type,broker_confirmed,broker_effective_at,result_open_quantity_text:result_open_quantity::text,result_realized_pl_text:result_realized_pl::text";
  let rows;
  try {
    let query = db.from(table).select(columns).eq("user_id", userId).eq("position_id", positionId)
      .eq("client_idempotency_key", idempotencyKey).limit(2);
    if (mutationId) query = query.eq("id", mutationId);
    rows = await selected(query, recovery);
  } catch (error) {
    if (error instanceof LifecycleError) throw error;
    failure(recovery ? "LIFECYCLE_RECOVERY_UNAVAILABLE" : "LIFECYCLE_COMMITTED_READBACK_PENDING",
      recovery ? "LIFECYCLE_RECOVERY_LOOKUP_FAILED" : "LIFECYCLE_POST_COMMIT_READBACK_FAILED", 503,
      recovery ? "recovery" : "readback",
      { commitState: recovery ? "UNKNOWN" : "COMMITTED", recoveryRequired: true, mutationId });
  }
  if (recovery && rows.length === 0) return { operation, state: "NOT_FOUND", positionId };
  if (rows.length !== 1) {
    if (!recovery && rows.length === 0) {
      failure("LIFECYCLE_COMMITTED_READBACK_PENDING", "LIFECYCLE_POST_COMMIT_READBACK_FAILED", 503,
        "readback", { commitState: "COMMITTED", recoveryRequired: true, mutationId });
    }
    failure("LIFECYCLE_RESPONSE_INVALID", "LIFECYCLE_RPC_RESPONSE_INVALID", 502,
      recovery ? "recovery" : "readback",
      { commitState: recovery ? "UNKNOWN" : "COMMITTED", recoveryRequired: true, mutationId });
  }
  if (rows[0].position_id !== positionId || rows[0].client_idempotency_key !== idempotencyKey ||
      (mutationId && String(rows[0].id_text) !== mutationId)) {
    failure("LIFECYCLE_RESPONSE_INVALID", "LIFECYCLE_RPC_RESPONSE_INVALID", 502, recovery ? "recovery" : "readback",
      { commitState: recovery ? "UNKNOWN" : "COMMITTED", recoveryRequired: true, mutationId });
  }
  const result = isStop ? stopResult(rows[0], true, expectedEvidenceClass) : exitResult(rows[0], operation, true);
  return recovery ? { ...result, state: "COMMITTED" } : result;
}

async function record({ db, userId, operation, positionId, idempotencyKey, values }) {
  requireContext(db, userId);
  const args = operation === "TIGHTEN_STOP" ? {
    p_position_id: positionId, p_idempotency_key: idempotencyKey,
    p_new_stop: values.newStop, p_evidence_class: values.evidenceClass,
  } : {
    p_position_id: positionId, p_idempotency_key: idempotencyKey,
    p_event_type: operation === "PARTIAL_EXIT" ? "PARTIAL_EXIT_CONFIRMED" : "FINAL_EXIT_CONFIRMED",
    p_broker_confirmed: true, p_broker_effective_at: values.brokerEffectiveAt,
    p_price: values.price, p_quantity: values.quantity, p_fees: values.fees, p_taxes: values.taxes,
    p_thesis_result: null, p_usefulness: null, p_exit_reason: values.exitReason, p_owner_note: null,
  };
  let result;
  try { result = await db.rpc(RPC[operation], args); } catch (_) {
    failure("LIFECYCLE_COMMIT_UNKNOWN", "LIFECYCLE_RPC_COMMIT_AMBIGUOUS", 503, "rpc",
      { commitState: "UNKNOWN", recoveryRequired: true });
  }
  databaseFailure(result?.error);
  const mutation = mutationResponse(result?.data, operation);
  let value;
  try {
    value = await readback({ db, userId, operation, positionId, idempotencyKey,
      mutationId: mutation.mutationId,
      expectedEvidenceClass: operation === "TIGHTEN_STOP" ? values.evidenceClass : null, recovery: false });
  } catch (error) {
    if (error instanceof LifecycleError) {
      error.commitState = "COMMITTED";
      error.recoveryRequired = true;
      error.mutationId = mutation.mutationId;
    }
    throw error;
  }
  return { ...value, replayed: mutation.replayed };
}

async function recover(input) {
  requireContext(input.db, input.userId);
  try {
    return await readback({ ...input, recovery: true });
  } catch (error) {
    if (error instanceof LifecycleError) {
      error.commitState = "UNKNOWN";
      error.recoveryRequired = true;
    }
    throw error;
  }
}

module.exports = { LifecycleError, RPC, record, recover };
