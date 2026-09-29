export const LIFECYCLE_OPERATIONS = ["PARTIAL_EXIT", "FINAL_EXIT", "TIGHTEN_STOP"] as const;
export type LifecycleOperation = (typeof LIFECYCLE_OPERATIONS)[number];

export const EVIDENCE_CLASSES = ["OWNER_DECLARED", "BROKER_CONFIRMED"] as const;
export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];

/** Exit results carry a signed `realizedPnl`; see the signed-decimal note in the scope proposal. */
export type ExitResult = {
  operation: "PARTIAL_EXIT" | "FINAL_EXIT";
  eventId: string;
  positionId: string;
  openQuantity: string;
  realizedPnl: string;
  brokerEffectiveAt: string;
  replayed: boolean;
};

export type StopResult = {
  operation: "TIGHTEN_STOP";
  stopChangeId: string;
  positionId: string;
  priorStop: string;
  newStop: string;
  evidenceClass: EvidenceClass;
  direction: "TIGHTENING";
  replayed: boolean;
};

export type LifecycleResult = ExitResult | StopResult;

export type RecoveryNotFound = {
  operation: LifecycleOperation;
  state: "NOT_FOUND";
  positionId: string;
};
export type RecoveryCommitted = LifecycleResult & { state: "COMMITTED" };
export type RecoveryResult = RecoveryNotFound | RecoveryCommitted;

export type ExitRequest = {
  positionId: string;
  brokerEffectiveAt: string;
  price: string;
  quantity: string;
  fees: string;
  taxes: string;
  exitReason: string | null;
};
export type StopRequest = {
  positionId: string;
  newStop: string;
  evidenceClass: EvidenceClass;
};

/** `COMMITTED` means the backend asserted the mutation committed and only its readback failed. */
export type CommitState = "UNKNOWN" | "COMMITTED";

export type LifecycleFailureCode =
  | "LIFECYCLE_INPUT_INVALID"
  | "NUMERIC_PRECISION_INVALID"
  | "LIFECYCLE_FORBIDDEN"
  | "IDEMPOTENCY_CONFLICT"
  | "LIFECYCLE_RESPONSE_INVALID"
  | "LIFECYCLE_UNAVAILABLE"
  | "LIFECYCLE_COMMIT_UNKNOWN"
  | "LIFECYCLE_COMMITTED_READBACK_PENDING"
  | "LIFECYCLE_RECOVERY_UNAVAILABLE"
  | "CLOSED_DEMO_ACCESS_REQUIRED"
  | "OWNER_IDENTITY_REQUIRED"
  | "OWNER_ORIGIN_REQUIRED"
  | "NETWORK_AMBIGUOUS";
