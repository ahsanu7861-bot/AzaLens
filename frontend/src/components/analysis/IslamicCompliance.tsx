import type {
  ShariahComplianceData,
  ShariahStatus,
} from "../../types/analysis";
import { Badge, Card } from "../ui";

type IslamicComplianceProps = {
  data?: ShariahComplianceData;
  isLoading?: boolean;
};

type BadgeVariant =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info";

function formatStatus(status?: ShariahStatus) {
  if (status === "COMPLIANT") {
    return "Compliant";
  }

  if (status === "NON_COMPLIANT") {
    return "Non-compliant";
  }

  return "Review required";
}

function statusVariant(status?: ShariahStatus): BadgeVariant {
  if (status === "COMPLIANT") {
    return "success";
  }

  if (status === "NON_COMPLIANT") {
    return "danger";
  }

  return "warning";
}

function screenLabel(status?: string) {
  if (status === "PASS") {
    return "Pass";
  }

  if (status === "FAIL") {
    return "Fail";
  }

  return "Review required";
}

function screenVariant(status?: string): BadgeVariant {
  if (status === "PASS") {
    return "success";
  }

  if (status === "FAIL") {
    return "danger";
  }

  return "warning";
}

function formatCheckedAt(value?: string | null) {
  if (!value) {
    return "Not verified";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(date);
}

function buildAAOIFIExplanation(data?: ShariahComplianceData) {
  const primary =
    data?.primaryMethodology ?? data?.methodologies?.results?.AAOIFI;

  if (primary?.reason) {
    return primary.reason;
  }

  const businessStatus = data?.businessActivity?.status;
  const financialStatus = data?.financialScreen?.status;

  if (businessStatus === "PASS" && financialStatus === "PASS") {
    return "The provider reports that the AAOIFI business-activity and financial-ratio screens passed.";
  }

  if (businessStatus === "FAIL" || financialStatus === "FAIL") {
    return "The provider reports that at least one AAOIFI company-level screen did not pass.";
  }

  return "The AAOIFI result is not currently available. AzaLens will not infer a compliant status without verified screening data.";
}

export default function IslamicCompliance({
  data,
  isLoading = false,
}: IslamicComplianceProps) {
  const primary =
    data?.primaryMethodology ??
    data?.methodologies?.results?.AAOIFI;
  const status =
    data?.summary?.status ??
    primary?.status ??
    "UNKNOWN";
  const financialRatios = data?.financialScreen?.ratios;
  const revenueRatios = data?.businessActivity?.revenueRatios;
  const statusLabel = isLoading
    ? "Screening..."
    : formatStatus(status);
  const metrics = [
    {
      label: "Business activity",
      value: screenLabel(data?.businessActivity?.status),
      badge: screenVariant(data?.businessActivity?.status),
      description:
        data?.businessActivity?.reason ||
        "The company’s activities are checked against AAOIFI exclusions.",
    },
    {
      label: "Financial screen",
      value: screenLabel(data?.financialScreen?.status),
      badge: screenVariant(data?.financialScreen?.status),
      description:
        "Provider-reported outcome of the AAOIFI company-level financial screen.",
    },
    {
      label: "Debt to assets",
      value:
        financialRatios?.debtToAssetsFormatted ||
        "Unavailable",
      badge: financialRatios?.debtToAssetsFormatted
        ? "info"
        : "neutral",
      description:
        "Provider-reported total debt divided by total assets. This is not debt divided by market capitalization.",
    },
    {
      label: "Interest income",
      value:
        financialRatios?.interestIncomeToRevenueFormatted ||
        revenueRatios?.interestIncomeFormatted ||
        "Unavailable",
      badge:
        financialRatios?.interestIncomeToRevenueFormatted ||
        revenueRatios?.interestIncomeFormatted
          ? "info"
          : "neutral",
      description:
        "Provider-reported interest income divided by total revenue, when available.",
    },
    {
      label: "Impure revenue",
      value:
        revenueRatios?.combinedImpureFormatted ||
        revenueRatios?.impermissibleFormatted ||
        "Unavailable",
      badge:
        revenueRatios?.combinedImpureFormatted ||
        revenueRatios?.impermissibleFormatted
          ? "info"
          : "neutral",
      description:
        "Provider-reported combined impure-revenue ratio. It may include interest income and other impermissible revenue.",
    },
  ] satisfies Array<{
    label: string;
    value: string;
    badge: BadgeVariant;
    description: string;
  }>;

  return (
    <Card variant="glass" padding="lg" className="az-workspace-card">
      <div>
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="az-eyebrow" style={{ color: "var(--az-shariah)" }}>
                Islamic Compliance
              </p>
              <Badge variant="brand" className="border-shariah/20 bg-shariah/15 text-shariah">AAOIFI</Badge>
            </div>

            <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight text-ink">
              AAOIFI Shariah screening
            </h2>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-soft">
              One clear verdict based exclusively on AAOIFI business-activity
              and financial-ratio screening.
            </p>
          </div>

          <div className="az-subcard rounded-2xl border border-shariah/20 bg-shariah/10 p-5 lg:min-w-64">
            <p className="az-eyebrow">
              AAOIFI Status
            </p>

            <div className="mt-3">
              <Badge
                dot
                variant={isLoading ? "neutral" : statusVariant(status)}
              >
                {statusLabel}
              </Badge>
            </div>

            <p className="az-numeric mt-3 text-xs leading-5 text-ink-muted">
              Confidence: {data?.summary?.confidence || "Unknown"}
            </p>
          </div>
        </div>

        <section
          aria-labelledby="purification-heading"
          className="az-subcard mt-6 rounded-2xl border border-shariah/20 bg-shariah/10 p-5 sm:p-6"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-2xl">
              <p className="az-eyebrow" style={{ color: "var(--az-shariah)" }}>Dividend purification</p>
              <h3 id="purification-heading" className="mt-2 font-display text-xl font-semibold text-ink">
                Provider-reported rate
              </h3>
              <p className="mt-3 text-sm leading-6 text-ink-soft">
                Purification is the treatment of the impure portion of dividend income. AzaLens reports the provider’s rate when available; it does not calculate your personal cash obligation or decide how the rate applies to your holdings.
              </p>
            </div>
            <Badge variant={data?.summary?.purificationRateFormatted ? "info" : "neutral"}>
              {isLoading ? "Loading" : data?.summary?.purificationRateFormatted || "Unavailable"}
            </Badge>
          </div>
          <p className="mt-4 text-xs leading-5 text-ink-muted">
            An unavailable rate is not zero. Confirm personal application with a qualified Shariah scholar.
          </p>
        </section>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="az-subcard rounded-2xl border border-stroke bg-surface-soft p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm font-medium text-ink-soft">
                  {metric.label}
                </p>

                <Badge variant={metric.badge}>
                  {isLoading ? "Loading" : metric.value}
                </Badge>
              </div>

              <p className="mt-4 text-sm leading-6 text-ink-soft">
                {metric.description}
              </p>
            </div>
          ))}
        </div>

        <div className="az-subcard mt-6 rounded-2xl border border-stroke bg-surface-soft p-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="font-display text-sm font-semibold text-ink">
                Why this status
              </p>

              <p className="mt-2 text-sm leading-6 text-ink-soft">
                {buildAAOIFIExplanation(data)}
              </p>
            </div>

            <div>
              <p className="font-display text-sm font-semibold text-ink">
                Verification
              </p>

              <p className="mt-2 text-sm leading-6 text-ink-soft">
                Last checked:{" "}
                {formatCheckedAt(data?.verification?.lastCheckedAt)}
                {data?.verification?.isStale === true
                  ? " · Data may be stale"
                  : ""}
              </p>
            </div>
          </div>
        </div>

        <p className="mt-4 text-xs leading-5 text-ink-muted">
          AAOIFI is the sole methodology used for the displayed AzaLens
          verdict. This automated screen is for research and is not a fatwa,
          religious ruling, or personal investment advice.
        </p>
      </div>
    </Card>
  );
}
