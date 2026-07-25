import {
  BarChart4,
  BookOpenCheck,
  CalendarRange,
  FileSearch,
} from "lucide-react";

import type { AnalysisData } from "../../types/analysis";
import CompanyOverview from "./CompanyOverview";

type FundamentalsWorkspaceProps = {
  symbol: string;
  data?: AnalysisData;
  isLoading?: boolean;
};

const coverage = [
  {
    title: "Financial statements",
    description: "Income statement, balance sheet and cash-flow history.",
    icon: BookOpenCheck,
  },
  {
    title: "Valuation & peers",
    description: "Comparable multiples with sector and market context.",
    icon: BarChart4,
  },
  {
    title: "Earnings & estimates",
    description: "Reported results, expectations and revision history.",
    icon: CalendarRange,
  },
  {
    title: "Filings & ownership",
    description: "Source-linked filings, holders and material company events.",
    icon: FileSearch,
  },
];

export default function FundamentalsWorkspace({
  symbol,
  data,
  isLoading = false,
}: FundamentalsWorkspaceProps) {
  return (
    <div className="space-y-5">
      <CompanyOverview
        symbol={symbol}
        market={data?.market}
        priceContext={data?.priceContext}
        isLoading={isLoading}
      />

      <section className="az-card az-workspace-card p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="az-eyebrow">Research coverage</p>
            <h2 className="mt-2 font-display text-xl font-semibold text-ink">
              Fundamental workspace foundation
            </h2>
          </div>
          <span className="w-fit rounded-full border border-caution/20 bg-caution/10 px-3 py-1 text-xs font-semibold text-caution">
            Data pipeline pending
          </span>
        </div>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-soft">
          The workspace is ready for verified company fundamentals. AzaLens
          will not display illustrative financial figures as if they were live
          company data.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {coverage.map(({ title, description, icon: Icon }) => (
            <div
              key={title}
              className="az-subcard rounded-2xl border border-stroke bg-surface-soft p-4"
            >
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-intelligence/10 text-intelligence">
                <Icon size={18} strokeWidth={1.8} />
              </span>
              <h3 className="mt-4 text-sm font-semibold text-ink">{title}</h3>
              <p className="mt-1.5 text-xs leading-5 text-ink-muted">
                {description}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
