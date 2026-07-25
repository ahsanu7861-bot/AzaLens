import {
  BadgeCheck,
  BarChart4,
  BookOpenCheck,
  CalendarRange,
  ExternalLink,
  FileSearch,
  Landmark,
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

function formatDate(value?: string | null) {
  if (!value) {
    return "Unavailable";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export default function FundamentalsWorkspace({
  symbol,
  data,
  isLoading = false,
}: FundamentalsWorkspaceProps) {
  const fundamentals = data?.fundamentals;
  const profile = fundamentals?.companyProfile;
  const profileAvailable =
    fundamentals?.success === true && profile != null;
  const profileDetails = [
    {
      label: "Industry",
      value: profile?.industry || "Unavailable",
    },
    {
      label: "Exchange",
      value: profile?.exchange || data?.market?.data?.exchange || "Unavailable",
    },
    {
      label: "Country",
      value: profile?.country || "Unavailable",
    },
    {
      label: "IPO date",
      value: formatDate(profile?.ipoDate),
    },
  ];

  return (
    <div className="space-y-5">
      <CompanyOverview
        symbol={symbol}
        market={data?.market}
        priceContext={data?.priceContext}
        isLoading={isLoading}
      />

      <section className="az-card az-workspace-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="az-eyebrow text-intelligence">
              Verified company profile
            </p>
            <h2 className="mt-2 font-display text-xl font-semibold text-ink">
              {profileAvailable
                ? profile?.name || symbol
                : "Company profile unavailable"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              {profileAvailable
                ? `Source: ${fundamentals?.provider || "Finnhub Company Profile"} · Retrieved ${formatDate(fundamentals?.asOf)}`
                : "The profile provider did not return verified company enrichment for this analysis."}
            </p>
          </div>

          <span
            className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
              profileAvailable
                ? "border-positive/20 bg-positive/10 text-positive"
                : "border-caution/20 bg-caution/10 text-caution"
            }`}
          >
            {profileAvailable ? <BadgeCheck size={14} /> : <Landmark size={14} />}
            {profileAvailable ? "Verified profile" : "Unavailable"}
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {profileDetails.map((detail) => (
            <div
              key={detail.label}
              className="az-subcard rounded-2xl border border-stroke bg-surface-soft p-4"
            >
              <p className="az-eyebrow">{detail.label}</p>
              <p className="mt-3 text-sm font-semibold text-ink">
                {isLoading ? "Loading…" : detail.value}
              </p>
            </div>
          ))}
        </div>

        {profileAvailable && profile?.website && (
          <a
            href={profile.website}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-intelligence hover:underline"
          >
            Official company website
            <ExternalLink size={14} />
          </a>
        )}
      </section>

      <section className="az-card az-workspace-card p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="az-eyebrow">Research coverage</p>
            <h2 className="mt-2 font-display text-xl font-semibold text-ink">
              Financial research coverage
            </h2>
          </div>
          <span className="w-fit rounded-full border border-caution/20 bg-caution/10 px-3 py-1 text-xs font-semibold text-caution">
            Financial data unavailable
          </span>
        </div>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-soft">
          Verified company-profile coverage is shown above when available.
          Financial statements, valuation, earnings, filings, and ownership
          remain unavailable until their source-linked pipelines are connected.
          AzaLens does not display illustrative figures as live company data.
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
