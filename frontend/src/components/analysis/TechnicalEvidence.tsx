import { ShieldAlert } from "lucide-react";
import type { AnalysisData } from "../../types/analysis";
import { Badge, Card } from "../ui";

type TechnicalEvidenceProps = {
  indicators?: AnalysisData["indicators"];
  agreement?: AnalysisData["agreement"];
  currency?: string;
  isLoading?: boolean;
};

type BadgeVariant =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral";

type EvidenceItem = {
  label: string;
  value: string;
  status: string;
  description: string;
  badge: BadgeVariant;
};

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeCurrency(currency?: string) {
  const normalizedCurrency = currency?.trim().toUpperCase();

  return normalizedCurrency && /^[A-Z]{3}$/.test(normalizedCurrency)
    ? normalizedCurrency
    : "USD";
}

function formatMoney(
  value: number | null | undefined,
  currency: string,
) {
  if (!isFiniteNumber(value)) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(
  value: number | null | undefined,
  maximumFractionDigits = 2,
) {
  if (!isFiniteNumber(value)) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}

function getSignalVariant(signal?: string): BadgeVariant {
  const normalizedSignal = signal?.trim().toLowerCase() || "";

  if (
    normalizedSignal.includes("bullish") ||
    normalizedSignal.includes("above") ||
    normalizedSignal.includes("accumulation") ||
    normalizedSignal.includes("strong trend")
  ) {
    return "success";
  }

  if (
    normalizedSignal.includes("bearish") ||
    normalizedSignal.includes("below") ||
    normalizedSignal.includes("distribution")
  ) {
    return "danger";
  }

  if (
    normalizedSignal.includes("overbought") ||
    normalizedSignal.includes("oversold") ||
    normalizedSignal.includes("near upper") ||
    normalizedSignal.includes("near lower") ||
    normalizedSignal.includes("high")
  ) {
    return "warning";
  }

  if (
    normalizedSignal.includes("normal") ||
    normalizedSignal.includes("neutral") ||
    normalizedSignal.includes("no pattern") ||
    normalizedSignal.includes("no volume spike")
  ) {
    return "neutral";
  }

  return normalizedSignal ? "info" : "neutral";
}

function getStatus(signal?: string) {
  return signal?.trim() || "Unavailable";
}

export default function TechnicalEvidence({
  indicators,
  agreement,
  currency,
  isLoading = false,
}: TechnicalEvidenceProps) {
  const displayCurrency = normalizeCurrency(currency);
  const rsi = indicators?.rsi;
  const ema = indicators?.ema;
  const sma = indicators?.sma;
  const macd = indicators?.macd;
  const bollinger = indicators?.bollinger;
  const adx = indicators?.adx;
  const obv = indicators?.obv;
  const rvol = indicators?.rvol;
  const volumeSpike = indicators?.volumeSpike;
  const candlestick = indicators?.candlestick;
  /*
    The backend already stubs `agreement` to { withheld: true, error }
    when Shariah compliance is not confirmed - direction, confidence,
    and the signal counts arrive undefined. This only decides what
    replaces them in the UI; per-indicator readings below are raw
    technical facts, not the compiled verdict, so they stay visible.
  */
  const verdictWithheld = agreement?.withheld === true;
  const direction =
    agreement?.direction?.trim() ||
    agreement?.agreement?.trim() ||
    "current";
  const evidence: EvidenceItem[] = [
    {
      label: "RSI",
      value: formatNumber(rsi?.rsi),
      status: getStatus(rsi?.signal),
      description: isFiniteNumber(rsi?.rsi)
        ? `The relative-strength reading is ${formatNumber(rsi.rsi)}. ${rsi?.signal ? `The engine classifies this as ${rsi.signal.toLowerCase()}.` : ""}`
        : "RSI evidence is currently unavailable.",
      badge: getSignalVariant(rsi?.signal),
    },
    {
      label: "EMA 20",
      value: formatMoney(ema?.ema20, displayCurrency),
      status: getStatus(ema?.signal),
      description:
        isFiniteNumber(ema?.ema20) && isFiniteNumber(ema?.currentPrice)
          ? `The current price of ${formatMoney(ema.currentPrice, displayCurrency)} is being compared with the 20-period exponential average.`
          : "Short-term moving-average evidence is currently unavailable.",
      badge: getSignalVariant(ema?.signal),
    },
    {
      label: "SMA 50",
      value: formatMoney(sma?.sma50, displayCurrency),
      status: getStatus(sma?.signal),
      description:
        isFiniteNumber(sma?.sma50) && isFiniteNumber(sma?.currentPrice)
          ? `The current price of ${formatMoney(sma.currentPrice, displayCurrency)} is being compared with the 50-period simple average.`
          : "Broader moving-average evidence is currently unavailable.",
      badge: getSignalVariant(sma?.signal),
    },
    {
      label: "MACD",
      value: formatNumber(macd?.macd, 4),
      status: getStatus(macd?.signal),
      description:
        isFiniteNumber(macd?.signalLine) && isFiniteNumber(macd?.histogram)
          ? `Signal line ${formatNumber(macd.signalLine, 4)} · Histogram ${formatNumber(macd.histogram, 4)}.`
          : "MACD momentum evidence is currently unavailable.",
      badge: getSignalVariant(macd?.signal),
    },
    {
      label: "Bollinger Bands",
      value: formatMoney(bollinger?.middleBand, displayCurrency),
      status: getStatus(bollinger?.signal),
      description:
        isFiniteNumber(bollinger?.lowerBand) &&
        isFiniteNumber(bollinger?.upperBand)
          ? `Lower ${formatMoney(bollinger.lowerBand, displayCurrency)} · Middle ${formatMoney(bollinger?.middleBand, displayCurrency)} · Upper ${formatMoney(bollinger.upperBand, displayCurrency)}.`
          : "Bollinger Band evidence is currently unavailable.",
      badge: getSignalVariant(bollinger?.signal),
    },
    {
      label: "ADX",
      value: formatNumber(adx?.adx),
      status: getStatus(adx?.signal),
      description:
        isFiniteNumber(adx?.plusDI) && isFiniteNumber(adx?.minusDI)
          ? `+DI ${formatNumber(adx.plusDI)} · −DI ${formatNumber(adx.minusDI)}. ADX measures trend strength, not direction by itself.`
          : "Trend-strength evidence is currently unavailable.",
      badge: getSignalVariant(adx?.signal),
    },
    {
      label: "On-Balance Volume",
      value: formatNumber(obv?.obv, 0),
      status: getStatus(obv?.signal),
      description:
        obv?.explanation?.trim() ||
        "On-balance-volume evidence is currently unavailable.",
      badge: getSignalVariant(obv?.signal),
    },
    {
      label: "Relative Volume",
      value: isFiniteNumber(rvol?.rvol)
        ? `${formatNumber(rvol.rvol)}×`
        : "—",
      status: getStatus(rvol?.signal),
      description:
        rvol?.explanation?.trim() ||
        volumeSpike?.explanation?.trim() ||
        "Relative-volume evidence is currently unavailable.",
      badge: getSignalVariant(
        rvol?.signal || volumeSpike?.signal,
      ),
    },
    {
      label: "Candlestick",
      value: candlestick?.pattern?.trim() || "—",
      status: getStatus(candlestick?.bias),
      description:
        candlestick?.lastCandle &&
        isFiniteNumber(candlestick.lastCandle.open) &&
        isFiniteNumber(candlestick.lastCandle.high) &&
        isFiniteNumber(candlestick.lastCandle.low) &&
        isFiniteNumber(candlestick.lastCandle.close)
          ? `Latest candle: O ${formatMoney(candlestick.lastCandle.open, displayCurrency)} · H ${formatMoney(candlestick.lastCandle.high, displayCurrency)} · L ${formatMoney(candlestick.lastCandle.low, displayCurrency)} · C ${formatMoney(candlestick.lastCandle.close, displayCurrency)}.`
          : "Candlestick-pattern evidence is currently unavailable.",
      badge: getSignalVariant(candlestick?.bias),
    },
  ];
  const signalCounts = [
    {
      label: "Bullish",
      value: agreement?.bullishSignals,
      className: "border-positive/20 bg-positive/15 text-positive",
    },
    {
      label: "Bearish",
      value: agreement?.bearishSignals,
      className: "border-critical/20 bg-critical/15 text-critical",
    },
    {
      label: "Neutral",
      value: agreement?.neutralSignals,
      className: "border-ink-soft/20 bg-ink-soft/15 text-ink-soft",
    },
  ];
  const source =
    rsi?.provider ||
    ema?.provider ||
    sma?.provider ||
    macd?.provider ||
    "AzaLens";
  const dataSource =
    rsi?.dataSource ||
    ema?.dataSource ||
    sma?.dataSource ||
    macd?.dataSource;

  return (
    <Card variant="glass" padding="lg" className="az-workspace-card">
      <div>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="az-eyebrow text-intelligence">
              Technical Evidence
            </p>

            <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight text-ink">
              {isLoading
                ? "Reading the latest technical evidence"
                : verdictWithheld
                  ? "Technical evidence, without a compiled verdict"
                  : `Evidence behind the ${direction.toLowerCase()} case`}
            </h2>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-soft">
              Live trend, momentum, volatility and participation evidence,
              interpreted indicator by indicator.
            </p>
          </div>

          {!verdictWithheld && (
            <Badge
              variant={
                isLoading
                  ? "neutral"
                  : getSignalVariant(agreement?.direction)
              }
            >
              {isLoading
                ? "Analyzing indicators"
                : isFiniteNumber(agreement?.confidence)
                  ? `${Math.round(agreement.confidence)}% evidence agreement`
                  : "Agreement unavailable"}
            </Badge>
          )}
        </div>

        {!isLoading && verdictWithheld ? (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-caution/20 bg-caution/10 p-5">
            <ShieldAlert
              size={18}
              className="mt-0.5 shrink-0 text-caution"
            />
            <p className="text-sm leading-6 text-ink-soft">
              {agreement?.error ||
                "AzaLens withholds the compiled directional lean and Evidence Agreement for this stock because AAOIFI Shariah compliance has not been confirmed. Individual indicator readings below are unaffected."}
            </p>
          </div>
        ) : (
          <>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {signalCounts.map((signal) => (
                <div
                  key={signal.label}
                  className={`az-subcard rounded-2xl border p-4 ${signal.className}`}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.16em]">
                    {signal.label}
                  </p>
                  <p className="az-numeric mt-2 text-2xl font-bold text-ink">
                    {isLoading || !isFiniteNumber(signal.value)
                      ? "—"
                      : signal.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="az-subcard mt-4 rounded-2xl border border-intelligence/20 bg-intelligence/5 p-5">
              <p className="text-sm font-medium text-intelligence">
                Evidence Agreement
              </p>
              <p className="mt-2 text-sm leading-6 text-ink-soft">
                {isLoading
                  ? "AzaLens is comparing the latest indicator signals."
                  : agreement?.agreementSummary ||
                    "The backend did not return an indicator-agreement summary for this analysis."}
              </p>
            </div>
          </>
        )}

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {evidence.map((item) => (
            <div
              key={item.label}
              className="az-subcard rounded-2xl border border-stroke bg-surface-soft p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-ink-soft">
                    {item.label}
                  </p>
                  <p className="az-numeric mt-3 text-xl font-semibold text-ink">
                    {isLoading ? "—" : item.value}
                  </p>
                </div>

                <Badge variant={isLoading ? "neutral" : item.badge}>
                  {isLoading ? "Loading" : item.status}
                </Badge>
              </div>

              <p className="mt-4 text-sm leading-6 text-ink-soft">
                {isLoading
                  ? "Calculating from the latest completed market history."
                  : item.description}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs leading-5 text-ink-muted">
          Source: {source}
          {dataSource ? ` · ${dataSource}` : ""}. Indicator readings are
          educational market evidence, not standalone trade instructions.
        </p>
      </div>
    </Card>
  );
}
