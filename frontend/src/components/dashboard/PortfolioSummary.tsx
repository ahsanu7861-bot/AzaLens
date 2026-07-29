import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Badge, Card } from "../ui";
import { getPortfolio } from "../../services/portfolio";

export default function PortfolioSummary() {
  const portfolioQuery = useQuery({
    queryKey: ["portfolio"],
    queryFn: getPortfolio,
    staleTime: 60 * 1000,
  });
  const holdings = portfolioQuery.data ?? [];
  const totalShares = holdings.reduce((sum, holding) => sum + holding.shares, 0);
  const costBasis = holdings.reduce(
    (sum, holding) => sum + holding.shares * holding.averagePrice,
    0,
  );

  return (
    <Card variant="brand" padding="lg">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-400">
            Portfolio
          </p>

          <h2 className="mt-3 text-2xl font-bold text-white">
            Portfolio Summary
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            Snapshot of your current holdings.
          </p>
        </div>

        <Badge variant="info">Recorded data</Badge>
      </div>

      {portfolioQuery.isLoading ? (
        <div className="mt-8 h-28 animate-pulse rounded-xl border border-white/5 bg-white/[0.02]" />
      ) : portfolioQuery.isError ? (
        <p className="mt-8 rounded-xl border border-white/5 bg-white/[0.02] p-5 text-sm leading-6 text-slate-300">
          Your portfolio could not be loaded. AzaLens does not substitute
          demo holdings or estimated values.
        </p>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-4">
            <Metric title="Holdings" value={holdings.length.toLocaleString()} />
            <Metric title="Total shares" value={totalShares.toLocaleString()} />
            <Metric
              title="Recorded cost basis"
              value={costBasis.toLocaleString(undefined, {
                style: "currency",
                currency: "USD",
                maximumFractionDigits: 2,
              })}
            />
            <Metric title="Live market value" value="Not calculated" />
          </div>

          <p className="mt-6 text-xs leading-5 text-slate-500">
            Cost basis uses your recorded shares and average purchase prices.
            Gains, live value, risk, and Shariah coverage are not shown until
            AzaLens can calculate them from verified current data.
          </p>
        </>
      )}

      <Link
        to="/portfolio"
        className="mt-8 inline-block text-sm font-semibold text-emerald-400 hover:text-emerald-300"
      >
        Open Portfolio →
      </Link>
    </Card>
  );
}

function Metric({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
      <p className="text-xs uppercase tracking-wider text-slate-500">
        {title}
      </p>

      <p className="mt-2 text-xl font-bold text-white">
        {value}
      </p>
    </div>
  );
}
