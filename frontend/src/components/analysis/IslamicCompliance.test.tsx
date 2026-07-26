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
      screen.getByText("Provider evidence requires review."),
    ).toBeInTheDocument();
  });

  it("renders a verified compliant verdict", () => {
    renderCompliance({
      summary: {
        status: "COMPLIANT",
        confidence: "High",
        explanation: "AAOIFI checks passed.",
      },
    });

    expect(screen.getByText("Compliant")).toBeInTheDocument();
    expect(screen.getByText("Confidence: High")).toBeInTheDocument();
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
