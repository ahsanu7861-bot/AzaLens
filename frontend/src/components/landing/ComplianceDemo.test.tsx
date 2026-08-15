import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ComplianceDemo from "./ComplianceDemo";
import {
  confirmedDemoAnalysis,
  withheldDemoAnalysis,
} from "../../data/landingDemo";

// A "standalone" verdict command is an element whose entire text is just
// the word BUY, SELL or HOLD — the shape of the old mockup's `<p>BUY</p>`.
// This intentionally does not flag prose like "solicitation to buy or
// sell any security" (a disclaimer, not a command), since that sentence
// is not the full text of any single element.
const STANDALONE_VERDICT_COMMAND = /^(buy|sell|hold)$/i;

// Rule 4 requires a directional lean plus a confidence percentage — the
// 67% figure is legitimate, contract-shaped output, not a fabrication. What
// must never appear is an unsupported claim that the product predicts
// outcomes (accuracy / win rate / success rate / probability of profit).
const UNSUPPORTED_PERFORMANCE_CLAIMS = [
  /%\s*accurate/i,
  /accura(te|cy)/i,
  /win[\s-]?rate/i,
  /%\s*success/i,
  /success[\s-]?rate/i,
  /probability of profit/i,
];

// Every percentage figure the demo renders must come from one of the
// fixtures' documented, explained values — never an unexplained number
// dropped in beside a performance-sounding label.
const ALLOWED_PERCENTAGES = new Set(["67%", "100%", "18%", "0.6%", "0.4%"]);

function renderedPercentages(text: string): string[] {
  return text.match(/\d+(?:\.\d+)?%/g) ?? [];
}

describe("ComplianceDemo honesty regression", () => {
  it("withholds the verdict using the real product copy when compliance is unconfirmed", () => {
    render(<ComplianceDemo />);

    const withheldCard = screen.getByTestId("landing-demo-withheld");

    expect(
      within(withheldCard).getByText("Compliance comes before the verdict"),
    ).toBeInTheDocument();
  });

  it("never renders a directional verdict or confidence figure while compliance is unconfirmed", () => {
    render(<ComplianceDemo />);

    const withheldCard = screen.getByTestId("landing-demo-withheld");

    expect(
      within(withheldCard).queryByText("AzaLens Verdict"),
    ).not.toBeInTheDocument();
    expect(
      within(withheldCard).queryByText("Evidence Agreement"),
    ).not.toBeInTheDocument();
  });

  it("shows a reasoned directional lean (not a bare command) once compliance is confirmed", () => {
    render(<ComplianceDemo />);

    const confirmedCard = screen.getByTestId("landing-demo-confirmed");

    expect(within(confirmedCard).getByText("AzaLens Verdict")).toBeInTheDocument();
    expect(
      within(confirmedCard).getByText("BULLISH"),
    ).toBeInTheDocument();
  });

  it("shows the canonical four-family Evidence Agreement, never a percentage", () => {
    render(<ComplianceDemo />);

    const confirmedCard = screen.getByTestId("landing-demo-confirmed");

    // The demo consumes the same contract the product publishes: explicit family
    // states, a support count, and coverage against a fixed denominator of four.
    expect(within(confirmedCard).getByText("Evidence Agreement")).toBeInTheDocument();
    expect(
      within(confirmedCard).getByText("3 of 4 evidence families support a bullish lean."),
    ).toBeInTheDocument();
    expect(
      within(confirmedCard).getByText("4 of 4 evidence families usable."),
    ).toBeInTheDocument();

    for (const [family, state] of [
      ["Trend position", "Bullish"],
      ["Momentum", "Bullish"],
      ["Price action", "Neutral"],
      ["Volume flow", "Bullish"],
    ]) {
      expect(within(confirmedCard).getByLabelText(`${family}: ${state}`)).toBeInTheDocument();
    }

    // No percentage inside the Evidence Agreement region, no progress bar, and
    // no 9-of-9 indicator claim. (The Shariah panel's screening ratios are a
    // different component and legitimately carry percentages.)
    const agreementRegion = within(confirmedCard).getByRole("region", {
      name: "Evidence Agreement",
    });
    expect(agreementRegion.textContent ?? "").not.toMatch(/%/);
    expect(agreementRegion.textContent ?? "").not.toMatch(/confidence/i);
    expect(confirmedCard.textContent ?? "").not.toMatch(/9 of 9/);
    expect(confirmedCard.textContent ?? "").not.toMatch(/67%/);
    expect(within(confirmedCard).queryByRole("progressbar")).not.toBeInTheDocument();
    expect(confirmedCard.querySelector("[aria-valuenow]")).toBeNull();
  });

  it("never renders a standalone BUY, SELL or HOLD verdict command anywhere", () => {
    render(<ComplianceDemo />);

    expect(
      screen.queryByText(STANDALONE_VERDICT_COMMAND),
    ).not.toBeInTheDocument();
  });

  it("never renders an accuracy, win-rate, success-rate or profit-probability claim", () => {
    const { container } = render(<ComplianceDemo />);

    for (const pattern of UNSUPPORTED_PERFORMANCE_CLAIMS) {
      expect(container.textContent).not.toMatch(pattern);
    }
  });

  it("never renders the fabricated 92% confidence figure", () => {
    render(<ComplianceDemo />);

    expect(screen.queryByText("92%")).not.toBeInTheDocument();
  });

  it("never renders a percentage figure that isn't one of the fixtures' documented values", () => {
    const { container } = render(<ComplianceDemo />);

    const found = renderedPercentages(container.textContent ?? "");
    const unexpected = found.filter((value) => !ALLOWED_PERCENTAGES.has(value));

    expect(unexpected).toEqual([]);
  });

  it("labels both demonstration cards so a visitor cannot mistake them for live data", () => {
    render(<ComplianceDemo />);

    expect(screen.getAllByText(/demonstration/i).length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it("does not name the screening provider in the demo fixtures", () => {
    expect(withheldDemoAnalysis.shariah.provider).toBeUndefined();
    expect(confirmedDemoAnalysis.shariah.provider).toBeUndefined();
  });

  it("stacks the two demo cards in a single column below the lg breakpoint", () => {
    const { container } = render(<ComplianceDemo />);
    const grid = container.querySelector(".grid");

    expect(grid).not.toBeNull();
    expect(grid?.className).toContain("lg:grid-cols-2");
    expect(grid?.className).not.toMatch(/(?<!lg:)grid-cols-2/);
  });
});
