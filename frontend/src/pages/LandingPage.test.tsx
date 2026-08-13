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
// representative 67% figure follows the real Evidence Agreement contract.
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
        "AzaLens Verdict",
      ),
    ).not.toBeInTheDocument();
  });

  it("shows the family-count Evidence Agreement with clear representative labelling", () => {
    renderLanding();

    const confirmedCard = screen.getByTestId("landing-demo-confirmed");

    expect(
      within(confirmedCard).getByText("3 of 4 evidence families support a bullish lean."),
    ).toBeInTheDocument();
    expect(
      within(confirmedCard).getByText("4 of 4 evidence families usable."),
    ).toBeInTheDocument();

    // The retired percentage and 9-of-9 indicator claim must not return.
    // Scoped to the Evidence Agreement region: the Shariah screening panel in the
    // same card legitimately reports ratios as percentages.
    const agreementRegion = within(confirmedCard).getByRole("region", {
      name: "Evidence Agreement",
    });
    expect(agreementRegion.textContent ?? "").not.toMatch(/%/);
    expect(confirmedCard.textContent ?? "").not.toMatch(/67%/);
    expect(confirmedCard.textContent ?? "").not.toMatch(/9 of 9/);

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
