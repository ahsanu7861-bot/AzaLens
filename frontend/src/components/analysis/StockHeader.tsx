import {
  Clock3,
  LoaderCircle,
  Search,
  ShieldCheck,
  Star,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import type { AnalysisData, ShariahStatus } from "../../types/analysis";
import { useCommandStore } from "../../store/commandStore";

type StockHeaderProps = {
  symbol: string;
  data?: AnalysisData;
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
  }).format(value);
}

function formatFreshness(timestamp?: number) {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return "Freshness unavailable";
  }

  const date = new Date(
    timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp,
  );

  if (Number.isNaN(date.getTime())) {
    return "Freshness unavailable";
  }

  return `Updated ${new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date)}`;
}

function formatShariahStatus(status?: ShariahStatus) {
  if (status === "COMPLIANT") {
    return "AAOIFI compliant";
  }

  if (status === "NON_COMPLIANT") {
    return "AAOIFI non-compliant";
  }

  return "AAOIFI review required";
}

export default function StockHeader({
  symbol,
  data,
  isLoading = false,
}: StockHeaderProps) {
  const navigate = useNavigate();
  const setCommandOpen = useCommandStore((state) => state.setOpen);
  const [query, setQuery] = useState(symbol);
  const marketData = data?.market?.data;
  const currency = normalizeCurrency(marketData?.currency);
  const price = data?.priceContext?.analysisPrice ?? marketData?.price;
  const change = marketData?.change;
  const changePercent = marketData?.changePercent;
  const positive = typeof change === "number" ? change >= 0 : true;
  const ChangeIcon = positive ? TrendingUp : TrendingDown;
  const company = marketData?.company?.trim() || symbol;
  const exchange = marketData?.exchange?.trim() || "Exchange unavailable";
  const shariahStatus = data?.shariah?.summary?.status;

  useEffect(() => {
    setQuery(symbol);
  }, [symbol]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedQuery = query.trim().toUpperCase();

    if (normalizedQuery) {
      navigate(`/analysis/${encodeURIComponent(normalizedQuery)}`);
    }
  }

  return (
    <section className="border-b border-stroke bg-canvas/92 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-brand/20 bg-brand/10 font-display text-sm font-bold text-brand">
            {symbol.slice(0, 2)}
          </div>

          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate font-display text-lg font-semibold tracking-tight text-ink sm:text-xl">
                {isLoading ? `Loading ${symbol}` : company}
              </h1>
              <span className="rounded-md border border-stroke bg-surface-soft px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-ink-muted">
                {symbol}
              </span>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
              <span>{exchange}</span>
              <span aria-hidden="true">·</span>
              <span>{currency}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5">
                <Clock3 size={12} />
                {formatFreshness(marketData?.timestamp)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="mr-auto sm:mr-1 sm:text-right lg:mr-3">
            <div className="az-numeric text-2xl font-semibold tracking-tight text-ink">
              {isLoading ? "—" : formatMoney(price, currency)}
            </div>

            <div
              className={[
                "az-numeric mt-0.5 flex items-center gap-1 text-xs font-semibold sm:justify-end",
                positive ? "text-positive" : "text-critical",
              ].join(" ")}
            >
              <ChangeIcon size={13} strokeWidth={2} />
              {typeof change === "number" && typeof changePercent === "number"
                ? `${positive ? "+" : ""}${change.toFixed(2)} (${positive ? "+" : ""}${changePercent.toFixed(2)}%)`
                : "Change unavailable"}
            </div>
          </div>

          <span
            className={[
              "hidden items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold sm:inline-flex",
              shariahStatus === "COMPLIANT"
                ? "border-positive/20 bg-positive/10 text-positive"
                : shariahStatus === "NON_COMPLIANT"
                  ? "border-critical/20 bg-critical/10 text-critical"
                  : "border-caution/20 bg-caution/10 text-caution",
            ].join(" ")}
          >
            <ShieldCheck size={15} />
            {formatShariahStatus(shariahStatus)}
          </span>

          <button
            type="button"
            aria-label={`Add ${symbol} to watchlist`}
            className="az-icon-button"
          >
            <Star size={18} strokeWidth={1.8} />
          </button>

          <button
            type="button"
            aria-label="Search stocks"
            onClick={() => setCommandOpen(true)}
            className="az-icon-button sm:hidden"
          >
            <Search size={18} strokeWidth={1.8} />
          </button>

          <form
            onSubmit={handleSubmit}
            className="hidden h-10 w-48 items-center rounded-xl border border-stroke bg-surface px-3 shadow-sm transition focus-within:border-brand/45 focus-within:ring-4 focus-within:ring-brand/10 xl:flex"
          >
            {isLoading ? (
              <LoaderCircle
                size={15}
                className="shrink-0 animate-spin text-brand"
              />
            ) : (
              <Search size={15} className="shrink-0 text-ink-muted" />
            )}
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Analyze another stock"
              className="min-w-0 flex-1 bg-transparent px-2 text-xs font-semibold uppercase text-ink outline-none placeholder:text-ink-muted"
              placeholder="Ticker"
            />
            <kbd className="text-[10px] font-medium text-ink-muted">↵</kbd>
          </form>
        </div>
      </div>
    </section>
  );
}
