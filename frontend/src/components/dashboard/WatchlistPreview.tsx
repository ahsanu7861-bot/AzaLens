import { Link } from "react-router-dom";
import { Card } from "../ui";

export default function WatchlistPreview() {
  return (
    <Card variant="glass" padding="lg">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-400">
          Watchlist
        </p>

        <h2 className="mt-3 text-2xl font-bold text-white">
          Your Favorite Stocks
        </h2>

        <p className="mt-2 text-sm text-slate-400">
          Quick overview of your monitored companies.
        </p>
      </div>

      <div className="mt-8 rounded-2xl border border-white/5 bg-white/[0.02] p-5">
        <p className="text-sm leading-6 text-slate-300">
          Your watchlist is not connected to live data yet. AzaLens
          does not display placeholder prices or verdicts as if they
          were real.
        </p>

        <p className="mt-3 text-sm leading-6 text-slate-400">
          Open any stock&apos;s analysis page for live, evidence-backed
          data in the meantime.
        </p>
      </div>

      <Link
        to="/analysis/AAPL"
        className="mt-6 inline-block text-sm font-semibold text-emerald-400 hover:text-emerald-300"
      >
        Open a live analysis →
      </Link>
    </Card>
  );
}
