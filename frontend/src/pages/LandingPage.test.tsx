import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import LandingPage from "./LandingPage";

// A "standalone" verdict command is an element whose entire text is just
// the word BUY, SELL or HOLD — the shape of the old mockup's `<p>BUY</p>`.
// This intentionally does not flag prose such as the footer's
// "solicitation to buy or sell any security" disclaimer, since that
// sentence is not the full text of any single element.
const STANDALONE_VERDICT_COMMAND = /^(buy|sell|hold)$/i;

// Rule 4 requires a directional lean plus a confidence percentage — the
// real product's 60% figure is legitimate output, not a fabrication.
// What must never appear is an unsupported claim that the product
// predicts outcomes (accuracy / win rate / success rate / probability
// of profit).
const UNSUPPORTED_PERFORMANCE_CLAIMS = [
  /%\s*accurate/i,
  /accura(te|cy)/i,
  /win[\s-]?rate/i,
  /%\s*success/i,
  /success[\s-]?rate/i,
  /probability of profit/i,
];

function renderLanding() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
}

describe("LandingPage honesty regression (audit V8 / Phase 0 item 1.1)", () => {
  it("never renders a standalone BUY, SELL or HOLD verdict command", () => {
    renderLanding();

    expect(
      screen.queryByText(STANDALONE_VERDICT_COMMAND),
    ).not.toBeInTheDocument();
  });

  it("never renders an accuracy, win-rate, success-rate or profit-probability claim", () => {
    const { container } = renderLanding();

    for (const pattern of UNSUPPORTED_PERFORMANCE_CLAIMS) {
      expect(container.textContent).not.toMatch(pattern);
    }
  });

  it("never renders the fabricated AI confidence figure from the old mockup", () => {
    renderLanding();

    expect(screen.queryByText("92%")).not.toBeInTheDocument();
  });

  it("shows the real withheld-verdict copy instead of a trade-plan mockup, with no verdict alongside it", () => {
    renderLanding();

    const withheldCopy = screen.getByText(
      "Compliance comes before the verdict",
    );

    expect(withheldCopy).toBeInTheDocument();
    expect(screen.getByTestId("landing-demo-withheld")).toContainElement(
      withheldCopy,
    );
    expect(
      within(screen.getByTestId("landing-demo-withheld")).queryByText(
        "AI Verdict",
      ),
    ).not.toBeInTheDocument();
  });

  it("shows the confidence figure only alongside its stated calculation basis, and clear representative labelling", () => {
    renderLanding();

    const confirmedCard = screen.getByTestId("landing-demo-confirmed");

    expect(within(confirmedCard).getByText("60%")).toBeInTheDocument();
    expect(
      within(confirmedCard).getByText(/\d+ of \d+ technical indicators agree/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/demonstration/i).length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it("carries footer disclaimers: research not advice, no execution, no brokerage", () => {
    renderLanding();

    expect(
      screen.getByText(/nothing on this site is investment advice/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not execute trades/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/broker-dealer/i),
    ).toBeInTheDocument();
  });

  it("does not carry the stale 'AzaLens AI' workspace label", () => {
    renderLanding();

    expect(screen.queryByText(/AzaLens AI/)).not.toBeInTheDocument();
    expect(screen.getByText("AzaLens · Analysis Workspace")).toBeInTheDocument();
  });
});
