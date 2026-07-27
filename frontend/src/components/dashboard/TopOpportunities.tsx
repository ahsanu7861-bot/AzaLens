import { Link } from "react-router-dom";

export default function TopOpportunities() {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 backdrop-blur-sm">
      <h3 className="mb-4 text-sm font-semibold tracking-wide text-slate-300 uppercase">
        Top AI Opportunities
      </h3>

      <div className="rounded-lg border border-slate-800/60 bg-slate-950/40 p-4">
        <p className="text-sm leading-6 text-slate-300">
          This panel is not connected to live data yet, so AzaLens
          shows nothing here rather than invented tickers, prices, or
          compliance labels.
        </p>

        <p className="mt-3 text-sm leading-6 text-slate-400">
          When it goes live, each entry will be a reasoned verdict —
          a directional lean, a confidence level, a plain-language
          reason, and what would prove it wrong — never a blind
          buy or sell call.
        </p>

        <Link
          to="/analysis/AAPL"
          className="mt-4 inline-block text-sm font-semibold text-emerald-400 hover:text-emerald-300"
        >
          Open a live analysis instead →
        </Link>
      </div>
    </div>
  );
}
