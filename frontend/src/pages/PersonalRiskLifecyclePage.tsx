import { AlertTriangle, CheckCircle2, ShieldAlert, ShieldCheck, TrendingDown, X } from "lucide-react";
import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import { useDialogFocus } from "../hooks/useDialogFocus";
import {
  canArmRetry,
  clearLifecycleRecord,
  createLifecycleSession,
  escalateLifecycleRecord,
  mintLifecycleRecord,
  readLifecycleRecord,
  type LifecycleRecordRead,
  type PendingReason,
} from "../lib/personalRiskLifecycleIntent";
import {
  LifecycleClientError,
  recordFinalExit,
  recordPartialExit,
  recoverLifecycle,
  tightenProtectiveStop,
} from "../services/personalRiskLifecycle";
import type {
  EvidenceClass,
  LifecycleFailureCode,
  LifecycleOperation,
  LifecycleResult,
  RecoveryResult,
} from "../types/personalRiskLifecycle";

/** Owner-approved, rendered verbatim. Neither string may imply that this screen transmits anything. */
const OWNER_DECLARED_COPY =
  "You have recorded this stop in AzaLens. This does not place or amend an order at Saxo — update your stop with your broker separately.";
const BROKER_CONFIRMED_COPY =
  "Saxo has already confirmed this stop change. AzaLens is recording it. This screen does not place or amend any order.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REQUEST_DECIMAL = /^(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,8})?$/;
const ZERO = /^0(?:\.0+)?$/;

const failureMessages: Record<string, string> = {
  LIFECYCLE_INPUT_INVALID: "An entry was rejected. Correct it and submit again with the same saved request key.",
  NUMERIC_PRECISION_INVALID: "A number does not fit the approved precision. Use plain decimals only.",
  LIFECYCLE_FORBIDDEN: "This owner operation was refused. No record was written.",
  IDEMPOTENCY_CONFLICT: "The saved request key conflicts with a different request. It is frozen; investigate it outside AzaLens.",
  LIFECYCLE_RESPONSE_INVALID: "The response was not safe to interpret. The saved request key remains pending.",
  LIFECYCLE_UNAVAILABLE: "The lifecycle service is unavailable. Nothing was dispatched.",
  LIFECYCLE_COMMIT_UNKNOWN: "The outcome is unknown. Check the recorded outcome before any further action.",
  LIFECYCLE_COMMITTED_READBACK_PENDING: "The service recorded this action but could not read it back.",
  LIFECYCLE_RECOVERY_UNAVAILABLE: "The check could not be completed. The saved request key is unchanged.",
  CLOSED_DEMO_ACCESS_REQUIRED: "Owner access is required.",
  OWNER_IDENTITY_REQUIRED: "A verified owner session is required.",
  OWNER_ORIGIN_REQUIRED: "This operation is available only from the trusted AzaLens origin.",
  NETWORK_AMBIGUOUS: "The outcome is ambiguous. Check the recorded outcome before any further action.",
};

type Phase =
  | "IDLE"
  | "PENDING_COMMIT_UNKNOWN"
  | "RETRY_ARMED"
  | "PENDING_READBACK_COMMITTED"
  | "FROZEN"
  | "BLOCKED_CONTRADICTORY"
  | "BLOCKED_UNVERIFIABLE";

const operationLabels: Record<LifecycleOperation, string> = {
  PARTIAL_EXIT: "partial exit",
  FINAL_EXIT: "final exit",
  TIGHTEN_STOP: "stop tightening",
};

function Values({ rows }: { rows: string[][] }) {
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-stroke bg-surface-soft p-3">
          <dt className="text-xs text-ink-muted">{label}</dt>
          <dd className="mt-1 break-words font-mono text-sm font-semibold text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Field({
  id,
  label,
  hint,
  value,
  onChange,
  mono = false,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (next: string) => void;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-ink" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-2 min-h-12 w-full rounded-xl border border-stroke bg-surface-soft px-3 text-ink ${mono ? "font-mono text-sm" : ""}`}
      />
      {hint ? <p className="mt-2 text-xs leading-5 text-ink-muted">{hint}</p> : null}
    </div>
  );
}

function ConfirmDialog({
  open,
  title,
  description,
  busy,
  error,
  onClose,
  onConfirm,
  confirmDisabled,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const safeClose = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);
  useDialogFocus({ open, dialogRef: ref, onClose: safeClose });
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-end bg-black/60 p-3 backdrop-blur-sm sm:place-items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) safeClose();
      }}
    >
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="az-popover max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-3xl p-5 sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-brand">Final confirmation</p>
            <h2 id={titleId} className="mt-2 font-display text-2xl font-semibold text-ink">
              {title}
            </h2>
          </div>
          <button type="button" aria-label="Close dialog" disabled={busy} onClick={safeClose} className="az-icon-button disabled:opacity-40">
            <X size={18} />
          </button>
        </div>
        <p id={descriptionId} className="mt-3 text-sm leading-6 text-ink-muted">
          {description}
        </p>
        <div className="mt-5">{children}</div>
        {error ? (
          <div role="alert" className="mt-5 rounded-xl border border-critical/30 bg-critical/10 p-3 text-sm text-critical">
            {failureMessages[error] ?? error}
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button variant="secondary" disabled={busy} onClick={safeClose}>
            Cancel
          </Button>
          <Button disabled={busy || confirmDisabled} onClick={onConfirm}>
            {busy ? "Submitting…" : "Confirm and submit"}
          </Button>
        </div>
      </section>
    </div>
  );
}

export default function PersonalRiskLifecyclePage() {
  const [session] = useState(createLifecycleSession);
  const [stored, setStored] = useState<LifecycleRecordRead>(() => readLifecycleRecord());
  const [safetyFailed, setSafetyFailed] = useState(false);
  const [retryArmed, setRetryArmed] = useState(false);
  const [readFailed, setReadFailed] = useState<LifecycleFailureCode | "">("");
  const [recovered, setRecovered] = useState<RecoveryResult | null>(null);
  const [result, setResult] = useState<LifecycleResult | null>(null);
  const [error, setError] = useState<LifecycleFailureCode | "">("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<LifecycleOperation | null>(null);

  const [positionId, setPositionId] = useState("");
  const [brokerEffectiveAt, setBrokerEffectiveAt] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [fees, setFees] = useState("");
  const [taxes, setTaxes] = useState("");
  const [exitReason, setExitReason] = useState("");
  const [newStop, setNewStop] = useState("");
  // `null` means "not yet chosen". It is never a sentinel string, so it cannot reach a request body.
  const [evidence, setEvidence] = useState<EvidenceClass | null>(null);
  const [brokerAck, setBrokerAck] = useState(false);
  const [finalAck, setFinalAck] = useState(false);
  const [evidenceAck, setEvidenceAck] = useState(false);

  const refresh = useCallback(() => setStored(readLifecycleRecord()), []);
  const clearConfirmations = useCallback(() => {
    setBrokerAck(false);
    setFinalAck(false);
    setEvidenceAck(false);
  }, []);
  const markSafetyFailure = useCallback(() => {
    session.safetyWriteFailed = true;
    setSafetyFailed(true);
    setRetryArmed(false);
  }, [session]);

  function edit<T>(setter: (next: T) => void) {
    return (next: T) => {
      setter(next);
      clearConfirmations();
      setDialog(null);
    };
  }
  function resetPayloadFields() {
    setBrokerEffectiveAt("");
    setPrice("");
    setQuantity("");
    setFees("");
    setTaxes("");
    setExitReason("");
    setNewStop("");
    setEvidence(null);
    clearConfirmations();
  }

  const record = stored.status === "VALID" ? stored.record : null;
  const phase: Phase = useMemo(() => {
    if (safetyFailed || session.safetyWriteFailed || stored.status === "UNVERIFIABLE") return "BLOCKED_UNVERIFIABLE";
    if (stored.status === "ABSENT") return "IDLE";
    switch (stored.record.reason) {
      case "NONE":
        return retryArmed ? "RETRY_ARMED" : "PENDING_COMMIT_UNKNOWN";
      case "READBACK_PENDING":
        return "PENDING_READBACK_COMMITTED";
      case "CONFLICT":
        return "FROZEN";
      default:
        return "BLOCKED_CONTRADICTORY";
    }
  }, [retryArmed, safetyFailed, session, stored]);

  const actionsEnabled = phase === "IDLE" && !busy;
  // BLOCKED_UNVERIFIABLE offers navigation only: with the safety state in doubt, even a read is withheld.
  const canCheck = record !== null && !busy && phase !== "BLOCKED_UNVERIFIABLE";

  function decimalInvalid(value: string, allowZero: boolean) {
    return !REQUEST_DECIMAL.test(value) || (!allowZero && ZERO.test(value));
  }
  function fieldsInvalid(operation: LifecycleOperation) {
    if (!UUID.test(positionId)) return true;
    if (operation === "TIGHTEN_STOP") return decimalInvalid(newStop, false);
    if (!Number.isFinite(Date.parse(brokerEffectiveAt))) return true;
    if (decimalInvalid(price, false) || decimalInvalid(quantity, false)) return true;
    if (decimalInvalid(fees, true) || decimalInvalid(taxes, true)) return true;
    return exitReason.length > 500;
  }
  function confirmationsMissing(operation: LifecycleOperation) {
    if (operation === "TIGHTEN_STOP") return evidence === null || !evidenceAck;
    if (!brokerAck) return true;
    return operation === "FINAL_EXIT" && !finalAck;
  }
  /** Both gates are re-checked at submit time, not only through the disabled Confirm control. */
  function formProblem(operation: LifecycleOperation) {
    return fieldsInvalid(operation) || confirmationsMissing(operation);
  }

  async function dispatch(operation: LifecycleOperation, key: string) {
    if (operation === "TIGHTEN_STOP") {
      // Unreachable while confirmationsMissing gates submit; kept so a null class can never be dispatched.
      if (evidence === null) throw new LifecycleClientError("LIFECYCLE_INPUT_INVALID", { status: 400 });
      return tightenProtectiveStop(key, { positionId, newStop, evidenceClass: evidence });
    }
    const request = {
      positionId,
      brokerEffectiveAt,
      price,
      quantity,
      fees,
      taxes,
      exitReason: exitReason.length === 0 ? null : exitReason,
    };
    return operation === "PARTIAL_EXIT" ? recordPartialExit(key, request) : recordFinalExit(key, request);
  }

  async function submit(operation: LifecycleOperation) {
    setError("");
    setReadFailed("");
    const current = readLifecycleRecord();
    if (current.status === "UNVERIFIABLE") {
      markSafetyFailure();
      setError("LIFECYCLE_UNAVAILABLE");
      setStored(current);
      return;
    }
    if (session.safetyWriteFailed) {
      setError("LIFECYCLE_UNAVAILABLE");
      return;
    }
    if (formProblem(operation)) {
      setError("LIFECYCLE_INPUT_INVALID");
      return;
    }
    let key: string;
    if (current.status === "VALID") {
      const pending = current.record;
      const reusable =
        retryArmed &&
        canArmRetry(session, pending) &&
        pending.operation === operation &&
        pending.positionId === positionId;
      if (!reusable) {
        setError("IDEMPOTENCY_CONFLICT");
        return;
      }
      key = pending.idempotencyKey;
    } else {
      key = crypto.randomUUID();
      try {
        mintLifecycleRecord({ operation, positionId, idempotencyKey: key });
      } catch {
        markSafetyFailure();
        setError("LIFECYCLE_UNAVAILABLE");
        refresh();
        return;
      }
      session.mintedKeys.add(key);
    }
    setBusy(true);
    refresh();
    try {
      const value = await dispatch(operation, key);
      try {
        clearLifecycleRecord();
      } catch {
        markSafetyFailure();
      }
      setResult(value);
      setRecovered(null);
      setRetryArmed(false);
      setDialog(null);
      resetPayloadFields();
      setNotice(
        value.replayed
          ? `The ${operationLabels[operation]} was already recorded under this request key.`
          : `The ${operationLabels[operation]} is recorded.`,
      );
    } catch (failure) {
      const clientError = failure instanceof LifecycleClientError ? failure : null;
      const code = clientError?.code ?? "NETWORK_AMBIGUOUS";
      // A conflict is decided first. Otherwise any failure asserting COMMITTED — whatever its code, so a
      // 502 LIFECYCLE_RESPONSE_INVALID carrying commitState COMMITTED included — must leave the record
      // permanently retry-ineligible.
      const escalation: PendingReason | null =
        code === "IDEMPOTENCY_CONFLICT"
          ? "CONFLICT"
          : code === "LIFECYCLE_COMMITTED_READBACK_PENDING" || clientError?.commitState === "COMMITTED"
            ? "READBACK_PENDING"
            : null;
      if (escalation !== null) {
        try {
          escalateLifecycleRecord(escalation);
        } catch {
          markSafetyFailure();
        }
      }
      setRetryArmed(false);
      setDialog(null);
      setError(code);
    } finally {
      setBusy(false);
      refresh();
    }
  }

  async function checkRecordedOutcome() {
    setError("");
    setReadFailed("");
    const current = readLifecycleRecord();
    setStored(current);
    if (current.status !== "VALID") {
      if (current.status === "UNVERIFIABLE") markSafetyFailure();
      return;
    }
    const pending = current.record;
    setBusy(true);
    try {
      const data = await recoverLifecycle(pending.idempotencyKey, {
        operation: pending.operation,
        positionId: pending.positionId,
      });
      if (data.operation !== pending.operation || data.positionId !== pending.positionId) {
        setReadFailed("LIFECYCLE_RESPONSE_INVALID");
        return;
      }
      resetPayloadFields();
      setRetryArmed(false);
      setRecovered(data);
      if (data.state === "COMMITTED") {
        if (pending.reason === "NONE" || pending.reason === "READBACK_PENDING") {
          try {
            clearLifecycleRecord();
            setNotice(`The ${operationLabels[pending.operation]} is confirmed recorded.`);
          } catch {
            markSafetyFailure();
          }
        } else {
          setNotice("A record exists under this saved request key. It may be a different recorded action.");
        }
        return;
      }
      if (pending.reason === "READBACK_PENDING") {
        try {
          escalateLifecycleRecord("CONTRADICTORY");
        } catch {
          markSafetyFailure();
        }
        setNotice("These two results conflict. Investigate outside AzaLens before any further action.");
        return;
      }
      if (pending.reason === "NONE") {
        if (canArmRetry(session, pending)) {
          setRetryArmed(true);
          setNotice("No record exists under the saved request key. A deliberate same-key retry is available.");
        } else {
          setNotice(
            "No record exists under the saved request key. A retry is not available here because this pending request did not start in this page session.",
          );
        }
        return;
      }
      setNotice("No record exists under the saved request key. The conflict is unexplained; investigate outside AzaLens.");
    } catch (failure) {
      setReadFailed(failure instanceof LifecycleClientError ? failure.code : "NETWORK_AMBIGUOUS");
    } finally {
      setBusy(false);
      refresh();
    }
  }

  const pendingHeadings: Record<Exclude<Phase, "IDLE">, string> = {
    PENDING_COMMIT_UNKNOWN: "Outcome unknown",
    RETRY_ARMED: "No record found under the saved request key",
    PENDING_READBACK_COMMITTED: "Recorded, but not read back",
    FROZEN: "Saved request key conflict",
    BLOCKED_CONTRADICTORY: "Conflicting results",
    BLOCKED_UNVERIFIABLE: "Safety state cannot be verified",
  };
  const pendingBodies: Record<Exclude<Phase, "IDLE">, string> = {
    PENDING_COMMIT_UNKNOWN:
      "The service did not report whether this action was recorded. Check the recorded outcome before anything else; the saved request key is preserved.",
    RETRY_ARMED:
      "An owner-scoped check found no record under this key. Re-enter every value and confirm again to retry with the same key.",
    PENDING_READBACK_COMMITTED:
      "The service reported that this action was recorded but could not read it back. A retry is never offered here, because repeating it would duplicate a recorded event.",
    FROZEN:
      "The database refused this request because a unique constraint was violated. That collision may involve a different payload, action, position or database routine, so nothing here proves what was recorded. This key is frozen: no retry and no new key.",
    BLOCKED_CONTRADICTORY:
      "The service reported this action as recorded, and a later owner-scoped check of the same key found no such record. These results conflict and cannot be resolved from this screen.",
    BLOCKED_UNVERIFIABLE:
      "A saved safety marker is missing, unreadable or could not be written. Because the true state of the saved request key cannot be established here, every action on this page is disabled.",
  };

  const resultRows = (value: LifecycleResult): string[][] =>
    value.operation === "TIGHTEN_STOP"
      ? [
          ["Action", "Protective stop tightening"],
          ["Change reference", value.stopChangeId],
          ["Position", value.positionId],
          ["Prior stop", value.priorStop],
          ["New stop", value.newStop],
          ["Evidence class", value.evidenceClass],
          ["Direction", value.direction],
          ["Replay of an existing record", value.replayed ? "yes" : "no"],
        ]
      : [
          ["Action", value.operation === "PARTIAL_EXIT" ? "Broker-confirmed partial exit" : "Broker-confirmed final exit"],
          ["Event reference", value.eventId],
          ["Position", value.positionId],
          ["Remaining open quantity", value.openQuantity],
          ["Realized P&L", value.realizedPnl],
          ["Broker effective at", value.brokerEffectiveAt],
          ["Replay of an existing record", value.replayed ? "yes" : "no"],
        ];

  const exitFields = (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id="broker-effective-at" label="Broker effective time" value={brokerEffectiveAt} onChange={edit(setBrokerEffectiveAt)} mono />
      <Field id="exit-price" label="Fill price" hint="Plain decimal, no commas." value={price} onChange={edit(setPrice)} />
      <Field id="exit-quantity" label="Quantity" value={quantity} onChange={edit(setQuantity)} />
      <Field id="exit-fees" label="Fees" hint="Zero is allowed." value={fees} onChange={edit(setFees)} />
      <Field id="exit-taxes" label="Taxes" hint="Zero is allowed." value={taxes} onChange={edit(setTaxes)} />
      <Field id="exit-reason" label="Reason (optional)" hint="Left blank, nothing is recorded for it." value={exitReason} onChange={edit(setExitReason)} />
    </div>
  );

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-7 pb-24 sm:px-6 lg:px-8">
      <header className="mb-7">
        <Link to="/settings/personal-risk" className="text-sm font-semibold text-brand hover:underline">
          Personal risk controls
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Position lifecycle</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">
          Record a partial or final exit that your broker has already confirmed, or record a tightened protective stop —
          either one your broker has confirmed, or one you are declaring yourself. AzaLens only records: it never places,
          amends or cancels anything, and nothing on this page reaches your broker.
        </p>
      </header>

      <div aria-live="polite" role="status" className="mb-5 min-h-6 text-sm text-ink-muted">
        {notice}
      </div>
      {error ? (
        <div role="alert" className="mb-5 rounded-2xl border border-critical/30 bg-critical/10 p-4 text-sm text-critical">
          {failureMessages[error] ?? error}
        </div>
      ) : null}

      {phase !== "IDLE" ? (
        <Card className="mb-6">
          <div className="flex gap-3">
            {phase === "RETRY_ARMED" ? (
              <AlertTriangle className="shrink-0 text-caution" />
            ) : (
              <ShieldAlert className="shrink-0 text-critical" />
            )}
            <div className="min-w-0">
              <h2 className="font-semibold text-ink">{pendingHeadings[phase]}</h2>
              <p className="mt-1 text-sm text-ink-muted">{pendingBodies[phase]}</p>
              {record ? (
                <p className="mt-2 text-xs text-ink-muted">
                  Saved {operationLabels[record.operation]} request key is preserved. No prices, quantities, notes or
                  credentials were stored.
                </p>
              ) : null}
              {readFailed ? (
                <p role="alert" className="mt-2 text-sm font-medium text-caution">
                  The last check could not be completed. {failureMessages[readFailed] ?? readFailed} The saved
                  restriction is unchanged.
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-3">
                {canCheck ? (
                  <Button variant="secondary" onClick={() => void checkRecordedOutcome()}>
                    Check recorded outcome
                  </Button>
                ) : null}
                {phase === "RETRY_ARMED" && record ? (
                  <Button onClick={() => setDialog(record.operation)}>Retry same request key</Button>
                ) : null}
                <Link
                  to="/settings"
                  className="inline-flex min-h-11 items-center rounded-2xl border border-stroke px-5 text-sm font-semibold text-ink"
                >
                  Leave this page
                </Link>
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {recovered ? (
        <Card className="mb-6">
          <h2 className="mb-1 font-display text-lg font-semibold text-ink">Owner-scoped check result</h2>
          <p className="mb-4 text-sm text-ink-muted">
            {recovered.state === "NOT_FOUND"
              ? "No record exists under the saved request key for this action and position."
              : phase === "FROZEN" || phase === "BLOCKED_CONTRADICTORY"
                ? "A record exists under this saved request key. It may be a different recorded action, not the one attempted here."
                : "This record exists and is owned by you."}
          </p>
          {recovered.state === "COMMITTED" ? (
            <>
              <Values rows={resultRows(recovered)} />
              {recovered.operation === "TIGHTEN_STOP" ? (
                <p className="mt-3 text-xs text-ink-muted">
                  The evidence class above is reported from the stored record. This check does not verify it against
                  what was submitted.
                </p>
              ) : null}
            </>
          ) : (
            <Values rows={[["Action", operationLabels[recovered.operation]], ["Position", recovered.positionId], ["Result", "NOT_FOUND"]]} />
          )}
        </Card>
      ) : null}

      {result ? (
        <Card className="mb-6" variant="positive">
          <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold text-ink">
            <CheckCircle2 size={18} className="text-positive" /> Recorded in AzaLens
          </h2>
          <Values rows={resultRows(result)} />
        </Card>
      ) : null}

      <Card className="mb-6">
        <h2 className="mb-4 font-display text-lg font-semibold text-ink">Position</h2>
        <Field
          id="position-id"
          label="Position identifier"
          hint="Positions are identified by their UUID. Paste the identifier of the position this action belongs to."
          value={positionId}
          onChange={edit(setPositionId)}
          mono
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center gap-2 text-brand">
            <TrendingDown size={18} />
            <h2 className="font-display text-lg font-semibold text-ink">Broker-confirmed exit</h2>
          </div>
          <p className="mb-4 text-sm text-ink-muted">
            Both kinds of exit require that your broker has already confirmed the fill. AzaLens records the confirmed
            event; it does not sell anything.
          </p>
          {exitFields}
          <div className="mt-4 flex flex-wrap gap-3">
            <Button disabled={!actionsEnabled} onClick={() => setDialog("PARTIAL_EXIT")}>
              Review partial exit
            </Button>
            <Button disabled={!actionsEnabled} onClick={() => setDialog("FINAL_EXIT")}>
              Review final exit
            </Button>
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center gap-2 text-brand">
            <ShieldCheck size={18} />
            <h2 className="font-display text-lg font-semibold text-ink">Protective stop tightening</h2>
          </div>
          <p className="mb-4 text-sm text-ink-muted">
            A stop can only be tightened here; loosening is not available through AzaLens. Choose how this change is
            evidenced — the two cases mean different things, so neither is chosen for you.
          </p>
          <Field id="new-stop" label="New stop price" hint="Plain decimal, no commas." value={newStop} onChange={edit(setNewStop)} />
          <fieldset className="mt-4">
            <legend className="text-sm font-semibold text-ink">Evidence class</legend>
            {(["BROKER_CONFIRMED", "OWNER_DECLARED"] as const).map((option) => (
              <label key={option} className="mt-2 flex gap-3 text-sm text-ink">
                <input
                  type="radio"
                  name="evidence-class"
                  checked={evidence === option}
                  onChange={() => {
                    setEvidence(option);
                    clearConfirmations();
                  }}
                />
                {option === "BROKER_CONFIRMED" ? "Broker confirmed" : "Owner declared"}
              </label>
            ))}
          </fieldset>
          <p className="mt-3 rounded-xl border border-stroke bg-surface-soft p-3 text-sm text-ink-muted">
            {evidence === null
              ? "Choose one of the two cases above. Neither statement applies until you do."
              : evidence === "OWNER_DECLARED"
                ? OWNER_DECLARED_COPY
                : BROKER_CONFIRMED_COPY}
          </p>
          <Button className="mt-4" disabled={!actionsEnabled} onClick={() => setDialog("TIGHTEN_STOP")}>
            Review stop tightening
          </Button>
        </Card>
      </div>

      <ConfirmDialog
        open={dialog === "PARTIAL_EXIT" || dialog === "FINAL_EXIT"}
        title={dialog === "FINAL_EXIT" ? "Record a broker-confirmed final exit?" : "Record a broker-confirmed partial exit?"}
        description="AzaLens records this confirmed event. It does not place, amend or cancel anything at your broker."
        busy={busy}
        error={error}
        confirmDisabled={dialog !== null && formProblem(dialog)}
        onClose={() => setDialog(null)}
        onConfirm={() => void submit(dialog === "FINAL_EXIT" ? "FINAL_EXIT" : "PARTIAL_EXIT")}
      >
        <Values
          rows={[
            ["Position", positionId || "Required"],
            ["Broker effective at", brokerEffectiveAt || "Required"],
            ["Price", price || "Required"],
            ["Quantity", quantity || "Required"],
            ["Fees", fees || "Required"],
            ["Taxes", taxes || "Required"],
            ["Reason", exitReason.length === 0 ? "None recorded" : exitReason],
          ]}
        />
        <label className="mt-4 flex gap-3 text-sm text-ink">
          <input type="checkbox" checked={brokerAck} onChange={(event) => setBrokerAck(event.target.checked)} />
          I confirm my broker has already confirmed this fill.
        </label>
        {dialog === "FINAL_EXIT" ? (
          <label className="mt-3 flex gap-3 text-sm text-ink">
            <input type="checkbox" checked={finalAck} onChange={(event) => setFinalAck(event.target.checked)} />
            I understand this closes the position record and cannot be undone.
          </label>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "TIGHTEN_STOP"}
        title="Record a tightened protective stop?"
        description="Only tightening is possible here, and the evidence class is recorded exactly as chosen."
        busy={busy}
        error={error}
        confirmDisabled={formProblem("TIGHTEN_STOP")}
        onClose={() => setDialog(null)}
        onConfirm={() => void submit("TIGHTEN_STOP")}
      >
        <Values
          rows={[
            ["Position", positionId || "Required"],
            ["New stop", newStop || "Required"],
            ["Evidence class", evidence ?? "Not selected"],
          ]}
        />
        {evidence === null ? (
          <p className="mt-4 rounded-xl border border-caution/35 bg-caution/10 p-4 text-sm text-caution">
            Choose whether your broker confirmed this stop change or you are declaring it yourself. Neither statement
            applies until you do, so there is nothing here to acknowledge yet.
          </p>
        ) : (
          <>
            <p className="mt-4 rounded-xl border border-caution/35 bg-caution/10 p-4 text-sm text-caution">
              {evidence === "OWNER_DECLARED" ? OWNER_DECLARED_COPY : BROKER_CONFIRMED_COPY}
            </p>
            <label className="mt-4 flex gap-3 text-sm text-ink">
              <input type="checkbox" checked={evidenceAck} onChange={(event) => setEvidenceAck(event.target.checked)} />
              I have read the statement above and it matches what happened.
            </label>
          </>
        )}
      </ConfirmDialog>
    </main>
  );
}
