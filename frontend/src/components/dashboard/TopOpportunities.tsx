import { Link } from "react-router-dom";
import { useWatchlistVerdicts } from "../../hooks/useWatchlistVerdicts";
import {
  buildReasonedVerdict,
  formatChangePercent,
  formatMoney,
  type ReasonedVerdict,
} from "./reasonedVerdict";

const MAX_ENTRIES = 3;

interface RankedEntry {
  symbol: string;
  reasoned: ReasonedVerdict;
}

export default function TopOpportunities() {
  const { watchlistQuery, verdicts } = useWatchlistVerdicts();

  const isLoading =
    watchlistQuery.isLoading ||
    verdicts.some((verdict) => verdict.isLoading);

  const ranked: RankedEntry[] = verdicts
    .filter((verdict) => !verdict.isLoading && !verdict.isError && verdict.data)
    .map((verdict) => ({
      symbol: verdict.symbol,
      reasoned: buildReasonedVerdict(verdict.data!),
    }))
    .sort(
      (first, second) =>
        (second.reasoned.confidence ?? -1) -
        (first.reasoned.confidence ?? -1),
    )
    .slice(0, MAX_ENTRIES);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 backdrop-blur-sm">
      <h3 className="text-sm font-semibold tracking-wide text-slate-300 uppercase">
        Strongest Evidence in Your Watchlist
      </h3>

      <p className="mt-1 mb-4 text-xs text-slate-500">
        Ranked by indicator agreement across your watchlist — reasoned
        verdicts, not buy/sell calls. AzaLens does not scan the whole
        market yet.
      </p>

      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 2 }, (_, index) => (
            <div
              key={index}
              className="h-20 animate-pulse rounded-lg border border-slate-800/60 bg-slate-950/40"
            />
          ))
        ) : ranked.length === 0 ? (
          <div className="rounded-lg border border-slate-800/60 bg-slate-950/40 p-4">
            <p className="text-sm leading-6 text-slate-300">
              No live analysis is available for your watchlist right now.
              AzaLens shows nothing here rather than invented entries.
            </p>

            <Link
              to="/analysis/AAPL"
              className="mt-3 inline-block text-sm font-semibold text-emerald-400 hover:text-emerald-300"
            >
              Open a live analysis instead →
            </Link>
          </div>
        ) : (
          ranked.map(({ symbol, reasoned }) => {
            const change = formatChangePercent(reasoned.changePercent);

            return (
              <Link
                key={symbol}
                to={`/analysis/${symbol}`}
                className="block rounded-lg border border-slate-800/60 bg-slate-950/40 p-3 transition-colors hover:border-slate-700"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{symbol}</span>

                      <span
                        className={`text-xs font-medium ${
                          reasoned.tone === "bullish"
                            ? "text-emerald-400"
                            : reasoned.tone === "bearish"
                              ? "text-rose-400"
                              : "text-slate-400"
                        }`}
                      >
                        {reasoned.lean}
                        {reasoned.confidence !== null
                          ? ` · ${reasoned.confidence}%`
                          : ""}
                      </span>
                    </div>

                    <div className="mt-1 text-xs text-slate-500">
                      Shariah: {reasoned.shariahLabel}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-mono text-sm font-semibold text-slate-100">
                      {formatMoney(reasoned.price, reasoned.currency)}
                    </div>

                    {change ? (
                      <div
                        className={`text-xs font-medium ${
                          change.startsWith("+")
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        {change}
                      </div>
                    ) : reasoned.priceSource ? (
                      <div className="text-xs text-slate-500">
                        {reasoned.priceSource}
                      </div>
                    ) : null}
                  </div>
                </div>

                <p className="mt-2 text-xs leading-5 text-slate-400">
                  {reasoned.why ??
                    "The evidence summary was not returned for this analysis."}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  {reasoned.invalidation ??
                    "No clear invalidation level available"}
                </p>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
