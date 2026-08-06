import { lazy, Suspense } from "react";

import type { AnalysisData } from "../../types/analysis";
import GuidanceVerdict from "./GuidanceVerdict";
import VerdictWithheld from "./VerdictWithheld";
import ImportantLevels from "../dashboard/ImportantLevels";

const StockChart = lazy(() => import("../StockChart"));

type OverviewWorkspaceProps = {
  symbol: string;
  data?: AnalysisData;
  isLoading: boolean;
  verdictWithheld: boolean;
  onViewShariah: () => void;
};

function ChartLoader() {
  return (
    <div
      role="status"
      className="az-card grid min-h-[520px] place-items-center p-6 text-center"
    >
      <div>
        <div
          aria-hidden="true"
          className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-brand/25 border-t-brand"
        />
        <p className="mt-4 text-sm font-medium text-ink-muted">
          Preparing the interactive chart…
        </p>
      </div>
    </div>
  );
}

export default function OverviewWorkspace({
  symbol,
  data,
  isLoading,
  verdictWithheld,
  onViewShariah,
}: OverviewWorkspaceProps) {
  return (
    <div className="space-y-5">
      {verdictWithheld ? (
        <VerdictWithheld
          message={data?.complianceGate?.message}
          onViewShariah={onViewShariah}
        />
      ) : (
        <GuidanceVerdict
          guidance={data?.guidance}
          isLoading={isLoading}
        />
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Suspense fallback={<ChartLoader />}>
          <StockChart symbol={symbol} />
        </Suspense>

        <aside className="space-y-5">
          <ImportantLevels
            support={data?.confluence?.nearestSupport}
            actionableConfluence={data?.confluence?.actionableZone}
            strongestConfluence={data?.confluence?.strongestZone}
            actionableDistancePercent={
              data?.confluence?.methodology?.actionableDistancePercent ?? 5
            }
          />

          <section className="az-card az-secondary-card p-5">
            <p className="az-eyebrow">Risk context</p>
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between gap-4 border-b border-stroke pb-4">
                <span className="text-xs text-ink-muted">
                  Technical risk
                </span>
                <span className="text-sm font-semibold text-caution">
                  {isLoading
                    ? "—"
                    : data?.risk?.riskLevel || "Review required"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-ink-muted">
                  ATR volatility
                </span>
                <span className="text-sm font-semibold text-ink">
                  {isLoading
                    ? "—"
                    : typeof data?.risk?.atrPercent === "number"
                      ? `${data.risk.atrPercent.toFixed(2)}%`
                      : "Unavailable"}
                </span>
              </div>
            </div>

            <p className="mt-5 text-xs leading-5 text-ink-muted">
              {isLoading
                ? "Loading risk context…"
                : data?.risk?.riskSummary ||
                  "Risk context is unavailable for this analysis."}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
