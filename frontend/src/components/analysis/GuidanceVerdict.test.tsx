import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AnalysisData } from "../../types/analysis";
import GuidanceVerdict from "./GuidanceVerdict";

type Guidance = NonNullable<AnalysisData["guidance"]>;

function guidance(overrides: Partial<Guidance> = {}): Guidance {
  return {
    contractVersion: "1.0",
    symbol: "AAPL",
    asOf: "2026-08-06T12:00:00.000Z",
    horizon: "SWING_2_TO_10_SESSIONS",
    shariah: { status: "COMPLIANT", verdictPermitted: true },
    verdict: { state: "FAVORED", direction: "BULLISH" },
    evidenceAgreement: { percent: 67, state: "Moderate agreement", available: 9, expected: 9 },
    currentSituation: "Upside evidence currently leads the available indicator set.",
    supportingEvidence: [{ source: "EMA", statement: "Price is above EMA20." }],
    opposingEvidence: [{ source: "RSI", statement: "Momentum is extended." }],
    meaning: "Current evidence favors an upside scenario, conditionally rather than as a prediction or instruction.",
    nextObservation: "Observe whether price remains accepted above resistance near 210.",
    confirmations: ["A sustained close above resistance near 210 strengthens the scenario."],
    invalidation: null,
    risk: null,
    freshness: { state: "realtime", asOf: "2026-08-06T12:00:00.000Z" },
    limitations: ["Relative-volume evidence is unavailable."],
    allowedNextStep: "Observe the stated condition.",
    ...overrides,
  };
}

describe("GuidanceVerdict Rule 6 presentation", () => {
  it.each([
    [{ state: "FAVORED", direction: "BULLISH" }, "Constructive — Upside Evidence Dominates"],
    [{ state: "FAVORED", direction: "BEARISH" }, "Adverse — Downside Evidence Dominates"],
    [{ state: "LIMITED_EVIDENCE", direction: "BULLISH" }, "Unconfirmed — Evidence Still Developing"],
    [{ state: "CONFLICTING", direction: null }, "Mixed — No Established Edge"],
    [{ state: "NEUTRAL", direction: null }, "Neutral — No Directional Lean"],
    [{ state: "UNAVAILABLE", direction: null }, "Analysis Limited — Evidence Unavailable"],
  ] as const)("maps %j to the approved label", (verdict, label) => {
    render(<GuidanceVerdict guidance={guidance({ verdict })} />);
    expect(screen.getByRole("heading", { name: label.toUpperCase() })).toBeInTheDocument();
  });

  it("shows both sides, observation, confirmation, horizon, freshness and limitations", () => {
    render(<GuidanceVerdict guidance={guidance()} />);
    const view = screen.getByTestId("guidance-verdict");

    expect(within(view).getByText("Price is above EMA20.")).toBeInTheDocument();
    expect(within(view).getByText("Momentum is extended.")).toBeInTheDocument();
    expect(within(view).getByText(/remains accepted above resistance/i)).toBeInTheDocument();
    expect(within(view).getByText(/sustained close above resistance/i)).toBeInTheDocument();
    expect(within(view).getAllByText("Swing · 2–10 sessions").length).toBeGreaterThan(0);
    expect(within(view).getByText(/realtime/i)).toBeInTheDocument();
    expect(within(view).getByText("Relative-volume evidence is unavailable.")).toBeInTheDocument();
  });

  it("does not render transaction-command labels", () => {
    const { container } = render(<GuidanceVerdict guidance={guidance()} />);
    expect(container.textContent).not.toMatch(/\b(?:buy|sell|hold|wait|enter|exit)\b/i);
  });
});
