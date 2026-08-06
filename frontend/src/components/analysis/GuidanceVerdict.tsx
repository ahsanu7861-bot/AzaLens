import { AlertTriangle, Eye, Scale, ShieldCheck } from "lucide-react";

import type { AnalysisData } from "../../types/analysis";
import AIVerdictCard from "./AIVerdictCard";

type Guidance = NonNullable<AnalysisData["guidance"]>;

type GuidanceVerdictProps = {
  guidance?: Guidance;
  isLoading?: boolean;
};

function verdictLabel(guidance?: Guidance) {
  if (!guidance) return "Analysis Limited — Guidance Unavailable";

  switch (guidance.verdict.state) {
    case "FAVORED":
      return guidance.verdict.direction === "BEARISH"
        ? "Adverse — Downside Evidence Dominates"
        : "Constructive — Upside Evidence Dominates";
    case "LIMITED_EVIDENCE":
      return "Unconfirmed — Evidence Still Developing";
    case "CONFLICTING":
      return "Mixed — No Established Edge";
    case "NEUTRAL":
      return "Neutral — No Directional Lean";
    case "WITHHELD":
      return "Verdict Withheld — Shariah Gate Not Cleared";
    default:
      return "Analysis Limited — Evidence Unavailable";
  }
}

function horizonLabel(horizon?: string) {
  return horizon === "SWING_2_TO_10_SESSIONS"
    ? "Swing · 2–10 sessions"
    : horizon?.replaceAll("_", " ") || "Horizon unavailable";
}

function freshnessLabel(freshness: unknown, asOf?: string) {
  const source = freshness && typeof freshness === "object"
    ? freshness as { state?: unknown; asOf?: unknown }
    : {};
  const state = typeof source.state === "string" ? source.state : "unknown";
  const timestamp = source.asOf ?? asOf;
  const date = timestamp ? new Date(String(timestamp)) : null;
  const formatted = date && !Number.isNaN(date.getTime())
    ? date.toLocaleString()
    : "time unavailable";
  return `${state.replaceAll("_", " ")} · ${formatted}`;
}

function EvidenceList({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: Guidance["supportingEvidence"];
  emptyLabel: string;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-stroke bg-surface-soft p-4">
      <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        {title}
      </h3>
      {items.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {items.map((item, index) => (
            <li key={`${item.source}-${index}`} className="text-sm leading-6 text-ink-soft">
              <span className="font-semibold text-ink">{item.source}:</span>{" "}
              {item.statement}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm leading-6 text-ink-muted">{emptyLabel}</p>
      )}
    </section>
  );
}

export default function GuidanceVerdict({
  guidance,
  isLoading = false,
}: GuidanceVerdictProps) {
  const agreement = guidance?.evidenceAgreement;
  const limitations = guidance?.limitations ?? [];

  return (
    <div className="space-y-5" data-testid="guidance-verdict">
      <AIVerdictCard
        direction={verdictLabel(guidance)}
        trend={horizonLabel(guidance?.horizon)}
        confidence={agreement?.percent ?? undefined}
        evidenceState={agreement?.state}
        availableIndicators={agreement?.available}
        expectedIndicators={agreement?.expected}
        summary={guidance?.currentSituation}
        invalidation={guidance?.invalidation}
        isLoading={isLoading}
      />

      {!isLoading && guidance && (
        <section className="az-card p-5 sm:p-6" aria-labelledby="scenario-guidance-title">
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-intelligence/10 text-intelligence">
              <Scale size={18} aria-hidden="true" />
            </div>
            <div>
              <p className="az-eyebrow">Reasoned scenario guidance</p>
              <h2 id="scenario-guidance-title" className="mt-1 font-display text-xl font-semibold text-ink">
                What the evidence means
              </h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-ink-soft">
                {guidance.meaning}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <EvidenceList
              title="What supports this scenario"
              items={guidance.supportingEvidence}
              emptyLabel="No supporting directional evidence is established."
            />
            <EvidenceList
              title="What challenges this scenario"
              items={guidance.opposingEvidence}
              emptyLabel="No opposing evidence was identified in the available indicator set."
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-intelligence/25 bg-intelligence/5 p-4">
              <div className="flex items-center gap-2 text-intelligence">
                <Eye size={16} aria-hidden="true" />
                <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider">
                  What to observe next
                </h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-ink-soft">{guidance.nextObservation}</p>
              {guidance.confirmations.length > 0 && (
                <div className="mt-4 border-t border-intelligence/20 pt-4">
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                    Confirmation condition
                  </p>
                  <ul className="mt-2 space-y-2 text-sm leading-6 text-ink-soft">
                    {guidance.confirmations.map((condition, index) => (
                      <li key={`${condition}-${index}`}>{condition}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-stroke bg-surface-soft p-4">
              <div className="flex items-center gap-2 text-ink">
                <ShieldCheck size={16} aria-hidden="true" />
                <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider">
                  Scope and freshness
                </h3>
              </div>
              <dl className="mt-3 space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-ink-muted">Analysis horizon</dt>
                  <dd className="mt-1 font-medium text-ink-soft">{horizonLabel(guidance.horizon)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-muted">Evidence freshness</dt>
                  <dd className="mt-1 capitalize text-ink-soft">{freshnessLabel(guidance.freshness, guidance.asOf)}</dd>
                </div>
              </dl>
            </section>
          </div>

          <section className="mt-4 rounded-2xl border border-caution/25 bg-caution/5 p-4">
            <div className="flex items-center gap-2 text-caution">
              <AlertTriangle size={16} aria-hidden="true" />
              <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider">
                Limitations
              </h3>
            </div>
            {limitations.length > 0 ? (
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-ink-soft">
                {limitations.map((limitation, index) => (
                  <li key={`${limitation}-${index}`}>{limitation}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm leading-6 text-ink-soft">
                No additional data limitations were reported for this analysis.
              </p>
            )}
            <p className="mt-3 border-t border-caution/20 pt-3 text-xs leading-5 text-ink-muted">
              Scenario analysis is general research, not personalized investment advice or a transaction instruction. Evidence can change after the stated analysis time.
            </p>
          </section>
        </section>
      )}
    </div>
  );
}
