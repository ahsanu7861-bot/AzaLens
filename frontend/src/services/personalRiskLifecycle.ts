import axios from "axios";
import { api } from "./api";
import {
  EVIDENCE_CLASSES,
  LIFECYCLE_OPERATIONS,
  type CommitState,
  type EvidenceClass,
  type ExitRequest,
  type ExitResult,
  type LifecycleFailureCode,
  type LifecycleOperation,
  type LifecycleResult,
  type RecoveryResult,
  type StopRequest,
  type StopResult,
} from "../types/personalRiskLifecycle";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/**
 * Readback numerics are signed: a losing exit returns a negative `realizedPnl`. The bootstrap client's
 * unsigned DECIMAL must not be reused for these fields.
 */
const SIGNED_DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
/** Request decimals are unsigned and bounded exactly as the route validates them. */
const REQUEST_DECIMAL = /^(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,8})?$/;
const NONZERO_INTEGER = /^[1-9][0-9]*$/;

const ENDPOINTS: Record<LifecycleOperation, string> = {
  PARTIAL_EXIT: "/api/personal-risk/lifecycle/partial-exits",
  FINAL_EXIT: "/api/personal-risk/lifecycle/final-exits",
  TIGHTEN_STOP: "/api/personal-risk/lifecycle/protective-stop-tightenings",
};
const RECOVERY_ENDPOINT = "/api/personal-risk/lifecycle/recovery";

const REPORTED_CODES: LifecycleFailureCode[] = [
  "LIFECYCLE_INPUT_INVALID",
  "NUMERIC_PRECISION_INVALID",
  "LIFECYCLE_FORBIDDEN",
  "IDEMPOTENCY_CONFLICT",
  "LIFECYCLE_RESPONSE_INVALID",
  "LIFECYCLE_UNAVAILABLE",
  "LIFECYCLE_COMMIT_UNKNOWN",
  "LIFECYCLE_COMMITTED_READBACK_PENDING",
  "LIFECYCLE_RECOVERY_UNAVAILABLE",
  "CLOSED_DEMO_ACCESS_REQUIRED",
  "OWNER_IDENTITY_REQUIRED",
  "OWNER_ORIGIN_REQUIRED",
];

export class LifecycleClientError extends Error {
  readonly code: LifecycleFailureCode;
  readonly status?: number;
  readonly commitState?: CommitState;
  readonly recoveryRequired: boolean;

  constructor(
    code: LifecycleFailureCode,
    options: { status?: number; commitState?: CommitState; recoveryRequired?: boolean } = {},
  ) {
    super(code);
    this.code = code;
    this.status = options.status;
    this.commitState = options.commitState;
    this.recoveryRequired = Boolean(options.recoveryRequired);
  }
}

function invalid(): never {
  throw new LifecycleClientError("LIFECYCLE_RESPONSE_INVALID", { status: 502 });
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function exact(value: unknown, keys: string[]) {
  const record = object(value);
  if (Object.keys(record).sort().join("|") !== [...keys].sort().join("|")) invalid();
  return record;
}
function text(value: unknown) {
  if (typeof value !== "string") invalid();
  return value;
}
function uuid(value: unknown) {
  const result = text(value);
  if (!UUID.test(result)) invalid();
  return result;
}
function signed(value: unknown) {
  const result = text(value);
  if (!SIGNED_DECIMAL.test(result)) invalid();
  return result;
}
function mutationId(value: unknown) {
  const result = text(value);
  if (!NONZERO_INTEGER.test(result)) invalid();
  return result;
}
function timestamp(value: unknown) {
  const result = text(value);
  if (!Number.isFinite(Date.parse(result))) invalid();
  return result;
}
function flag(value: unknown) {
  if (typeof value !== "boolean") invalid();
  return value;
}
function evidenceClass(value: unknown): EvidenceClass {
  const result = text(value);
  if (!EVIDENCE_CLASSES.includes(result as EvidenceClass)) invalid();
  return result as EvidenceClass;
}

function exitResult(value: unknown, extraKeys: string[] = []): ExitResult {
  const r = exact(value, [
    "operation",
    "eventId",
    "positionId",
    "openQuantity",
    "realizedPnl",
    "brokerEffectiveAt",
    "replayed",
    ...extraKeys,
  ]);
  if (r.operation !== "PARTIAL_EXIT" && r.operation !== "FINAL_EXIT") invalid();
  return {
    operation: r.operation,
    eventId: mutationId(r.eventId),
    positionId: uuid(r.positionId),
    openQuantity: signed(r.openQuantity),
    realizedPnl: signed(r.realizedPnl),
    brokerEffectiveAt: timestamp(r.brokerEffectiveAt),
    replayed: flag(r.replayed),
  };
}

function stopResult(value: unknown, extraKeys: string[] = []): StopResult {
  const r = exact(value, [
    "operation",
    "stopChangeId",
    "positionId",
    "priorStop",
    "newStop",
    "evidenceClass",
    "direction",
    "replayed",
    ...extraKeys,
  ]);
  if (r.operation !== "TIGHTEN_STOP" || r.direction !== "TIGHTENING") invalid();
  return {
    operation: "TIGHTEN_STOP",
    stopChangeId: mutationId(r.stopChangeId),
    positionId: uuid(r.positionId),
    priorStop: signed(r.priorStop),
    newStop: signed(r.newStop),
    evidenceClass: evidenceClass(r.evidenceClass),
    direction: "TIGHTENING",
    replayed: flag(r.replayed),
  };
}

function envelope(value: unknown) {
  const wrapper = exact(value, ["success", "data"]);
  if (wrapper.success !== true) invalid();
  return wrapper.data;
}

function validateMutation(value: unknown, operation: LifecycleOperation): LifecycleResult {
  const data = envelope(value);
  const result = operation === "TIGHTEN_STOP" ? stopResult(data) : exitResult(data);
  if (result.operation !== operation) invalid();
  return result;
}

function validateRecovery(value: unknown, operation: LifecycleOperation): RecoveryResult {
  const data = envelope(value);
  const record = object(data);
  if (record.state === "NOT_FOUND") {
    const r = exact(data, ["operation", "state", "positionId"]);
    if (!LIFECYCLE_OPERATIONS.includes(r.operation as LifecycleOperation)) invalid();
    if (r.operation !== operation) invalid();
    return { operation: operation, state: "NOT_FOUND", positionId: uuid(r.positionId) };
  }
  if (record.state !== "COMMITTED") invalid();
  const result = operation === "TIGHTEN_STOP" ? stopResult(data, ["state"]) : exitResult(data, ["state"]);
  if (result.operation !== operation || result.replayed !== true) invalid();
  return { ...result, state: "COMMITTED" };
}

function safeError(error: unknown): never {
  if (error instanceof LifecycleClientError) throw error;
  if (!axios.isAxiosError(error)) throw new LifecycleClientError("NETWORK_AMBIGUOUS");
  const status = error.response?.status;
  const body = error.response?.data as Record<string, unknown> | undefined;
  const rawCode = body?.code;
  const code: LifecycleFailureCode = REPORTED_CODES.includes(rawCode as LifecycleFailureCode)
    ? (rawCode as LifecycleFailureCode)
    : status === 502
      ? "LIFECYCLE_RESPONSE_INVALID"
      : status === 503 || !error.response
        ? "NETWORK_AMBIGUOUS"
        : "LIFECYCLE_UNAVAILABLE";
  const commitState =
    body?.commitState === "COMMITTED" || body?.commitState === "UNKNOWN"
      ? (body.commitState as CommitState)
      : undefined;
  throw new LifecycleClientError(code, {
    status,
    commitState,
    recoveryRequired: body?.recoveryRequired === true,
  });
}

/**
 * A 2xx from a mutation route arrives only after the RPC committed and the backend read the row back.
 * A body that then fails client validation is therefore a COMMITTED outcome we cannot interpret, never an
 * undispatched one: it must never leave the caller's pending record retry-eligible.
 */
function committedIfInvalid<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof LifecycleClientError) {
      throw new LifecycleClientError(error.code, {
        status: error.status,
        commitState: "COMMITTED",
        recoveryRequired: true,
      });
    }
    throw error;
  }
}

function header(idempotencyKey: string) {
  if (!UUID.test(idempotencyKey)) throw new LifecycleClientError("LIFECYCLE_INPUT_INVALID", { status: 400 });
  return { "Idempotency-Key": idempotencyKey };
}

function exitBody(request: ExitRequest) {
  for (const value of [request.price, request.quantity]) {
    if (!REQUEST_DECIMAL.test(value) || /^0(?:\.0+)?$/.test(value)) {
      throw new LifecycleClientError("LIFECYCLE_INPUT_INVALID", { status: 400 });
    }
  }
  for (const value of [request.fees, request.taxes]) {
    if (!REQUEST_DECIMAL.test(value)) throw new LifecycleClientError("LIFECYCLE_INPUT_INVALID", { status: 400 });
  }
  if (!UUID.test(request.positionId) || !Number.isFinite(Date.parse(request.brokerEffectiveAt))) {
    throw new LifecycleClientError("LIFECYCLE_INPUT_INVALID", { status: 400 });
  }
  if (request.exitReason !== null && (request.exitReason.length < 1 || request.exitReason.length > 500)) {
    throw new LifecycleClientError("LIFECYCLE_INPUT_INVALID", { status: 400 });
  }
  // `exitReason` is always transmitted; the route rejects both an omitted key and an empty string.
  return {
    positionId: request.positionId,
    brokerConfirmed: true as const,
    brokerEffectiveAt: request.brokerEffectiveAt,
    price: request.price,
    quantity: request.quantity,
    fees: request.fees,
    taxes: request.taxes,
    exitReason: request.exitReason,
  };
}

function stopBody(request: StopRequest) {
  if (!UUID.test(request.positionId)) throw new LifecycleClientError("LIFECYCLE_INPUT_INVALID", { status: 400 });
  if (!REQUEST_DECIMAL.test(request.newStop) || /^0(?:\.0+)?$/.test(request.newStop)) {
    throw new LifecycleClientError("LIFECYCLE_INPUT_INVALID", { status: 400 });
  }
  if (!EVIDENCE_CLASSES.includes(request.evidenceClass)) {
    throw new LifecycleClientError("LIFECYCLE_INPUT_INVALID", { status: 400 });
  }
  return {
    positionId: request.positionId,
    newStop: request.newStop,
    evidenceClass: request.evidenceClass,
  };
}

async function postExit(operation: "PARTIAL_EXIT" | "FINAL_EXIT", idempotencyKey: string, request: ExitRequest) {
  const headers = header(idempotencyKey);
  const body = exitBody(request);
  let response: { data: unknown };
  try {
    response = await api.post(ENDPOINTS[operation], body, { headers });
  } catch (error) {
    return safeError(error);
  }
  return committedIfInvalid(() => validateMutation(response.data, operation)) as ExitResult;
}

export const recordPartialExit = (idempotencyKey: string, request: ExitRequest) =>
  postExit("PARTIAL_EXIT", idempotencyKey, request);
export const recordFinalExit = (idempotencyKey: string, request: ExitRequest) =>
  postExit("FINAL_EXIT", idempotencyKey, request);

export async function tightenProtectiveStop(idempotencyKey: string, request: StopRequest) {
  const headers = header(idempotencyKey);
  const body = stopBody(request);
  let response: { data: unknown };
  try {
    response = await api.post(ENDPOINTS.TIGHTEN_STOP, body, { headers });
  } catch (error) {
    return safeError(error);
  }
  return committedIfInvalid(() => validateMutation(response.data, "TIGHTEN_STOP")) as StopResult;
}

/** Non-mutating. The route requires the same strict single Idempotency-Key header as the writes. */
export async function recoverLifecycle(
  idempotencyKey: string,
  target: { operation: LifecycleOperation; positionId: string },
) {
  const headers = header(idempotencyKey);
  if (!UUID.test(target.positionId) || !LIFECYCLE_OPERATIONS.includes(target.operation)) {
    throw new LifecycleClientError("LIFECYCLE_INPUT_INVALID", { status: 400 });
  }
  // Deliberately not wrapped in committedIfInvalid: the recovery read is non-mutating, so a malformed
  // 2xx here establishes nothing about commit state.
  try {
    const response = await api.get(RECOVERY_ENDPOINT, {
      params: { operation: target.operation, positionId: target.positionId },
      headers,
    });
    return validateRecovery(response.data, target.operation);
  } catch (error) {
    return safeError(error);
  }
}
