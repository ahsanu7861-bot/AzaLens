import { Badge, Card } from "../ui";
import type { CSSProperties } from "react";

type AIVerdictProps = {
  direction?: string;
  trend?: string;
  confidence?: number;
  summary?: string;
  isLoading?: boolean;
};

type VerdictTone = {
  accent: string;
  accentValue: string;
  badge: "success" | "warning" | "danger" | "neutral";
  bar: string;
};

function getVerdictTone(value: string): VerdictTone {
  const normalizedValue = value.toLowerCase();

  if (
    normalizedValue.includes("bullish") ||
    normalizedValue.includes("positive")
  ) {
    return {
      accent: "text-emerald-400",
      accentValue: "var(--az-positive)",
      badge: "success",
      bar: "bg-positive",
    };
  }

  if (
    normalizedValue.includes("bearish") ||
    normalizedValue.includes("negative")
  ) {
    return {
      accent: "text-rose-400",
      accentValue: "var(--az-critical)",
      badge: "danger",
      bar: "bg-critical",
    };
  }

  if (normalizedValue.includes("neutral") || normalizedValue.includes("mixed")) {
    return {
      accent: "text-amber-400",
      accentValue: "var(--az-caution)",
      badge: "warning",
      bar: "bg-caution",
    };
  }

  return {
    accent: "text-slate-300",
    accentValue: "var(--az-text-soft)",
    badge: "neutral",
    bar: "bg-ink-muted",
  };
}

export default function AIVerdict({
  direction,
  trend,
  confidence,
  summary,
  isLoading = false,
}: AIVerdictProps) {
  const verdict = direction?.trim() || trend?.trim() || "Unavailable";
  const safeConfidence =
    typeof confidence === "number"
      ? Math.min(100, Math.max(0, confidence))
      : 0;
  const confidenceLabel =
    safeConfidence >= 75
      ? "High confidence"
      : safeConfidence >= 50
        ? "Moderate confidence"
        : safeConfidence > 0
          ? "Low confidence"
          : "Awaiting confidence";
  const tone = getVerdictTone(verdict);

  return (
    <Card
      variant="default"
      padding="lg"
      className="az-verdict-card"
      style={
        {
          "--az-verdict-accent": tone.accentValue,
        } as CSSProperties
      }
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.05em] text-intelligence">
            AI Verdict
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <h2
              className={`font-display text-[44px] font-bold leading-none tracking-tight ${tone.accent}`}
            >
              {isLoading ? "ANALYZING" : verdict.toUpperCase()}
            </h2>

            <Badge variant={isLoading ? "neutral" : tone.badge}>
              {isLoading ? "Live analysis loading" : trend || "Trend unavailable"}
            </Badge>
          </div>

          <p className="mt-5 max-w-2xl text-sm leading-6 text-ink-soft">
            {isLoading
              ? "AzaLens is evaluating the latest technical evidence and market structure."
              : summary ||
                "The backend did not return an explanation for this analysis."}
          </p>
        </div>

        <div className="rounded-xl border border-stroke bg-surface-soft p-6">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.05em] text-ink-muted">
                AI Confidence
              </p>

              <p className="az-numeric mt-2 text-4xl font-bold text-ink">
                {isLoading ? "--" : `${safeConfidence}%`}
              </p>
            </div>

            <span className={`text-sm font-medium ${tone.accent}`}>
              {isLoading ? "Calculating" : confidenceLabel}
            </span>
          </div>

          <div className="mt-5 h-2 overflow-hidden rounded-full bg-stroke-strong">
            <div
              className={`az-confidence-fill h-full rounded-full ${tone.bar}`}
              style={{ width: `${isLoading ? 0 : safeConfidence}%` }}
            />
          </div>

          <p className="mt-3 text-xs leading-5 text-ink-muted">
            Confidence is the backend&apos;s indicator-agreement score, not a
            guarantee of future performance.
          </p>
        </div>
      </div>
    </Card>
  );
}
