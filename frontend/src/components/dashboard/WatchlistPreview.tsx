import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card } from "../ui";
import { getWatchlist } from "../../services/watchlist";

const DASHBOARD_STALE_TIME_MS = 60 * 1000;
const PREVIEW_LIMIT = 6;

export default function WatchlistPreview() {
  const watchlistQuery = useQuery({
    queryKey: ["watchlist"],
    queryFn: getWatchlist,
    staleTime: DASHBOARD_STALE_TIME_MS,
  });
  const items = watchlistQuery.data ?? [];

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
            Saved listed-company shares. Opening a stock starts its analysis;
            the dashboard does not spend screening tokens automatically.
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
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
            <p className="text-sm leading-6 text-slate-300">
              Your watchlist is empty.
            </p>

            <Link
              to="/watchlist"
              className="mt-3 inline-block text-sm font-semibold text-emerald-400 hover:text-emerald-300"
            >
              Add your first stock →
            </Link>
          </div>
        ) : (
          items.slice(0, PREVIEW_LIMIT).map((item) => (
            <Link
              key={item.symbol}
              to={`/analysis/${encodeURIComponent(item.symbol)}`}
              className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition hover:border-emerald-400/20 hover:bg-white/[0.04]"
            >
              <div>
                <p className="font-semibold text-white">{item.symbol}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Open evidence-based analysis
                </p>
              </div>
              <span className="text-sm font-semibold text-emerald-400">
                Analyze →
              </span>
            </Link>
          ))
        )}
      </div>

      {items.length > 0 ? (
        <Link
          to="/watchlist"
          className="mt-6 inline-block text-sm font-semibold text-emerald-400 hover:text-emerald-300"
        >
          Manage watchlist →
        </Link>
      ) : null}
    </Card>
  );
}
