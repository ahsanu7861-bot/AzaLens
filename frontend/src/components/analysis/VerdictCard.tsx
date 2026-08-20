import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";

import type { EvidenceAgreement, EvidenceFamily } from "../../types/analysis";
import type { ThesisInvalidation } from "../../types/overview";
import { Badge, Card } from "../ui";

interface VerdictCardProps {
  direction?: string;
  trend?: string;
  /*
   * The canonical evidence assessment. There is deliberately no numeric
   * agreement prop: a missing number used to be coerced to 0 and rendered as
   * "0%", which stated a measurement that had not been made.
   */
  evidence?: EvidenceAgreement | null;
  summary?: string;
  invalidation?: ThesisInvalidation | null;
  isLoading?: boolean;
  /*
   * Headline typography only. A closed variant rather than a class string, so a
   * consumer can pick a presentation but cannot invent one.
   *
   * "standard" is the established analysis-workspace headline and the default:
   * omitting this prop renders exactly what it rendered before the prop existed.
   *
   * "compact" exists because the canonical public labels are long — "Constructive
   * — Upside Evidence Established" is 42 characters — and the landing
   * demonstration renders the card in a two-column grid roughly 240px wide. At
   * the standard size `break-words` engaged inside words there and split the
   * label as CONSTRU/CTIVE and ESTABLIS/HED. Compact drops a size and drops
   * `break-words`, so the same full label wraps only between words.
   */
  headlineScale?: "standard" | "compact";
}

/*
 * Both variants are spelled out in full rather than composed, so the standard
 * string is verifiably byte-identical to the pre-correction className and a
 * reviewer can diff the two presentations directly.
 *
 * `break-words` is retained on standard and absent from compact. On the wide
 * analysis column it is a last-resort guard that never engages in practice; in a
 * narrow column it is precisely what causes mid-word fragmentation.
 */
const HEADLINE_SCALE_CLASSES = {
  standard:
    "break-words font-display text-4xl font-bold tracking-tight sm:text-5xl",
  compact: "font-display text-2xl font-bold tracking-tight sm:text-3xl",
} as const;

type VerdictTone = {
  accent: string;
  badge: "success" | "warning" | "danger" | "neutral";
};

function getVerdictTone(value: string): VerdictTone {
  const normalized = value.toLowerCase();
  if (normalized.includes("bullish") || normalized.includes("positive")) {
    return { accent: "text-positive", badge: "success" };
  }
  if (normalized.includes("constructive")) {
    return { accent: "text-positive", badge: "success" };
  }
  if (normalized.includes("bearish") || normalized.includes("negative")) {
    return { accent: "text-critical", badge: "danger" };
  }
  if (normalized.includes("adverse")) {
    return { accent: "text-critical", badge: "danger" };
  }
  if (normalized.includes("neutral") || normalized.includes("mixed")) {
    return { accent: "text-caution", badge: "warning" };
  }
  return { accent: "text-ink-soft", badge: "neutral" };
}

/*
 * Family state presentation.
 *
 * Every state carries a word, never colour alone: a reader who cannot
 * distinguish the tones still gets the full meaning from the text, and the
 * accessible name of each row is "{family}: {state}".
 */
const FAMILY_STATE_TEXT: Record<string, string> = {
  BULLISH: "Bullish",
  BEARISH: "Bearish",
  NEUTRAL: "Neutral",
  UNAVAILABLE: "Unavailable",
};

const FAMILY_STATE_TONE: Record<string, string> = {
  BULLISH: "border-positive/35 bg-positive/10 text-positive",
  BEARISH: "border-critical/35 bg-critical/10 text-critical",
  NEUTRAL: "border-caution/35 bg-caution/10 text-caution",
  UNAVAILABLE: "border-stroke bg-surface text-ink-muted",
};

function familyStateText(vote: string) {
  return FAMILY_STATE_TEXT[vote] ?? "Unavailable";
}

function FamilyStrip({ families }: { families: EvidenceFamily[] }) {
  return (
    <ul className="mt-3 grid gap-1.5" data-testid="evidence-family-strip">
      {families.map((family) => {
        const vote = String(family.vote);
        const stateText = familyStateText(vote);
        return (
          <li
            key={family.id}
            aria-label={`${family.label}: ${stateText}`}
            className="flex items-center justify-between gap-3 rounded-lg border border-stroke bg-surface px-2.5 py-1.5"
          >
            <span className="min-w-0 truncate text-[11px] font-medium text-ink-soft">
              {family.label}
            </span>
            <span
              aria-hidden="true"
              className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${
                FAMILY_STATE_TONE[vote] ?? FAMILY_STATE_TONE.UNAVAILABLE
              }`}
            >
              {stateText}
            </span>
          </li>
        );
      })}
    </ul>
  );
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
  evidence,
  summary,
  invalidation,
  isLoading = false,
  headlineScale = "standard",
}: VerdictCardProps) {
  const verdict = direction?.trim() || trend?.trim() || "Unavailable";
  const tone = getVerdictTone(verdict);
  const families = evidence?.coverage?.families ?? [];
  const state = evidence?.state?.trim();
  const synthesis = evidence?.summary?.trim();
  const coverage = evidence?.coverage;

  const coverageStatement =
    coverage && typeof coverage.usableFamilies === "number"
      ? `${coverage.usableFamilies} of ${coverage.expectedFamilies ?? 4} evidence families usable.`
      : "Evidence coverage is unavailable for this analysis.";

  return (
    <Card variant="brand" padding="lg">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
        <div className="min-w-0">
          <p className="az-eyebrow text-intelligence">AzaLens Verdict</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h2
              className={`${HEADLINE_SCALE_CLASSES[headlineScale]} ${tone.accent}`}
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

        <section
          aria-labelledby="evidence-agreement-heading"
          className="rounded-2xl border border-stroke bg-surface-soft p-3.5 sm:p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <h3
              id="evidence-agreement-heading"
              className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-muted"
            >
              Evidence Agreement
            </h3>
            {!isLoading && state && (
              <span className={`text-right text-xs font-medium ${tone.accent}`}>
                {state}
              </span>
            )}
          </div>

          {isLoading ? (
            <p className="mt-3 text-[11px] leading-5 text-ink-muted">
              Reading the four evidence families.
            </p>
          ) : families.length > 0 ? (
            <>
              <FamilyStrip families={families} />
              <p className="mt-3 break-words text-sm leading-6 text-ink-soft">
                {synthesis || "No evidence assessment was supplied by the analysis API."}
              </p>
              <p className="mt-2 break-words text-[11px] leading-5 text-ink-muted">
                {coverageStatement}
              </p>
            </>
          ) : (
            <p className="mt-3 break-words text-sm leading-6 text-ink-soft">
              {synthesis || "No evidence assessment was supplied by the analysis API."}
            </p>
          )}
        </section>
      </div>

      <InvalidationBox invalidation={invalidation} isLoading={isLoading} />
    </Card>
  );
}
