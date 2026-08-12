import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";

import {
  GRADED_EVIDENCE_STATES,
  LIMITED_EVIDENCE_STATE,
} from "../../types/analysis";
import type { ThesisInvalidation } from "../../types/overview";
import { Badge, Card } from "../ui";

interface VerdictCardProps {
  direction?: string;
  trend?: string;
  confidence?: number;
  evidenceState?: string;
  coveragePercent?: number;
  availableIndicators?: number;
  expectedIndicators?: number;
  summary?: string;
  invalidation?: ThesisInvalidation | null;
  isLoading?: boolean;
}

type VerdictTone = {
  accent: string;
  badge: "success" | "warning" | "danger" | "neutral";
  bar: string;
};

function getVerdictTone(value: string): VerdictTone {
  const normalized = value.toLowerCase();
  if (normalized.includes("bullish") || normalized.includes("positive")) {
    return { accent: "text-positive", badge: "success", bar: "bg-positive" };
  }
  if (normalized.includes("constructive")) {
    return { accent: "text-positive", badge: "success", bar: "bg-positive" };
  }
  if (normalized.includes("bearish") || normalized.includes("negative")) {
    return { accent: "text-critical", badge: "danger", bar: "bg-critical" };
  }
  if (
    normalized.includes("adverse") ||
    normalized.includes("deteriorating") ||
    normalized.includes("invalidated")
  ) {
    return { accent: "text-critical", badge: "danger", bar: "bg-critical" };
  }
  if (normalized.includes("neutral") || normalized.includes("mixed")) {
    return { accent: "text-caution", badge: "warning", bar: "bg-caution" };
  }
  return { accent: "text-ink-soft", badge: "neutral", bar: "bg-ink-muted" };
}

/*
 * Temporary presentation safeguard (PR 1B).
 *
 * A graded label - High/Moderate/Low agreement - is a claim about how much
 * complete, directional evidence agrees. The backend already says so in
 * `evidenceState`, which carries "Limited evidence", "No directional evidence"
 * and "Conflicting evidence" for the states that must never be graded.
 *
 * Two gaps remained here, both presentation-only:
 *
 *   1. With no `evidenceState`, this card graded a bare percentage. A percentage
 *      alone cannot tell complete evidence from limited, neutral or deadlocked
 *      evidence, so grading it invented a confidence the data does not support.
 *   2. A graded state arriving alongside demonstrably incomplete coverage was
 *      still shown as a grade.
 *
 * This function only decides which words appear. It changes no number, no
 * threshold and no contract value; `confidence` is still rendered verbatim as
 * the percentage. Distinguishing neutral from conflicting evidence remains the
 * backend's job via `evidenceState` - this card never infers it.
 */
/*
 * The graded and limited states come from the shared wire vocabulary in
 * types/analysis.ts, so this card cannot fall out of step with the backend by
 * retyping one of them. "Awaiting evidence" stays local on purpose: it is not a
 * backend state, it is what this card says when it was given nothing to render.
 */
const GRADED_AGREEMENT_LABELS: readonly string[] = GRADED_EVIDENCE_STATES;
const LIMITED_EVIDENCE_LABEL: string = LIMITED_EVIDENCE_STATE;
const AWAITING_EVIDENCE_LABEL = "Awaiting evidence";

function resolveAgreementLabel({
  evidenceState,
  availableIndicators,
  expectedIndicators,
}: Pick<
  VerdictCardProps,
  "evidenceState" | "availableIndicators" | "expectedIndicators"
>) {
  const declared = evidenceState?.trim();
  const coverageIncomplete =
    typeof availableIndicators === "number" &&
    typeof expectedIndicators === "number" &&
    expectedIndicators > 0 &&
    availableIndicators < expectedIndicators;

  if (declared) {
    // A grade may only stand when the evidence behind it is complete.
    return coverageIncomplete && GRADED_AGREEMENT_LABELS.includes(declared)
      ? LIMITED_EVIDENCE_LABEL
      : declared;
  }

  // No declared state: never grade. Say what is actually known.
  return coverageIncomplete ? LIMITED_EVIDENCE_LABEL : AWAITING_EVIDENCE_LABEL;
}

function InvalidationBox({
  invalidation,
  isLoading,
}: {
  invalidation?: ThesisInvalidation | null;
  isLoading: boolean;
}) {
  const status = invalidation?.status ?? "unknown";
  const violated = status === "violated";
  const intact = status === "intact";
  const Icon = violated ? AlertTriangle : intact ? CheckCircle2 : ShieldAlert;
  const statusLabel = violated ? "VIOLATED" : intact ? "INTACT" : "REVIEW";
  const tone = violated
    ? "border-critical/35 bg-critical/10 text-critical"
    : intact
      ? "border-positive/35 bg-positive/10 text-positive"
      : "border-caution/35 bg-caution/10 text-caution";

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-intelligence/35 bg-surface-soft">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-stroke px-3.5 py-3 sm:px-4">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-ink">
          Thesis invalidation criteria
        </h3>
        <span
          className={`inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 font-mono text-[11px] font-bold ${tone}`}
        >
          <Icon size={13} />
          {isLoading ? "EVALUATING" : statusLabel}
        </span>
      </header>

      <dl className="grid gap-px bg-stroke sm:grid-cols-2">
        <div className="min-w-0 bg-surface-soft p-3.5 sm:p-4">
          <dt className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            Technical invalidation
          </dt>
          <dd className="mt-2 break-words hyphens-auto text-sm leading-6 text-ink-soft">
            {isLoading
              ? "Evaluating live price and volume conditions…"
              : invalidation?.technical?.trim() ||
                "No technical invalidation rule was supplied by the analysis API."}
          </dd>
          {!isLoading && invalidation?.evidence?.technical?.evidence && (
            <dd className="mt-2 break-words font-mono text-[11px] leading-5 text-ink-muted">
              {invalidation.evidence.technical.evidence}
            </dd>
          )}
        </div>
        <div className="min-w-0 bg-surface-soft p-3.5 sm:p-4">
          <dt className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            Fundamental / risk invalidation
          </dt>
          <dd className="mt-2 break-words hyphens-auto text-sm leading-6 text-ink-soft">
            {isLoading
              ? "Evaluating financial and AAOIFI boundaries…"
              : invalidation?.fundamental?.trim() ||
                "No fundamental invalidation rule was supplied by the analysis API."}
          </dd>
          {!isLoading && invalidation?.evidence?.fundamental?.evidence && (
            <dd className="mt-2 break-words font-mono text-[11px] leading-5 text-ink-muted">
              {invalidation.evidence.fundamental.evidence}
            </dd>
          )}
        </div>
      </dl>
    </section>
  );
}

export default function VerdictCard({
  direction,
  trend,
  confidence,
  evidenceState,
  coveragePercent,
  availableIndicators,
  expectedIndicators,
  summary,
  invalidation,
  isLoading = false,
}: VerdictCardProps) {
  const verdict = direction?.trim() || trend?.trim() || "Unavailable";
  const safeConfidence =
    typeof confidence === "number" ? Math.min(100, Math.max(0, confidence)) : 0;
  const agreementLabel = resolveAgreementLabel({
    evidenceState,
    availableIndicators,
    expectedIndicators,
  });
  const evidenceBasis =
    typeof availableIndicators === "number" &&
    typeof expectedIndicators === "number"
      ? `${availableIndicators} of ${expectedIndicators} indicators available`
      : typeof coveragePercent === "number"
        ? `${coveragePercent}% evidence coverage`
        : "Coverage details unavailable";
  const tone = getVerdictTone(verdict);

  return (
    <Card variant="brand" padding="lg">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
        <div className="min-w-0">
          <p className="az-eyebrow text-intelligence">AzaLens Verdict</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h2
              className={`break-words font-display text-4xl font-bold tracking-tight sm:text-5xl ${tone.accent}`}
            >
              {isLoading ? "ANALYZING" : verdict.toUpperCase()}
            </h2>
            <Badge variant={isLoading ? "neutral" : tone.badge}>
              {isLoading ? "Live analysis loading" : trend || "Trend unavailable"}
            </Badge>
          </div>
          <p className="mt-4 max-w-2xl break-words hyphens-auto text-sm leading-6 text-ink-soft sm:text-base sm:leading-7">
            {isLoading
              ? "AzaLens is evaluating the latest technical evidence and market structure."
              : summary ||
                "The backend did not return an explanation for this analysis."}
          </p>
        </div>

        <div className="rounded-2xl border border-stroke bg-surface-soft p-3.5 sm:p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                Evidence Agreement
              </p>
              <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-ink sm:text-4xl">
                {isLoading ? "--" : `${safeConfidence}%`}
              </p>
            </div>
            <span className={`text-right text-xs font-medium ${tone.accent}`}>
              {isLoading ? "Calculating" : agreementLabel}
            </span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-stroke">
            <div
              className={`h-full rounded-full transition-[width] duration-1000 ${tone.bar}`}
              style={{ width: `${isLoading ? 0 : safeConfidence}%` }}
            />
          </div>
          <p className="mt-3 break-words text-[11px] leading-5 text-ink-muted">
            {isLoading
              ? "Measuring agreement and evidence coverage."
              : `${evidenceBasis}. Not a probability or performance guarantee.`}
          </p>
        </div>
      </div>

      <InvalidationBox invalidation={invalidation} isLoading={isLoading} />
    </Card>
  );
}
