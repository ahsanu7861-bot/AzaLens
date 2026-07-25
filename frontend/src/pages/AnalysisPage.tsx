import {
  AlertTriangle,
  BrainCircuit,
  RefreshCw,
} from "lucide-react";
import type { ReactNode } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import StockChart from "../components/StockChart";
import {
  AIVerdict,
  IslamicCompliance,
  RiskAssessment,
  TechnicalEvidence,
} from "../components/analysis";
import FundamentalsWorkspace from "../components/analysis/FundamentalsWorkspace";
import StockHeader from "../components/analysis/StockHeader";
import WorkspaceTabs from "../components/analysis/WorkspaceTabs";
import {
  workspaceIds,
  type WorkspaceId,
} from "../components/analysis/workspaces";
import ImportantLevels from "../components/dashboard/ImportantLevels";
import AIExplanation from "../components/dashboard/AIExplanation";
import { useAnalysis } from "../hooks/useAnalysis";

function isWorkspaceId(value: string | null): value is WorkspaceId {
  return workspaceIds.includes(value as WorkspaceId);
}

export default function AnalysisPage() {
  const { symbol = "AAPL" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const normalizedSymbol = symbol.trim().toUpperCase();
  const { data, isLoading, isError, refetch, isFetching } =
    useAnalysis(normalizedSymbol);
  const requestedWorkspace = searchParams.get("workspace");
  const activeWorkspace = isWorkspaceId(requestedWorkspace)
    ? requestedWorkspace
    : "overview";

  function changeWorkspace(workspace: WorkspaceId) {
    const nextSearchParams = new URLSearchParams(searchParams);

    if (workspace === "overview") {
      nextSearchParams.delete("workspace");
    } else {
      nextSearchParams.set("workspace", workspace);
    }

    setSearchParams(nextSearchParams, { replace: true });
  }

  const workspaceContent = {
    overview: (
      <div className="space-y-5">
        <AIVerdict
          direction={data?.agreement?.direction ?? data?.agreement?.agreement}
          trend={data?.trend?.trend}
          confidence={data?.agreement?.confidence}
          summary={
            data?.agreement?.agreementSummary ??
            data?.explanation?.overallAssessment
          }
          invalidation={data?.thesisInvalidation}
          isLoading={isLoading}
        />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <StockChart symbol={normalizedSymbol} />

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
                  <span className="text-xs text-ink-muted">Technical risk</span>
                  <span className="text-sm font-semibold text-caution">
                    {isLoading
                      ? "—"
                      : data?.risk?.riskLevel || "Review required"}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-ink-muted">ATR volatility</span>
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
    ),
    technical: (
      <TechnicalEvidence
        indicators={data?.indicators}
        agreement={data?.agreement}
        currency={data?.market?.data?.currency}
        isLoading={isLoading}
      />
    ),
    fundamentals: (
      <FundamentalsWorkspace
        symbol={normalizedSymbol}
        data={data}
        isLoading={isLoading}
      />
    ),
    risk: (
      <RiskAssessment
        risk={data?.risk}
        currency={data?.market?.data?.currency}
        isLoading={isLoading}
      />
    ),
    shariah: (
      <IslamicCompliance data={data?.shariah} isLoading={isLoading} />
    ),
    thesis: (
      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]">
        <AIExplanation
          trend={data?.trend?.trend ?? "Unavailable"}
          confidence={data?.agreement?.confidence ?? "—"}
          risk={data?.risk?.riskLevel ?? "Review required"}
          shariah={
            data?.shariah?.summary?.status === "COMPLIANT"
              ? "Compliant"
              : data?.shariah?.summary?.status === "NON_COMPLIANT"
                ? "Non-compliant"
                : "Review required"
          }
          explanation={
            data?.agreement?.agreementSummary ??
            data?.explanation?.overallAssessment ??
            "AzaLens is waiting for enough verified evidence to explain this thesis."
          }
        />

        <section className="az-card p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-intelligence/10 text-intelligence">
              <BrainCircuit size={19} strokeWidth={1.8} />
            </span>
            <div>
              <p className="az-eyebrow text-intelligence">Evidence narrative</p>
              <h2 className="mt-2 font-display text-xl font-semibold text-ink">
                What supports or challenges the thesis
              </h2>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {isLoading ? (
              Array.from({ length: 4 }, (_, index) => (
                <div
                  key={index}
                  className="h-16 animate-pulse rounded-2xl border border-stroke bg-surface-soft"
                />
              ))
            ) : (data?.agreement?.agreementDetails?.length ?? 0) > 0 ? (
              data?.agreement?.agreementDetails?.map((detail, index) => (
                <div
                  key={`${detail}-${index}`}
                  className="flex gap-3 rounded-2xl border border-stroke bg-surface-soft p-4"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-intelligence/10 text-xs font-bold text-intelligence">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-6 text-ink-soft">{detail}</p>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-caution/20 bg-caution/10 p-4 text-sm leading-6 text-ink-soft">
                Detailed evidence points were not returned for this analysis.
                AzaLens does not invent supporting reasons when the source data
                is incomplete.
              </div>
            )}
          </div>

          <p className="mt-5 text-xs leading-5 text-ink-muted">
            The thesis explains current evidence and invalidation—not a
            guaranteed outcome or personalized instruction.
          </p>
        </section>
      </div>
    ),
  } satisfies Record<WorkspaceId, ReactNode>;

  return (
    <div className="min-h-[calc(100dvh-68px)] bg-canvas text-ink">
      <div className="sticky top-[68px] z-30">
        <StockHeader
          symbol={normalizedSymbol}
          data={data}
          isLoading={isLoading}
        />

        <div className="border-b border-stroke bg-surface/92 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1680px]">
            <WorkspaceTabs
              activeWorkspace={activeWorkspace}
              onChange={changeWorkspace}
            />
          </div>
        </div>
      </div>

      <main className="app-atmosphere min-h-[620px] px-3.5 py-4 pb-20 sm:px-6 sm:py-6 sm:pb-20 lg:px-8 lg:pb-6">
        <div className="relative mx-auto max-w-[1680px]">
          {isError && (
            <div
              role="alert"
              className="mb-5 flex flex-col gap-4 rounded-2xl border border-critical/25 bg-critical/10 p-4 text-sm text-critical sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <p>
                  AzaLens could not analyze “{normalizedSymbol}”. Confirm the
                  ticker and make sure the backend is running.
                </p>
              </div>
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isFetching}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-critical/25 px-3 py-2 text-xs font-semibold transition hover:bg-critical/10 disabled:opacity-50"
              >
                <RefreshCw
                  size={14}
                  className={isFetching ? "animate-spin" : ""}
                />
                Try again
              </button>
            </div>
          )}

          <div
            key={activeWorkspace}
            role="tabpanel"
            className="az-workspace-enter"
          >
            {workspaceContent[activeWorkspace]}
          </div>
        </div>
      </main>
    </div>
  );
}
