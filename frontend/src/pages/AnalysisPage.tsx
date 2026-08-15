import {
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import {
  lazy,
  Suspense,
  type ReactNode,
} from "react";
import { useParams, useSearchParams } from "react-router-dom";

import StockHeader from "../components/analysis/StockHeader";
import VerdictWithheld from "../components/analysis/VerdictWithheld";
import WorkspaceTabs from "../components/analysis/WorkspaceTabs";
import {
  workspaceIds,
  type WorkspaceId,
} from "../components/analysis/workspaces";
import { useAnalysis } from "../hooks/useAnalysis";
import { readLocalSettings } from "../app/preferences";

const FundamentalsWorkspace = lazy(
  () => import("../components/analysis/FundamentalsWorkspace"),
);
const IslamicCompliance = lazy(
  () => import("../components/analysis/IslamicCompliance"),
);
const RiskAssessment = lazy(
  () => import("../components/analysis/RiskAssessment"),
);
const TechnicalEvidence = lazy(
  () => import("../components/analysis/TechnicalEvidence"),
);
const OverviewWorkspace = lazy(
  () => import("../components/analysis/OverviewWorkspace"),
);
const ThesisWorkspace = lazy(
  () => import("../components/analysis/ThesisWorkspace"),
);

const workspaceLabels: Record<WorkspaceId, string> = {
  overview: "overview",
  technical: "technical evidence",
  fundamentals: "fundamentals",
  risk: "risk",
  shariah: "Shariah",
  thesis: "Thesis",
};

function isWorkspaceId(value: string | null): value is WorkspaceId {
  return workspaceIds.includes(value as WorkspaceId);
}

function WorkspaceLoader({ workspace }: { workspace: WorkspaceId }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="az-card grid min-h-48 place-items-center p-6 text-center"
    >
      <div>
        <div
          aria-hidden="true"
          className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-brand/25 border-t-brand"
        />
        <p className="mt-4 text-sm font-medium text-ink-muted">
          Preparing the {workspaceLabels[workspace]} workspace…
        </p>
      </div>
    </div>
  );
}

export default function AnalysisPage() {
  const { symbol = "AAPL" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const normalizedSymbol = symbol.trim().toUpperCase();
  const { data, isLoading, isError, refetch, isFetching } =
    useAnalysis(normalizedSymbol);
  const errorMessage = `AzaLens could not analyze "${normalizedSymbol}". Confirm the ticker and try again.`;
  const requestedWorkspace = searchParams.get("workspace");
  const activeWorkspace = isWorkspaceId(requestedWorkspace)
    ? requestedWorkspace
    : readLocalSettings().defaultWorkspace;

  /*
    Default-deny on the client too: once data has arrived, the
    verdict only renders when the backend gate explicitly says
    unlocked. This mirrors the server-side gate in
    complianceGateService.js, which already stripped the
    trend/agreement/explanation fields for any non-confirmed
    status before the response left the backend — this check
    just decides what the UI shows in their place.
  */
  const verdictWithheld =
    Boolean(data) && data?.complianceGate?.unlocked !== true;

  function changeWorkspace(workspace: WorkspaceId) {
    const nextSearchParams = new URLSearchParams(searchParams);
    const defaultWorkspace = readLocalSettings().defaultWorkspace;

    if (workspace === defaultWorkspace) {
      nextSearchParams.delete("workspace");
    } else {
      nextSearchParams.set("workspace", workspace);
    }

    setSearchParams(nextSearchParams, { replace: true });
  }

  const workspaceContent = {
    overview: (
      <OverviewWorkspace
        symbol={normalizedSymbol}
        data={data}
        isLoading={isLoading}
        verdictWithheld={verdictWithheld}
        onViewShariah={() => changeWorkspace("shariah")}
      />
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
        /*
          The canonical Evidence Agreement object, passed straight through from
          the backend. The Risk workspace renders it; it never recomputes one.
        */
        evidence={data?.guidance?.evidenceAgreement ?? null}
        currency={data?.market?.data?.currency}
        isLoading={isLoading}
      />
    ),
    shariah: (
      <IslamicCompliance data={data?.shariah} isLoading={isLoading} />
    ),
    thesis: verdictWithheld ? (
      <VerdictWithheld
        message={data?.complianceGate?.message}
        onViewShariah={() => changeWorkspace("shariah")}
      />
    ) : (
      <ThesisWorkspace data={data} isLoading={isLoading} />
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

      <main
        id="main-content"
        tabIndex={-1}
        className="app-atmosphere min-h-[620px] px-3.5 py-4 pb-20 sm:px-6 sm:py-6 sm:pb-20 lg:px-8 lg:pb-6"
      >
        <div className="relative mx-auto max-w-[1680px]">
          {isError && (
            <div
              role="alert"
              className="mb-5 flex flex-col gap-4 rounded-2xl border border-critical/25 bg-critical/10 p-4 text-sm text-critical sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <p>{errorMessage}</p>
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
            id={`workspace-panel-${activeWorkspace}`}
            role="tabpanel"
            aria-labelledby={`workspace-tab-${activeWorkspace}`}
            className="az-workspace-enter"
          >
            <Suspense
              fallback={<WorkspaceLoader workspace={activeWorkspace} />}
            >
              {workspaceContent[activeWorkspace]}
            </Suspense>
          </div>
        </div>
      </main>
    </div>
  );
}
