import { BrainCircuit } from "lucide-react";

import type { AnalysisData } from "../../types/analysis";
import AIExplanation from "../dashboard/AIExplanation";

type ThesisWorkspaceProps = {
  data?: AnalysisData;
  isLoading: boolean;
};

export default function ThesisWorkspace({
  data,
  isLoading,
}: ThesisWorkspaceProps) {
  return (
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
            <p className="az-eyebrow text-intelligence">
              Evidence narrative
            </p>
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
  );
}
