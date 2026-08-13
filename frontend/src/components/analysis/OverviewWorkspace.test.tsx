import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AnalysisData } from "../../types/analysis";
import OverviewWorkspace from "./OverviewWorkspace";

/*
 * The Overview page renders risk twice, at two levels of detail:
 *
 *   - the sidebar "Risk context" panel  -> data.risk.riskLevel   (canonical summary)
 *   - the guidance "Risk and limitations" panel -> guidance.risk.level (explanation)
 *
 * Both originate from the single risk object built in masterAnalysisService.js:1877
 * and handed to buildGuidanceContract (:1931) and to data.risk (:2065). These tests
 * pin the two properties that keep that safe: the headings stay distinct, and the
 * level shown is the same string in both places, untransformed.
 */
function analysis(overrides: Record<string, unknown> = {}) {
  return {
    risk: {
      success: true,
      riskLevel: "Moderate",
      riskScore: 42,
      volatility: "Moderate",
      atrPercent: 2.4,
      riskSummary: "AAPL currently has a moderate technical risk profile.",
    },
    guidance: {
      contractVersion: "1.0",
      symbol: "AAPL",
      asOf: "2026-08-06T12:00:00.000Z",
      horizon: "SWING_2_TO_10_SESSIONS",
      shariah: { status: "COMPLIANT", verdictPermitted: true },
      verdict: { state: "FAVORED", direction: "BULLISH" },
      publicLabel: "Constructive — Upside Evidence Established",
      evidenceAgreement: {
      state: "Moderate agreement",
      support: { direction: "BULLISH", supportingFamilies: 3, opposingFamilies: 0, neutralFamilies: 1 },
      coverage: {
        usableFamilies: 4,
        expectedFamilies: 4,
        unavailableFamilies: 0,
        families: [
          { id: "trendPosition", label: "Trend position", vote: "BULLISH", members: [{ name: "EMA", vote: "BULLISH" }, { name: "SMA", vote: "BULLISH" }, { name: "Bollinger Bands", vote: "BEARISH" }] },
          { id: "momentum", label: "Momentum", vote: "BULLISH", members: [{ name: "RSI", vote: "BULLISH" }, { name: "MACD", vote: "BULLISH" }] },
          { id: "priceAction", label: "Price action", vote: "NEUTRAL", members: [{ name: "Candlestick", vote: "NEUTRAL" }] },
          { id: "volumeFlow", label: "Volume flow", vote: "BULLISH", members: [{ name: "OBV", vote: "BULLISH" }] },
        ],
      },
      summary: "3 of 4 evidence families support a bullish lean.",
    },
      currentSituation: "Upside evidence currently leads the available indicator set.",
      supportingEvidence: [],
      opposingEvidence: [],
      meaning: "Established evidence favors an upside scenario.",
      nextObservation: "Observe whether price remains accepted above resistance.",
      confirmations: [],
      invalidation: null,
      risk: {
        level: "Moderate",
        score: 42,
        volatility: "Moderate",
        summary: "AAPL currently has a moderate technical risk profile.",
        notes: [],
      },
      freshness: { state: "realtime", asOf: "2026-08-06T12:00:00.000Z" },
      limitations: [],
      allowedNextStep: "Observe the stated confirmation condition.",
    },
    confluence: {},
    ...overrides,
  } as unknown as AnalysisData;
}

function renderWorkspace(data: AnalysisData) {
  return render(
    <OverviewWorkspace
      symbol="AAPL"
      data={data}
      isLoading={false}
      verdictWithheld={false}
      onViewShariah={() => {}}
    />,
  );
}

describe("OverviewWorkspace risk presentation", () => {
  it("keeps the two risk panels distinctly titled", () => {
    renderWorkspace(analysis());

    // The sidebar keeps the canonical heading; guidance no longer competes with it.
    expect(screen.getByText("Risk context")).toBeInTheDocument();
    expect(screen.getByText("Risk and limitations")).toBeInTheDocument();
    expect(screen.queryAllByText("Risk context")).toHaveLength(1);
  });

  it("shows the same canonical risk level in both panels, untransformed", () => {
    renderWorkspace(analysis());

    const guidancePanel = screen.getByTestId("guidance-verdict");
    const sidebarPanel = screen.getByText("Risk context").closest("section");
    if (!sidebarPanel) throw new Error("Sidebar risk panel not found");

    // Sidebar: the canonical level, verbatim.
    expect(within(sidebarPanel).getByText("Moderate")).toBeInTheDocument();
    // Guidance: the same level, with the score that produced it.
    expect(within(guidancePanel).getByText("Moderate · 42/100")).toBeInTheDocument();

    // Neither panel upper-cases, abbreviates or re-words the canonical level.
    expect(screen.queryByText("MEDIUM")).not.toBeInTheDocument();
    expect(screen.queryByText("Medium")).not.toBeInTheDocument();
    expect(screen.queryByText("MODERATE")).not.toBeInTheDocument();
  });

  /*
   * An incoherent score/level pair never reaches this component. The shared
   * boundary in masterAnalysisService validates the risk result once, before
   * `data.risk` and `data.guidance.risk` are populated, so what the UI receives
   * for a 95/"Low" result is the engine's unavailable shape on both sides.
   *
   * That withholding is proven at the boundary in backend/tests/testRiskBoundary.js
   * against the real getMasterAnalysis control flow. This test proves the UI half:
   * given what the boundary actually publishes, both panels degrade honestly and
   * neither invents a level.
   */
  it("shows no level in either panel for a payload the boundary withheld", () => {
    const data = analysis();
    const withheld = {
      ...data,
      // Exactly what validateRiskResult publishes for a 95/"Low" result.
      risk: {
        success: false,
        symbol: "AAPL",
        error: "Risk analysis failed its internal consistency check and was withheld.",
      },
      guidance: { ...data.guidance, risk: null },
    } as unknown as AnalysisData;

    renderWorkspace(withheld);
    const guidancePanel = screen.getByTestId("guidance-verdict");
    const sidebarPanel = screen.getByText("Risk context").closest("section");
    if (!sidebarPanel) throw new Error("Sidebar risk panel not found");

    expect(
      within(guidancePanel).getByText(/No risk profile is published for this evidence state/i),
    ).toBeInTheDocument();
    expect(within(sidebarPanel).getByText("Review required")).toBeInTheDocument();

    // Neither the withheld level nor its score appears anywhere on the page.
    expect(screen.queryByText("Low")).not.toBeInTheDocument();
    expect(screen.queryByText(/95\/100/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+\/100/)).not.toBeInTheDocument();
  });

  it("degrades conservatively in both panels when risk is unavailable", () => {
    const data = analysis();
    const withoutRisk = {
      ...data,
      risk: undefined,
      guidance: { ...data.guidance, risk: null },
    } as unknown as AnalysisData;

    renderWorkspace(withoutRisk);
    const guidancePanel = screen.getByTestId("guidance-verdict");

    // Sidebar asks for review; guidance declines to publish a profile. Neither invents a level.
    expect(screen.getByText("Review required")).toBeInTheDocument();
    expect(
      within(guidancePanel).getByText(/No risk profile is published for this evidence state/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/\d+\/100/)).not.toBeInTheDocument();
  });
});
