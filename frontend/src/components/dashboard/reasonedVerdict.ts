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
  withheld: boolean;
  withheldMessage: string | null;
  lean: string | null;
  tone: LeanTone | null;
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

const DEFAULT_WITHHELD_MESSAGE =
  "AAOIFI Shariah compliance has not been confirmed for this stock, so AzaLens withholds its trade analysis. Details are in the Shariah Compliance workspace.";

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
  const currency = data.market?.data?.currency || "USD";

  const shariahStatus = data.shariah?.summary?.status;

  const shariahLabel =
    shariahStatus === "COMPLIANT"
      ? "Compliant"
      : shariahStatus === "NON_COMPLIANT"
        ? "Non-compliant"
        : "Review required";

  const shariahTone =
    shariahStatus === "COMPLIANT"
      ? ("success" as const)
      : shariahStatus === "NON_COMPLIANT"
        ? ("danger" as const)
        : ("warning" as const);

  const livePrice = toFinite(data.market?.data?.price);
  const analysisPrice = toFinite(data.priceContext?.analysisPrice);

  const price = livePrice ?? analysisPrice;
  const priceSource =
    livePrice !== null
      ? null
      : data.priceContext?.analysisPriceSource ?? null;
  const changePercent =
    livePrice !== null
      ? toFinite(data.market?.data?.changePercent)
      : null;

  /*
    Default-deny: the verdict is only shown when the backend
    gate explicitly unlocked it. A missing gate (older cached
    response) withholds rather than guesses.
  */
  if (data.complianceGate?.unlocked !== true) {
    return {
      withheld: true,
      withheldMessage:
        data.complianceGate?.message ?? DEFAULT_WITHHELD_MESSAGE,
      lean: null,
      tone: null,
      confidence: null,
      why: null,
      invalidation: null,
      shariahLabel,
      shariahTone,
      price,
      priceSource,
      changePercent,
      currency,
    };
  }

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

  return {
    withheld: false,
    withheldMessage: null,
    lean,
    tone,
    confidence,
    why,
    invalidation,
    shariahLabel,
    shariahTone,
    price,
    priceSource,
    changePercent,
    currency,
  };
}
