import { Link } from "react-router-dom";
import { Card } from "../ui";

function greetingForCurrentHour() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function GreetingHero() {
  return (
    <Card variant="brand" padding="lg">
      <div className="flex flex-col justify-between gap-8 xl:flex-row xl:items-end">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-400">
            AzaLens Intelligence
          </p>

          <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
            {greetingForCurrentHour()}
            <span className="ml-2" aria-hidden="true">
              👋
            </span>
          </h1>

          <p className="mt-4 text-base leading-7 text-slate-300 sm:text-lg">
            Your equities workspace is ready. Open a stock when you want
            AzaLens to run a fresh, evidence-based analysis.
          </p>

          <p className="mt-6 max-w-2xl text-sm leading-6 text-slate-400">
            Dashboard summaries come only from your saved Watchlist and
            Portfolio. AzaLens does not display invented market breadth,
            sentiment, gains, or compliance figures.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            to="/watchlist"
            className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
          >
            Open Watchlist
          </Link>

          <Link
            to="/analysis/AAPL"
            className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
          >
            Analyze a Stock
          </Link>
        </div>
      </div>
    </Card>
  );
}
