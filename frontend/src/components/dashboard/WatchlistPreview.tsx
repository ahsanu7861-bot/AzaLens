import { Link } from "react-router-dom";
import { Badge, Card } from "../ui";
import {
  useWatchlistVerdicts,
  type WatchlistVerdict,
} from "../../hooks/useWatchlistVerdicts";
import {
  buildReasonedVerdict,
  formatChangePercent,
  formatMoney,
} from "./reasonedVerdict";

function VerdictRow({ verdict }: { verdict: WatchlistVerdict }) {
  if (verdict.isLoading) {
    return (
      <div className="h-24 animate-pulse rounded-2xl border border-white/5 bg-white/[0.02]" />
    );
  }

  if (verdict.isError || !verdict.data) {
    return (
      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
        <p className="font-semibold text-white">{verdict.symbol}</p>
        <p className="mt-1 text-sm text-slate-400">
          Live analysis is unavailable for this stock right now. AzaLens
          does not show placeholder values instead.
        </p>
      </div>
    );
  }

  const reasoned = buildReasonedVerdict(verdict.data);
  const change = formatChangePercent(reasoned.changePercent);

  if (reasoned.withheld) {
    return (
      <Link
        to={`/analysis/${verdict.symbol}?workspace=shariah`}
        className="block rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition hover:border-amber-400/20 hover:bg-white/[0.04]"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-white">
              {verdict.symbol}
            </span>

            <Badge variant={reasoned.shariahTone}>
              Shariah: {reasoned.shariahLabel}
            </Badge>
          </div>

          <div className="text-right">
            <p className="font-semibold text-white">
              {formatMoney(reasoned.price, reasoned.currency)}
            </p>

            {change ? (
              <p
                className={`text-sm ${
                  change.startsWith("+")
                    ? "text-emerald-400"
                    : "text-rose-400"
                }`}
              >
                {change}
              </p>
            ) : null}
          </div>
        </div>

        <p className="mt-3 text-sm leading-6 text-slate-400">
          {reasoned.withheldMessage}
        </p>

        <p className="mt-2 text-xs font-semibold text-amber-400">
          View Shariah screening →
        </p>
      </Link>
    );
  }

  return (
    <Link
      to={`/analysis/${verdict.symbol}`}
      className="block rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition hover:border-emerald-400/20 hover:bg-white/[0.04]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-white">{verdict.symbol}</span>

          <Badge
            variant={
              reasoned.tone === "bullish"
                ? "success"
                : reasoned.tone === "bearish"
                  ? "danger"
                  : "neutral"
            }
          >
            {reasoned.lean}
            {reasoned.confidence !== null
              ? ` · ${reasoned.confidence}%`
              : ""}
          </Badge>
        </div>

        <div className="text-right">
          <p className="font-semibold text-white">
            {formatMoney(reasoned.price, reasoned.currency)}
          </p>

          {change ? (
            <p
              className={`text-sm ${
                change.startsWith("+")
                  ? "text-emerald-400"
                  : "text-rose-400"
              }`}
            >
              {change}
            </p>
          ) : reasoned.priceSource ? (
            <p className="text-xs text-slate-500">{reasoned.priceSource}</p>
          ) : null}
        </div>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-400">
        {reasoned.why ??
          "The evidence summary was not returned for this analysis."}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span>
          {reasoned.invalidation ?? "No clear invalidation level available"}
        </span>

        <Badge variant={reasoned.shariahTone}>
          Shariah: {reasoned.shariahLabel}
        </Badge>
      </div>
    </Link>
  );
}

export default function WatchlistPreview() {
  const { watchlistQuery, verdicts } = useWatchlistVerdicts();

  return (
    <Card variant="glass" padding="lg">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-400">
            Watchlist
          </p>

          <h2 className="mt-3 text-2xl font-bold text-white">
            Your Favorite Stocks
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            Reasoned verdicts from live evidence — never buy/sell calls.
          </p>
        </div>

        {watchlistQuery.data ? (
          <Badge variant="info">
            {watchlistQuery.data.length}{" "}
            {watchlistQuery.data.length === 1 ? "Stock" : "Stocks"}
          </Badge>
        ) : null}
      </div>

      <div className="mt-8 space-y-3">
        {watchlistQuery.isLoading ? (
          Array.from({ length: 2 }, (_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-2xl border border-white/5 bg-white/[0.02]"
            />
          ))
        ) : watchlistQuery.isError ? (
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
            <p className="text-sm leading-6 text-slate-300">
              Your watchlist could not be loaded right now. AzaLens does
              not display placeholder data instead.
            </p>
          </div>
        ) : verdicts.length === 0 ? (
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
            <p className="text-sm leading-6 text-slate-300">
              Your watchlist is empty.
            </p>

            <Link
              to="/analysis/AAPL"
              className="mt-3 inline-block text-sm font-semibold text-emerald-400 hover:text-emerald-300"
            >
              Open a live analysis →
            </Link>
          </div>
        ) : (
          verdicts.map((verdict) => (
            <VerdictRow key={verdict.symbol} verdict={verdict} />
          ))
        )}
      </div>
    </Card>
  );
}
