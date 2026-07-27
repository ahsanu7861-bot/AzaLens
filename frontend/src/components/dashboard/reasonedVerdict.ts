import type { AnalysisData } from "../../types/analysis";

/*
  Builds a reasoned verdict from real analysis data: a directional
  lean, a confidence level, a plain-language "why", and the level
  that would weaken the thesis. Never a buy/sell command, and no
  field is invented — anything missing stays null so the UI can
  say so honestly.
*/

export type LeanTone = "bullish" | "bearish" | "mixed";

export interface ReasonedVerdict {
  lean: string;
  tone: LeanTone;
  confidence: number | null;
  why: string | null;
  invalidation: string | null;
  shariahLabel: string;
  shariahTone: "success" | "danger" | "warning";
  price: number | null;
  priceSource: string | null;
  changePercent: number | null;
  currency: string;
}

function toFinite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function formatMoney(
  value: number | null,
  currency: string,
): string {
  if (value === null) {
    return "—";
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function formatChangePercent(value: number | null): string | null {
  if (value === null) {
    return null;
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function buildReasonedVerdict(
  data: AnalysisData,
): ReasonedVerdict {
  const direction =
    data.agreement?.direction ?? data.agreement?.agreement ?? null;

  const tone: LeanTone =
    direction === "Bullish"
      ? "bullish"
      : direction === "Bearish"
        ? "bearish"
        : "mixed";

  const lean =
    tone === "bullish"
      ? "Leaning Bullish"
      : tone === "bearish"
        ? "Leaning Bearish"
        : "Mixed Evidence";

  const confidence = toFinite(data.agreement?.confidence);

  const why =
    data.agreement?.agreementSummary ??
    data.explanation?.overallAssessment ??
    null;

  const currency = data.market?.data?.currency || "USD";

  let invalidation: string | null = null;

  if (tone === "bullish") {
    const support = toFinite(data.confluence?.nearestSupport?.zone?.center);

    if (support !== null) {
      invalidation = `Weakens below ${formatMoney(support, currency)} (nearest support)`;
    }
  } else if (tone === "bearish") {
    const resistance = toFinite(
      data.confluence?.nearestResistance?.zone?.center,
    );

    if (resistance !== null) {
      invalidation = `Weakens above ${formatMoney(resistance, currency)} (nearest resistance)`;
    }
  }

  const shariahStatus = data.shariah?.summary?.status;

  const shariahLabel =
    shariahStatus === "COMPLIANT"
      ? "Compliant"
      : shariahStatus === "NON_COMPLIANT"
        ? "Non-compliant"
        : "Review required";

  const shariahTone =
    shariahStatus === "COMPLIANT"
      ? "success"
      : shariahStatus === "NON_COMPLIANT"
        ? "danger"
        : "warning";

  const livePrice = toFinite(data.market?.data?.price);
  const analysisPrice = toFinite(data.priceContext?.analysisPrice);

  return {
    lean,
    tone,
    confidence,
    why,
    invalidation,
    shariahLabel,
    shariahTone,
    price: livePrice ?? analysisPrice,
    priceSource:
      livePrice !== null
        ? null
        : data.priceContext?.analysisPriceSource ?? null,
    changePercent:
      livePrice !== null
        ? toFinite(data.market?.data?.changePercent)
        : null,
    currency,
  };
}
