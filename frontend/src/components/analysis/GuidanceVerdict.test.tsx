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
    publicLabel: "Constructive — Upside Evidence Established",
    evidenceAgreement: { percent: 74, state: "Moderate agreement", available: 9, expected: 9 },
    currentSituation: "Upside evidence currently leads the available indicator set.",
    supportingEvidence: [{ source: "EMA", statement: "Price is above EMA20." }],
    opposingEvidence: [{ source: "RSI", statement: "Momentum is extended." }],
    meaning: "Established evidence favors an upside scenario, conditionally rather than as a prediction or instruction.",
    nextObservation: "Observe whether price remains accepted above resistance near 218.",
    confirmations: ["Acceptance above the resistance zone near 218, sustained on a closing basis, would confirm the current reading."],
    invalidation: null,
    risk: {
      level: "Moderate",
      score: 42,
      volatility: "Moderate",
      summary: "AAPL currently has a moderate technical risk profile.",
      notes: ["Trend strength is weak, which reduces the reliability of directional signals."],
    },
    freshness: { state: "realtime", asOf: "2026-08-06T12:00:00.000Z" },
    limitations: ["Relative-volume evidence is unavailable."],
    allowedNextStep:
      "Observe whether the stated confirmation condition occurs, and reassess the scenario if the invalidation boundary is reached instead.",
    ...overrides,
  };
}

describe("GuidanceVerdict Rule 6 presentation", () => {
  /*
   * The backend owns public verdict wording. These cases pair a backend label with
   * a deliberately unrelated internal state to prove the component renders what it
   * was given rather than deriving wording from `verdict.state`.
   */
  it.each([
    ["Constructive — Upside Evidence Established", { state: "FAVORED", direction: "BULLISH" }],
    ["Adverse — Downside Evidence Established", { state: "FAVORED", direction: "BEARISH" }],
    ["Unconfirmed — Evidence Still Developing", { state: "LIMITED_EVIDENCE", direction: "BULLISH" }],
    ["Mixed — No Established Edge", { state: "CONFLICTING", direction: null }],
    ["Mixed — No Established Edge", { state: "NEUTRAL", direction: null }],
    ["Analysis Limited — Evidence Incomplete", { state: "UNAVAILABLE", direction: null }],
    ["Verdict Withheld — Shariah Gate Not Cleared", { state: "WITHHELD", direction: null }],
  ] as const)("renders the backend publicLabel %s verbatim", (publicLabel, verdict) => {
    render(<GuidanceVerdict guidance={guidance({ publicLabel, verdict })} />);
    expect(
      screen.getByRole("heading", { name: publicLabel.toUpperCase() }),
    ).toBeInTheDocument();
  });

  it("renders the backend label even when it does not match the internal state", () => {
    render(
      <GuidanceVerdict
        guidance={guidance({
          verdict: { state: "FAVORED", direction: "BULLISH" },
          publicLabel: "Mixed — No Established Edge",
        })}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "MIXED — NO ESTABLISHED EDGE" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /CONSTRUCTIVE/ }),
    ).not.toBeInTheDocument();
  });

  it.each([undefined, "", "   "])(
    "falls back to analysis-limited wording when publicLabel is %j",
    (publicLabel) => {
      render(
        <GuidanceVerdict
          guidance={guidance({ publicLabel: publicLabel as unknown as string })}
        />,
      );
      expect(
        screen.getByRole("heading", { name: "ANALYSIS LIMITED — EVIDENCE INCOMPLETE" }),
      ).toBeInTheDocument();
    },
  );

  it("shows both sides, observation, confirmation, horizon, freshness and limitations", () => {
    render(<GuidanceVerdict guidance={guidance()} />);
    const view = screen.getByTestId("guidance-verdict");

    expect(within(view).getByText("Price is above EMA20.")).toBeInTheDocument();
    expect(within(view).getByText("Momentum is extended.")).toBeInTheDocument();
    expect(within(view).getByText(/remains accepted above resistance/i)).toBeInTheDocument();
    expect(within(view).getByText(/Acceptance above the resistance zone/i)).toBeInTheDocument();
    expect(within(view).getAllByText("Swing · 2–10 sessions").length).toBeGreaterThan(0);
    expect(within(view).getByText(/realtime/i)).toBeInTheDocument();
    expect(within(view).getByText("Relative-volume evidence is unavailable.")).toBeInTheDocument();
  });

  it("renders honest fallback wording when no confirmation condition exists", () => {
    render(<GuidanceVerdict guidance={guidance({ confirmations: [] })} />);
    const view = screen.getByTestId("guidance-verdict");

    expect(within(view).getByText("Confirmation condition")).toBeInTheDocument();
    expect(
      within(view).getByText(
        "No independent confirmation condition is available from the current evidence.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the invalidation fallback visible when no invalidation is supplied", () => {
    render(<GuidanceVerdict guidance={guidance({ invalidation: null })} />);
    const view = screen.getByTestId("guidance-verdict");

    expect(within(view).getByText("Thesis invalidation criteria")).toBeInTheDocument();
    expect(
      within(view).getByText(
        "No technical invalidation rule was supplied by the analysis API.",
      ),
    ).toBeInTheDocument();
    expect(
      within(view).getByText(
        "No fundamental invalidation rule was supplied by the analysis API.",
      ),
    ).toBeInTheDocument();
  });

  it("renders the allowed next step", () => {
    render(<GuidanceVerdict guidance={guidance()} />);
    const view = screen.getByTestId("guidance-verdict");

    expect(within(view).getByText("What you can reasonably do next")).toBeInTheDocument();
    expect(
      within(view).getByText(/Observe whether the stated confirmation condition occurs/i),
    ).toBeInTheDocument();
  });

  it("renders risk and limitations from the typed contract", () => {
    render(<GuidanceVerdict guidance={guidance()} />);
    const view = screen.getByTestId("guidance-verdict");

    expect(within(view).getByText("Risk and limitations")).toBeInTheDocument();
    expect(within(view).getByText("Moderate · 42/100")).toBeInTheDocument();
    expect(within(view).getByText("Moderate")).toBeInTheDocument();
    expect(
      within(view).getByText("AAPL currently has a moderate technical risk profile."),
    ).toBeInTheDocument();
    expect(
      within(view).getByText(/Trend strength is weak/i),
    ).toBeInTheDocument();
  });

  it("says so honestly when no risk profile is published", () => {
    render(<GuidanceVerdict guidance={guidance({ risk: null })} />);
    const view = screen.getByTestId("guidance-verdict");

    expect(within(view).getByText("Risk and limitations")).toBeInTheDocument();
    expect(
      within(view).getByText(/No risk profile is published for this evidence state/i),
    ).toBeInTheDocument();
  });

  it("does not render transaction-command labels", () => {
    const { container } = render(<GuidanceVerdict guidance={guidance()} />);
    expect(container.textContent).not.toMatch(/\b(?:buy|sell|hold|wait|enter|exit)\b/i);
  });
});
