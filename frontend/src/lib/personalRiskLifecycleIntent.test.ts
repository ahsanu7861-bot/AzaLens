import { beforeEach, describe, expect, it } from "vitest";
import {
  canArmRetry,
  clearLifecycleRecord,
  createLifecycleSession,
  escalateLifecycleRecord,
  LIFECYCLE_PENDING_KEY,
  LifecycleSafetyError,
  mintLifecycleRecord,
  readLifecycleRecord,
  submittedEvidenceClass,
  type LifecycleSafetyRecord,
  type PendingReason,
} from "./personalRiskLifecycleIntent";

const POSITION = "20000000-0000-4000-8000-000000000002";
const KEY = "30000000-0000-4000-8000-000000000003";
const IDENTITY = { operation: "PARTIAL_EXIT", positionId: POSITION, idempotencyKey: KEY } as const;
const STOP_IDENTITY = { operation: "TIGHTEN_STOP", positionId: POSITION, idempotencyKey: KEY } as const;
const CLASSES = ["OWNER_DECLARED", "BROKER_CONFIRMED"] as const;
const BASE_KEYS = ["certainty", "idempotencyKey", "operation", "positionId", "reason", "restriction", "version"];
const STOP_V2_KEYS = [...BASE_KEYS, "evidenceClass"].sort();

const IMPLIED: Record<PendingReason, { certainty: string; restriction: string }> = {
  NONE: { certainty: "UNKNOWN", restriction: "RECOVER_FIRST" },
  READBACK_PENDING: { certainty: "COMMITTED", restriction: "NO_RETRY" },
  CONFLICT: { certainty: "UNKNOWN", restriction: "NO_RETRY" },
  CONTRADICTORY: { certainty: "COMMITTED", restriction: "NO_RETRY" },
};
const REASONS: PendingReason[] = ["NONE", "READBACK_PENDING", "CONFLICT", "CONTRADICTORY"];
/** The authoritative table from the scope proposal, restated independently of the implementation. */
const ALLOWED: Record<PendingReason, PendingReason[]> = {
  NONE: ["NONE", "READBACK_PENDING", "CONFLICT"],
  READBACK_PENDING: ["READBACK_PENDING", "CONTRADICTORY"],
  CONFLICT: ["CONFLICT"],
  CONTRADICTORY: ["CONTRADICTORY"],
};

function makeStorage(options: { failSet?: boolean; failGet?: boolean; failRemove?: boolean } = {}) {
  const map = new Map<string, string>();
  return {
    map,
    getItem(key: string) {
      if (options.failGet) throw new Error("blocked");
      return map.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (options.failSet) throw new Error("quota");
      map.set(key, value);
    },
    removeItem(key: string) {
      if (options.failRemove) throw new Error("blocked");
      map.delete(key);
    },
  };
}
type Fake = ReturnType<typeof makeStorage>;

function seed(storage: Fake, reason: PendingReason, overrides: Partial<LifecycleSafetyRecord> = {}) {
  const record = { version: 1, ...IDENTITY, reason, ...IMPLIED[reason], ...overrides };
  storage.map.set(LIFECYCLE_PENDING_KEY, JSON.stringify(record));
  return record;
}
function raw(storage: Fake) {
  return storage.map.get(LIFECYCLE_PENDING_KEY) ?? null;
}
function expectUnverifiableAndRetained(storage: Fake, bytes: string) {
  expect(readLifecycleRecord(storage).status).toBe("UNVERIFIABLE");
  expect(raw(storage)).toBe(bytes);
}

describe("personal-risk lifecycle safety record", () => {
  let storage: Fake;
  beforeEach(() => {
    storage = makeStorage();
  });

  it("A1 round-trips the complete seven-field record with nothing defaulted or dropped", () => {
    const written = mintLifecycleRecord(IDENTITY, storage);
    expect(written).toEqual({
      // Every newly minted record is version 2; an exit record keeps the original seven keys.
      version: 2,
      operation: "PARTIAL_EXIT",
      positionId: POSITION,
      idempotencyKey: KEY,
      certainty: "UNKNOWN",
      restriction: "RECOVER_FIRST",
      reason: "NONE",
    });
    const read = readLifecycleRecord(storage);
    expect(read.status).toBe("VALID");
    expect(read.status === "VALID" && read.record).toEqual(written);
    expect(Object.keys(JSON.parse(raw(storage) as string)).sort()).toEqual([
      "certainty",
      "idempotencyKey",
      "operation",
      "positionId",
      "reason",
      "restriction",
      "version",
    ]);
  });

  it("A2 retains malformed JSON byte-identically and reports UNVERIFIABLE", () => {
    const bytes = "{not json";
    storage.map.set(LIFECYCLE_PENDING_KEY, bytes);
    expectUnverifiableAndRetained(storage, bytes);
  });

  it("A3 retains records with an extra or a missing key", () => {
    for (const record of [
      { version: 1, ...IDENTITY, ...IMPLIED.NONE, reason: "NONE", extra: true },
      { version: 1, operation: "PARTIAL_EXIT", positionId: POSITION, certainty: "UNKNOWN", restriction: "RECOVER_FIRST", reason: "NONE" },
    ]) {
      const bytes = JSON.stringify(record);
      storage.map.set(LIFECYCLE_PENDING_KEY, bytes);
      expectUnverifiableAndRetained(storage, bytes);
    }
  });

  it("A4 retains records with a non-UUID key or position", () => {
    const mixedCase = "3a0b0000-0000-4000-8000-00000000000f";
    for (const override of [
      { idempotencyKey: "not-a-uuid" },
      { positionId: "12345" },
      // Uppercase hex must be refused: the route's UUID pattern is lowercase-only.
      { idempotencyKey: mixedCase.toUpperCase() },
      { positionId: mixedCase.toUpperCase() },
    ]) {
      const bytes = JSON.stringify({ version: 1, ...IDENTITY, ...IMPLIED.NONE, reason: "NONE", ...override });
      storage.map.set(LIFECYCLE_PENDING_KEY, bytes);
      expectUnverifiableAndRetained(storage, bytes);
    }
  });

  it("A5 retains records whose operation is outside the three", () => {
    for (const operation of ["POLICY_VERSION", "TIGHTEN", "", null]) {
      const bytes = JSON.stringify({ version: 1, ...IDENTITY, operation, ...IMPLIED.NONE, reason: "NONE" });
      storage.map.set(LIFECYCLE_PENDING_KEY, bytes);
      expectUnverifiableAndRetained(storage, bytes);
    }
  });

  it("A6 never persists a financial payload or credential", () => {
    mintLifecycleRecord(IDENTITY, storage);
    escalateLifecycleRecord("READBACK_PENDING", storage);
    const stored = raw(storage) as string;
    for (const forbidden of [
      "price",
      "quantity",
      "fees",
      "taxes",
      "newStop",
      "exitReason",
      "brokerEffectiveAt",
      "evidenceClass",
      "Authorization",
      "Bearer",
      "token",
    ]) {
      expect(stored).not.toContain(forbidden);
    }
  });

  it("A6b never persists a stop's payload, only its submitted evidence class", () => {
    const STOP_VALUE = "101.25";
    for (const evidenceClass of CLASSES) {
      storage.map.clear();
      mintLifecycleRecord({ ...STOP_IDENTITY, evidenceClass }, storage);
      escalateLifecycleRecord("READBACK_PENDING", storage);
      const stored = raw(storage) as string;
      expect(JSON.parse(stored).evidenceClass).toBe(evidenceClass);
      for (const forbidden of [
        "price",
        "quantity",
        "fees",
        "taxes",
        "newStop",
        STOP_VALUE,
        "exitReason",
        "brokerEffectiveAt",
        "Authorization",
        "Bearer",
        "token",
      ]) {
        expect(stored, forbidden).not.toContain(forbidden);
      }
    }
  });

  it("A7 gates the version and never reinterprets a future record", () => {
    // Version 2 is now valid in its correct shape, so the unsupported future version is 3.
    for (const version of [undefined, 0, 3, "1", "2", null]) {
      const bytes = JSON.stringify({ version, ...IDENTITY, ...IMPLIED.NONE, reason: "NONE" });
      storage.map.set(LIFECYCLE_PENDING_KEY, bytes);
      expect(readLifecycleRecord(storage).status).toBe("UNVERIFIABLE");
      expect(raw(storage)).toBe(bytes);
    }
  });

  it("A8 rejects any value outside the declared enums", () => {
    for (const override of [
      { certainty: "PROBABLY" },
      { restriction: "MAYBE" },
      { reason: "SOMETHING" },
      { reason: "none" },
    ]) {
      const bytes = JSON.stringify({ version: 1, ...IDENTITY, ...IMPLIED.NONE, reason: "NONE", ...override });
      storage.map.set(LIFECYCLE_PENDING_KEY, bytes);
      expectUnverifiableAndRetained(storage, bytes);
    }
  });

  it("A9 fails closed on an inconsistent certainty/restriction/reason combination", () => {
    for (const record of [
      { reason: "NONE", certainty: "UNKNOWN", restriction: "NO_RETRY" },
      { reason: "READBACK_PENDING", certainty: "UNKNOWN", restriction: "NO_RETRY" },
      { reason: "CONFLICT", certainty: "UNKNOWN", restriction: "RECOVER_FIRST" },
      { reason: "CONTRADICTORY", certainty: "UNKNOWN", restriction: "NO_RETRY" },
    ]) {
      const bytes = JSON.stringify({ version: 1, ...IDENTITY, ...record });
      storage.map.set(LIFECYCLE_PENDING_KEY, bytes);
      expectUnverifiableAndRetained(storage, bytes);
    }
  });

  it("A10 refuses every downgrade and allows escalation", () => {
    seed(storage, "READBACK_PENDING");
    const before = raw(storage);
    expect(() => escalateLifecycleRecord("NONE", storage)).toThrow(LifecycleSafetyError);
    expect(raw(storage)).toBe(before);
    seed(storage, "CONFLICT");
    const frozen = raw(storage);
    expect(() => escalateLifecycleRecord("NONE", storage)).toThrow(LifecycleSafetyError);
    expect(raw(storage)).toBe(frozen);
    seed(storage, "NONE");
    expect(escalateLifecycleRecord("READBACK_PENDING", storage).restriction).toBe("NO_RETRY");
    expect(escalateLifecycleRecord("CONTRADICTORY", storage).certainty).toBe("COMMITTED");
  });

  it("A11 retains an invalid record instead of deleting it, unlike the bootstrap module", () => {
    const bytes = JSON.stringify({ version: 9, nonsense: true });
    storage.map.set(LIFECYCLE_PENDING_KEY, bytes);
    expect(readLifecycleRecord(storage).status).toBe("UNVERIFIABLE");
    expect(readLifecycleRecord(storage).status).toBe("UNVERIFIABLE");
    expect(raw(storage)).toBe(bytes);
    expect(storage.map.size).toBe(1);
  });

  it("A12 surfaces unwritable storage explicitly and writes nothing", () => {
    const blocked = makeStorage({ failSet: true });
    let thrown: unknown;
    try {
      mintLifecycleRecord(IDENTITY, blocked);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(LifecycleSafetyError);
    expect((thrown as LifecycleSafetyError).kind).toBe("WRITE_FAILED");
    expect(raw(blocked)).toBeNull();
    const unreadable = makeStorage({ failGet: true });
    expect(readLifecycleRecord(unreadable).status).toBe("UNVERIFIABLE");
  });

  it("A13 enforces the exhaustive allowed-transition table", () => {
    for (const from of REASONS) {
      for (const to of REASONS) {
        seed(storage, from);
        const before = raw(storage);
        const permitted = ALLOWED[from].includes(to);
        if (permitted) {
          expect(escalateLifecycleRecord(to, storage).reason, `${from} -> ${to}`).toBe(to);
        } else {
          expect(() => escalateLifecycleRecord(to, storage), `${from} -> ${to}`).toThrow(LifecycleSafetyError);
          expect(raw(storage), `${from} -> ${to} must not mutate`).toBe(before);
        }
      }
    }
    // The terminal-conflict case the monotonic rank check alone would have permitted.
    seed(storage, "CONFLICT");
    const frozen = raw(storage);
    expect(() => escalateLifecycleRecord("READBACK_PENDING", storage)).toThrow(LifecycleSafetyError);
    expect(() => escalateLifecycleRecord("CONTRADICTORY", storage)).toThrow(LifecycleSafetyError);
    expect(raw(storage)).toBe(frozen);
  });

  it("A14 permits clearing only from NONE and READBACK_PENDING", () => {
    for (const reason of ["NONE", "READBACK_PENDING"] as PendingReason[]) {
      seed(storage, reason);
      clearLifecycleRecord(storage);
      expect(raw(storage)).toBeNull();
    }
    for (const reason of ["CONFLICT", "CONTRADICTORY"] as PendingReason[]) {
      seed(storage, reason);
      const before = raw(storage);
      expect(() => clearLifecycleRecord(storage)).toThrow(LifecycleSafetyError);
      expect(raw(storage)).toBe(before);
    }
  });

  it("A15 mints a version-2 stop record that stores exactly the submitted class", () => {
    for (const evidenceClass of CLASSES) {
      storage.map.clear();
      const written = mintLifecycleRecord({ ...STOP_IDENTITY, evidenceClass }, storage);
      expect(written).toEqual({
        version: 2,
        operation: "TIGHTEN_STOP",
        positionId: POSITION,
        idempotencyKey: KEY,
        evidenceClass,
        certainty: "UNKNOWN",
        restriction: "RECOVER_FIRST",
        reason: "NONE",
      });
      expect(Object.keys(JSON.parse(raw(storage) as string)).sort()).toEqual(STOP_V2_KEYS);
      const read = readLifecycleRecord(storage);
      expect(read.status === "VALID" && read.record).toEqual(written);
    }
  });

  it("A16 refuses a stop with a missing or unknown class and an exit with any class, writing nothing", () => {
    const refusals: Array<Record<string, unknown>> = [
      { ...STOP_IDENTITY },
      { ...STOP_IDENTITY, evidenceClass: undefined },
      { ...STOP_IDENTITY, evidenceClass: null },
      { ...STOP_IDENTITY, evidenceClass: "" },
      { ...STOP_IDENTITY, evidenceClass: "owner_declared" },
      { ...STOP_IDENTITY, evidenceClass: "BROKER_ASSERTED" },
      ...CLASSES.map((evidenceClass) => ({ ...IDENTITY, evidenceClass })),
      ...CLASSES.map((evidenceClass) => ({ ...IDENTITY, operation: "FINAL_EXIT", evidenceClass })),
    ];
    for (const identity of refusals) {
      storage.map.clear();
      let thrown: unknown;
      try {
        mintLifecycleRecord(identity as never, storage);
      } catch (error) {
        thrown = error;
      }
      expect(thrown, JSON.stringify(identity)).toBeInstanceOf(LifecycleSafetyError);
      expect((thrown as LifecycleSafetyError).kind).toBe("TRANSITION_REFUSED");
      expect(raw(storage), JSON.stringify(identity)).toBeNull();
    }
    // A caller-supplied extra key never reaches storage: the record is built field by field.
    storage.map.clear();
    mintLifecycleRecord({ ...IDENTITY, newStop: "100" } as never, storage);
    expect(Object.keys(JSON.parse(raw(storage) as string)).sort()).toEqual(BASE_KEYS);
  });

  it("A17 distinguishes the version-2 stop shape from exits and from version 1", () => {
    const base = { ...IMPLIED.NONE, reason: "NONE" };
    // Valid: version 1 in its original seven keys for every operation; version 2 exits without a class.
    for (const record of [
      { version: 1, ...IDENTITY, ...base },
      { version: 1, ...STOP_IDENTITY, ...base },
      { version: 2, ...IDENTITY, ...base },
      { version: 2, ...IDENTITY, operation: "FINAL_EXIT", ...base },
      ...CLASSES.map((evidenceClass) => ({ version: 2, ...STOP_IDENTITY, evidenceClass, ...base })),
    ]) {
      storage.map.set(LIFECYCLE_PENDING_KEY, JSON.stringify(record));
      expect(readLifecycleRecord(storage).status, JSON.stringify(record)).toBe("VALID");
    }
    // Retained as UNVERIFIABLE, never repaired.
    for (const record of [
      { version: 1, ...STOP_IDENTITY, evidenceClass: "OWNER_DECLARED", ...base },
      { version: 1, ...IDENTITY, evidenceClass: "OWNER_DECLARED", ...base },
      { version: 2, ...STOP_IDENTITY, ...base },
      { version: 2, ...STOP_IDENTITY, evidenceClass: null, ...base },
      { version: 2, ...STOP_IDENTITY, evidenceClass: "UNKNOWN_CLASS", ...base },
      { version: 2, ...STOP_IDENTITY, evidenceClass: "OWNER_DECLARED", ...base, newStop: "100" },
      { version: 2, ...IDENTITY, evidenceClass: "BROKER_CONFIRMED", ...base },
      { version: 3, ...STOP_IDENTITY, evidenceClass: "OWNER_DECLARED", ...base },
      { version: 3, ...IDENTITY, ...base },
    ]) {
      const bytes = JSON.stringify(record);
      storage.map.set(LIFECYCLE_PENDING_KEY, bytes);
      expectUnverifiableAndRetained(storage, bytes);
    }
  });

  it("A18 carries version and class unchanged through every permitted transition", () => {
    const fixtures: Array<{ label: string; overrides: Partial<LifecycleSafetyRecord> }> = [
      ...CLASSES.map((evidenceClass) => ({
        label: `v2 stop ${evidenceClass}`,
        overrides: { version: 2, operation: "TIGHTEN_STOP", evidenceClass } as Partial<LifecycleSafetyRecord>,
      })),
      { label: "v1 stop", overrides: { version: 1, operation: "TIGHTEN_STOP" } },
      { label: "v2 exit", overrides: { version: 2 } },
      { label: "v1 exit", overrides: { version: 1 } },
    ];
    for (const { label, overrides } of fixtures) {
      for (const from of REASONS) {
        for (const to of ALLOWED[from]) {
          const seeded = seed(storage, from, overrides);
          const next = escalateLifecycleRecord(to, storage);
          const persisted = JSON.parse(raw(storage) as string);
          expect(next.reason, `${label} ${from} -> ${to}`).toBe(to);
          expect(persisted.version, `${label} ${from} -> ${to}`).toBe(seeded.version);
          expect(persisted.evidenceClass, `${label} ${from} -> ${to}`).toBe(seeded.evidenceClass);
          // A record without a class (every v1 record and every exit) never gains the key at all.
          expect(Object.hasOwn(persisted, "evidenceClass"), `${label} ${from} -> ${to}`).toBe(
            Object.hasOwn(seeded, "evidenceClass"),
          );
          expect(readLifecycleRecord(storage).status).toBe("VALID");
        }
      }
    }
  });

  it("A19 exposes a class for recovery only from a version-2 stop record", () => {
    for (const evidenceClass of CLASSES) {
      storage.map.clear();
      expect(submittedEvidenceClass(mintLifecycleRecord({ ...STOP_IDENTITY, evidenceClass }, storage))).toBe(evidenceClass);
    }
    expect(submittedEvidenceClass(seed(storage, "NONE", { version: 1, operation: "TIGHTEN_STOP" }) as LifecycleSafetyRecord)).toBeNull();
    storage.map.clear();
    expect(submittedEvidenceClass(mintLifecycleRecord(IDENTITY, storage))).toBeNull();
  });

  it("gates retry on the in-memory session, the restriction and the absence of a write failure", () => {
    const session = createLifecycleSession();
    const record = mintLifecycleRecord(IDENTITY, storage);
    expect(canArmRetry(session, record)).toBe(false);
    session.mintedKeys.add(KEY);
    expect(canArmRetry(session, record)).toBe(true);
    session.safetyWriteFailed = true;
    expect(canArmRetry(session, record)).toBe(false);
    session.safetyWriteFailed = false;
    expect(canArmRetry(session, { ...record, restriction: "NO_RETRY", certainty: "COMMITTED", reason: "READBACK_PENDING" })).toBe(false);
    expect(canArmRetry(createLifecycleSession(), record)).toBe(false);
    console.log("PASS lifecycle safety record: versioned validation, retention on invalid bytes, allowed transitions and session-scoped retry gating are enforced.");
  });
});
