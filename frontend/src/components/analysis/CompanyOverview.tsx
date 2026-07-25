import { Badge, Card } from "../ui";
import type { AnalysisData } from "../../types/analysis";

type CompanyOverviewProps = {
  symbol: string;
  market?: AnalysisData["market"];
  priceContext?: AnalysisData["priceContext"];
  isLoading?: boolean;
};

function normalizeCurrency(currency?: string) {
  const normalizedCurrency = currency?.trim().toUpperCase();

  return normalizedCurrency && /^[A-Z]{3}$/.test(normalizedCurrency)
    ? normalizedCurrency
    : "USD";
}

function formatMoney(
  value: number | null | undefined,
  currency: string,
  signDisplay: "auto" | "always" = "auto",
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay,
  }).format(value);
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export default function CompanyOverview({
  symbol,
  market,
  priceContext,
  isLoading = false,
}: CompanyOverviewProps) {
  const marketData = market?.data;
  const currency = normalizeCurrency(marketData?.currency);
  const price = priceContext?.analysisPrice ?? marketData?.price;
  const dailyChange = marketData?.change;
  const changePercent = marketData?.changePercent;
  const companyName = marketData?.company?.trim() || symbol;
  const exchangeLabel = [marketData?.exchange, marketData?.symbol || symbol]
    .filter(Boolean)
    .join(" · ");
  const priceAvailable =
    typeof price === "number" && Number.isFinite(price);
  const changeTone =
    typeof dailyChange !== "number" || dailyChange === 0
      ? "text-ink-soft"
      : dailyChange > 0
        ? "text-positive"
        : "text-critical";
  const sourceLabel =
    priceContext?.analysisPriceSource ||
    (market?.provider ? `${market.provider} quote` : "Market data unavailable");
  const statistics = [
    {
      label: "Previous Close",
      value: formatMoney(marketData?.previousClose, currency),
    },
    {
      label: "Open",
      value: formatMoney(marketData?.open, currency),
    },
    {
      label: "Day Range",
      value:
        typeof marketData?.low === "number" &&
        typeof marketData?.high === "number"
          ? `${formatMoney(marketData.low, currency)} — ${formatMoney(
              marketData.high,
              currency,
            )}`
          : "—",
    },
    {
      label: "Currency",
      value: marketData?.currency?.toUpperCase() || "—",
    },
    {
      label: "Provider",
      value: market?.provider || "—",
    },
  ];

  return (
    <Card variant="glass" padding="lg" className="az-workspace-card">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                {isLoading ? "Loading company…" : companyName}
              </h1>

              <Badge
                variant={priceAvailable ? "success" : "neutral"}
                dot={priceAvailable}
              >
                {isLoading ? "Loading live quote" : sourceLabel}
              </Badge>
            </div>

            <p className="mt-2 text-sm font-medium tracking-wide text-ink-muted">
              {isLoading ? `Fetching ${symbol}` : exchangeLabel}
            </p>
          </div>

          <div className="lg:text-right">
            <p className="az-eyebrow">
              Current price
            </p>

            <div className="mt-2 flex flex-wrap items-baseline gap-3 lg:justify-end">
              <p className="az-numeric font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
                {isLoading ? "—" : formatMoney(price, currency)}
              </p>

              <div
                className={`flex items-center gap-2 text-sm font-semibold ${changeTone}`}
              >
                <span>
                  {isLoading
                    ? "—"
                    : formatMoney(dailyChange, currency, "always")}
                </span>
                <span>{isLoading ? "—" : formatPercent(changePercent)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="h-px bg-stroke" />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {statistics.map((stat) => (
            <div
              key={stat.label}
              className="az-subcard rounded-2xl border border-stroke bg-surface-soft p-5"
            >
              <p className="az-eyebrow">
                {stat.label}
              </p>

              <p className="az-numeric mt-3 text-lg font-semibold text-ink">
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
