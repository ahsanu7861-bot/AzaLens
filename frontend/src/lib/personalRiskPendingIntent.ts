export const PENDING_INTENT_KEY = "azalens-personal-risk-pending-intent";
export const PERSONAL_RISK_OPERATIONS = ["POLICY_VERSION", "COST_SCHEDULE", "EQUITY_SNAPSHOT"] as const;
export type PersonalRiskOperation = (typeof PERSONAL_RISK_OPERATIONS)[number];
export type StoredPendingIntent = { operation: PersonalRiskOperation; idempotencyKey: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function readPendingIntent(storage: Pick<Storage, "getItem" | "removeItem"> = window.localStorage) {
  const raw = storage.getItem(PENDING_INTENT_KEY);
  if (raw === null) return { intent: null, malformed: false } as const;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    const record = value as Record<string, unknown>;
    if (
      Object.keys(record).sort().join("|") !== "idempotencyKey|operation" ||
      !PERSONAL_RISK_OPERATIONS.includes(record.operation as PersonalRiskOperation) ||
      typeof record.idempotencyKey !== "string" ||
      !UUID.test(record.idempotencyKey)
    ) throw new Error();
    return { intent: record as StoredPendingIntent, malformed: false } as const;
  } catch {
    storage.removeItem(PENDING_INTENT_KEY);
    return { intent: null, malformed: true } as const;
  }
}

export function writePendingIntent(intent: StoredPendingIntent, storage: Pick<Storage, "setItem"> = window.localStorage) {
  if (!PERSONAL_RISK_OPERATIONS.includes(intent.operation) || !UUID.test(intent.idempotencyKey)) {
    throw new Error("Invalid pending intent.");
  }
  storage.setItem(PENDING_INTENT_KEY, JSON.stringify(intent));
}

export function clearPendingIntent(storage: Pick<Storage, "removeItem"> = window.localStorage) {
  storage.removeItem(PENDING_INTENT_KEY);
}
