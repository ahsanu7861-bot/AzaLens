import {
  EVIDENCE_CLASSES,
  LIFECYCLE_OPERATIONS,
  type EvidenceClass,
  type LifecycleOperation,
} from "../types/personalRiskLifecycle";

export const LIFECYCLE_PENDING_KEY = "azalens-personal-risk-lifecycle-pending";
/** Every newly minted record is version 2. Version 1 records remain readable in their original shape. */
export const LIFECYCLE_RECORD_VERSION = 2;
export const LEGACY_LIFECYCLE_RECORD_VERSION = 1;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type Certainty = "UNKNOWN" | "COMMITTED";
export type Restriction = "RECOVER_FIRST" | "NO_RETRY";
export type PendingReason = "NONE" | "READBACK_PENDING" | "CONFLICT" | "CONTRADICTORY";

/**
 * The durable safety record. It carries the identity of the pending action plus the restriction the
 * backend has justified, and nothing else: no price, quantity, fee, tax, stop, note, timestamp, token
 * or session data ever reaches storage.
 *
 * The one exception is a version-2 TIGHTEN_STOP record, which also stores the submitted evidence
 * class — exactly one of the two labels `OWNER_DECLARED` or `BROKER_CONFIRMED` — so that recovery can
 * ask the backend to verify the durable class instead of merely reporting it. Exit records and every
 * version-1 record carry no class; a version-1 record is never given one.
 */
export type LifecycleSafetyRecord = {
  version: typeof LIFECYCLE_RECORD_VERSION | typeof LEGACY_LIFECYCLE_RECORD_VERSION;
  operation: LifecycleOperation;
  positionId: string;
  idempotencyKey: string;
  /** Present only on a version-2 TIGHTEN_STOP record. */
  evidenceClass?: EvidenceClass;
  certainty: Certainty;
  restriction: Restriction;
  reason: PendingReason;
};

export type LifecycleRecordRead =
  | { status: "ABSENT" }
  | { status: "VALID"; record: LifecycleSafetyRecord }
  | { status: "UNVERIFIABLE" };

/** `reason` fully determines the other two safety fields, so a corrupted pair fails closed. */
const IMPLIED: Record<PendingReason, { certainty: Certainty; restriction: Restriction }> = {
  NONE: { certainty: "UNKNOWN", restriction: "RECOVER_FIRST" },
  READBACK_PENDING: { certainty: "COMMITTED", restriction: "NO_RETRY" },
  CONFLICT: { certainty: "UNKNOWN", restriction: "NO_RETRY" },
  CONTRADICTORY: { certainty: "COMMITTED", restriction: "NO_RETRY" },
};

const REASON_RANK: Record<PendingReason, number> = {
  NONE: 0,
  CONFLICT: 1,
  READBACK_PENDING: 2,
  CONTRADICTORY: 3,
};
const CERTAINTY_RANK: Record<Certainty, number> = { UNKNOWN: 0, COMMITTED: 1 };
const RESTRICTION_RANK: Record<Restriction, number> = { RECOVER_FIRST: 0, NO_RETRY: 1 };

/**
 * Authoritative allowed transitions on `reason`. Any pair absent from this map is refused, which is
 * what keeps a terminal CONFLICT from being overwritten by the higher-ranked READBACK_PENDING.
 */
const ALLOWED_TRANSITIONS: Record<PendingReason, PendingReason[]> = {
  NONE: ["NONE", "READBACK_PENDING", "CONFLICT"],
  READBACK_PENDING: ["READBACK_PENDING", "CONTRADICTORY"],
  CONFLICT: ["CONFLICT"],
  CONTRADICTORY: ["CONTRADICTORY"],
};

/** Clearing is permitted only from these origins; terminal records are never deleted. */
const CLEARABLE: PendingReason[] = ["NONE", "READBACK_PENDING"];

export type LifecycleSafetyErrorKind = "WRITE_FAILED" | "TRANSITION_REFUSED" | "UNVERIFIABLE";

export class LifecycleSafetyError extends Error {
  readonly kind: LifecycleSafetyErrorKind;
  constructor(kind: LifecycleSafetyErrorKind) {
    super(kind);
    this.kind = kind;
  }
}

type WriteStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): WriteStorage {
  return window.localStorage;
}

function isReason(value: unknown): value is PendingReason {
  return typeof value === "string" && Object.hasOwn(REASON_RANK, value);
}

function isEvidenceClass(value: unknown): value is EvidenceClass {
  return typeof value === "string" && EVIDENCE_CLASSES.includes(value as EvidenceClass);
}

const BASE_KEYS = "certainty|idempotencyKey|operation|positionId|reason|restriction|version";
const STOP_V2_KEYS = "certainty|evidenceClass|idempotencyKey|operation|positionId|reason|restriction|version";

/**
 * Exact-shape validation. Version 1 keeps its original seven keys for every operation. Version 2 adds
 * `evidenceClass` to TIGHTEN_STOP records only, and requires it there; an exit record never has it.
 * Any other version is a future format this code cannot interpret.
 */
function validate(value: unknown): LifecycleSafetyRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== LIFECYCLE_RECORD_VERSION && record.version !== LEGACY_LIFECYCLE_RECORD_VERSION) return null;
  if (!LIFECYCLE_OPERATIONS.includes(record.operation as LifecycleOperation)) return null;
  const keys = Object.keys(record).sort().join("|");
  const classified = record.version === LIFECYCLE_RECORD_VERSION && record.operation === "TIGHTEN_STOP";
  if (keys !== (classified ? STOP_V2_KEYS : BASE_KEYS)) return null;
  if (classified && !isEvidenceClass(record.evidenceClass)) return null;
  if (typeof record.positionId !== "string" || !UUID.test(record.positionId)) return null;
  if (typeof record.idempotencyKey !== "string" || !UUID.test(record.idempotencyKey)) return null;
  if (!isReason(record.reason)) return null;
  const implied = IMPLIED[record.reason];
  if (record.certainty !== implied.certainty || record.restriction !== implied.restriction) return null;
  return record as LifecycleSafetyRecord;
}

/** Never writes and never deletes: an invalid record is retained byte-identically for investigation. */
export function readLifecycleRecord(storage: WriteStorage = defaultStorage()): LifecycleRecordRead {
  let raw: string | null;
  try {
    raw = storage.getItem(LIFECYCLE_PENDING_KEY);
  } catch {
    return { status: "UNVERIFIABLE" };
  }
  if (raw === null) return { status: "ABSENT" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "UNVERIFIABLE" };
  }
  const record = validate(parsed);
  return record === null ? { status: "UNVERIFIABLE" } : { status: "VALID", record };
}

function persist(record: LifecycleSafetyRecord, storage: WriteStorage) {
  try {
    storage.setItem(LIFECYCLE_PENDING_KEY, JSON.stringify(record));
  } catch {
    throw new LifecycleSafetyError("WRITE_FAILED");
  }
}

/**
 * Mints a version-2 record. A TIGHTEN_STOP must supply the class it is about to dispatch; an exit must
 * supply none. The record is built field by field, so no other caller-supplied key can reach storage.
 */
export function mintLifecycleRecord(
  identity: { operation: LifecycleOperation; positionId: string; idempotencyKey: string; evidenceClass?: EvidenceClass },
  storage: WriteStorage = defaultStorage(),
): LifecycleSafetyRecord {
  if (!LIFECYCLE_OPERATIONS.includes(identity.operation)) throw new LifecycleSafetyError("TRANSITION_REFUSED");
  if (!UUID.test(identity.positionId) || !UUID.test(identity.idempotencyKey)) {
    throw new LifecycleSafetyError("TRANSITION_REFUSED");
  }
  const isStop = identity.operation === "TIGHTEN_STOP";
  if (isStop ? !isEvidenceClass(identity.evidenceClass) : identity.evidenceClass !== undefined) {
    throw new LifecycleSafetyError("TRANSITION_REFUSED");
  }
  const existing = readLifecycleRecord(storage);
  if (existing.status === "UNVERIFIABLE") throw new LifecycleSafetyError("UNVERIFIABLE");
  if (existing.status === "VALID") throw new LifecycleSafetyError("TRANSITION_REFUSED");
  const record: LifecycleSafetyRecord = {
    version: LIFECYCLE_RECORD_VERSION,
    operation: identity.operation,
    positionId: identity.positionId,
    idempotencyKey: identity.idempotencyKey,
    ...(isStop ? { evidenceClass: identity.evidenceClass } : {}),
    ...IMPLIED.NONE,
    reason: "NONE",
  };
  persist(record, storage);
  return record;
}

/**
 * Escalates the stored record. The allowed-transition map decides; the monotonic rank comparison is a
 * redundant second gate so that neither check alone can permit a downgrade. `version` and
 * `evidenceClass` are carried over unchanged: a version-1 record stays version 1 and is never given a
 * class it did not already have.
 */
export function escalateLifecycleRecord(
  reason: PendingReason,
  storage: WriteStorage = defaultStorage(),
): LifecycleSafetyRecord {
  const existing = readLifecycleRecord(storage);
  if (existing.status === "UNVERIFIABLE") throw new LifecycleSafetyError("UNVERIFIABLE");
  if (existing.status === "ABSENT") throw new LifecycleSafetyError("TRANSITION_REFUSED");
  const current = existing.record;
  if (!ALLOWED_TRANSITIONS[current.reason].includes(reason)) throw new LifecycleSafetyError("TRANSITION_REFUSED");
  const next: LifecycleSafetyRecord = {
    version: current.version,
    operation: current.operation,
    positionId: current.positionId,
    idempotencyKey: current.idempotencyKey,
    ...(current.evidenceClass === undefined ? {} : { evidenceClass: current.evidenceClass }),
    reason,
    ...IMPLIED[reason],
  };
  if (
    REASON_RANK[next.reason] < REASON_RANK[current.reason] ||
    CERTAINTY_RANK[next.certainty] < CERTAINTY_RANK[current.certainty] ||
    RESTRICTION_RANK[next.restriction] < RESTRICTION_RANK[current.restriction]
  ) {
    throw new LifecycleSafetyError("TRANSITION_REFUSED");
  }
  if (validate(next) === null) throw new LifecycleSafetyError("TRANSITION_REFUSED");
  persist(next, storage);
  return next;
}

export function clearLifecycleRecord(storage: WriteStorage = defaultStorage()) {
  const existing = readLifecycleRecord(storage);
  if (existing.status === "UNVERIFIABLE") throw new LifecycleSafetyError("UNVERIFIABLE");
  if (existing.status === "VALID" && !CLEARABLE.includes(existing.record.reason)) {
    throw new LifecycleSafetyError("TRANSITION_REFUSED");
  }
  try {
    storage.removeItem(LIFECYCLE_PENDING_KEY);
  } catch {
    throw new LifecycleSafetyError("WRITE_FAILED");
  }
}

/**
 * Per-page-load, in-memory chain of custody. It is deliberately never persisted: persisting it would
 * make it forgeable by the same storage failure it guards against.
 */
export type LifecycleSession = { mintedKeys: Set<string>; safetyWriteFailed: boolean };

export function createLifecycleSession(): LifecycleSession {
  return { mintedKeys: new Set<string>(), safetyWriteFailed: false };
}

/**
 * The class a recovery check may ask the backend to verify: only a version-2 TIGHTEN_STOP record has
 * one. `null` means the check is report-only, as it always was for version-1 records.
 */
export function submittedEvidenceClass(record: LifecycleSafetyRecord): EvidenceClass | null {
  return record.version === LIFECYCLE_RECORD_VERSION && record.operation === "TIGHTEN_STOP" && record.evidenceClass
    ? record.evidenceClass
    : null;
}

/** A same-key retry needs all three conjuncts; a reloaded record fails the first. */
export function canArmRetry(session: LifecycleSession, record: LifecycleSafetyRecord) {
  return (
    !session.safetyWriteFailed &&
    record.restriction === "RECOVER_FIRST" &&
    session.mintedKeys.has(record.idempotencyKey)
  );
}
