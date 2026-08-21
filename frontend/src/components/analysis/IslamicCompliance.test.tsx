import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ShariahComplianceData } from "../../types/analysis";
import IslamicCompliance from "./IslamicCompliance";

function renderCompliance(data?: ShariahComplianceData, isLoading = false) {
  render(<IslamicCompliance data={data} isLoading={isLoading} />);
}

describe("IslamicCompliance truth states", () => {
  it("shows the loading state", () => {
    renderCompliance(undefined, true);

    expect(screen.getByText("Screening...")).toBeInTheDocument();
    expect(screen.getAllByText("Loading")).toHaveLength(6);
  });

  it("fails safely when evidence is unavailable", () => {
    renderCompliance();

    expect(screen.getAllByText("Review required")).not.toHaveLength(0);
    expect(
      screen.getByText(/will not infer a compliant status/i),
    ).toBeInTheDocument();
  });

  it("renders a review-required verdict", () => {
    renderCompliance({
      summary: {
        status: "UNKNOWN",
        explanation: "Provider evidence requires review.",
      },
    });

    expect(screen.getAllByText("Review required")).not.toHaveLength(0);
    expect(
      screen.getByText(/will not infer a compliant status/i),
    ).toBeInTheDocument();
  });

  it("renders a verified compliant verdict", () => {
    renderCompliance({
      summary: {
        status: "COMPLIANT",
        confidence: "High",
        explanation:
          "Compliant under AAOIFI, DJIM, FTSE, MSCI and S&P.",
      },
      businessActivity: { status: "PASS" },
      financialScreen: { status: "PASS" },
    });

    expect(screen.getByText("Compliant")).toBeInTheDocument();
    expect(screen.getByText("Confidence: High")).toBeInTheDocument();
    expect(
      screen.getByText(/AAOIFI business-activity and financial-ratio screens passed/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/DJIM|FTSE|MSCI|S&P/)).not.toBeInTheDocument();
  });

  it("keeps equal provider ratios distinct and explains their meaning", () => {
    renderCompliance({
      summary: {
        status: "COMPLIANT",
        purificationRateFormatted: "3.37%",
      },
      businessActivity: {
        status: "PASS",
        revenueRatios: {
          combinedImpureFormatted: "3.37%",
        },
      },
      financialScreen: {
        status: "PASS",
        ratios: {
          debtToAssetsFormatted: "23.16%",
          interestIncomeToRevenueFormatted: "3.37%",
        },
      },
    });

    expect(screen.getAllByText("3.37%")).toHaveLength(3);
    expect(screen.getByText(/interest income divided by total revenue/i)).toBeInTheDocument();
    expect(screen.getByText(/combined impure-revenue ratio/i)).toBeInTheDocument();
    expect(screen.getByText(/treatment of the impure portion of dividend income/i)).toBeInTheDocument();
    expect(screen.getByText(/not debt divided by market capitalization/i)).toBeInTheDocument();
  });

  it("renders purification as a distinct, non-calculating disclosure", () => {
    renderCompliance({ summary: { purificationRateFormatted: "0.42%" } });

    const section = screen.getByRole("region", { name: "Provider-reported rate" });
    expect(section).toHaveTextContent("0.42%");
    expect(section).toHaveTextContent(/does not calculate your personal cash obligation/i);
    expect(section).toHaveTextContent(/qualified Shariah scholar/i);
  });

  it("never presents an unavailable purification rate as zero", () => {
    renderCompliance({ summary: { purificationRateFormatted: null } });
    const section = screen.getByRole("region", { name: "Provider-reported rate" });
    expect(section).toHaveTextContent("Unavailable");
    expect(section).toHaveTextContent(/is not zero/i);
    expect(section).not.toHaveTextContent("0%");
  });

  it("discloses stale evidence", () => {
    renderCompliance({
      summary: { status: "UNKNOWN" },
      verification: {
        lastCheckedAt: "2026-07-01T00:00:00.000Z",
        isStale: true,
      },
    });

    expect(screen.getByText(/Data may be stale/)).toBeInTheDocument();
  });
});
