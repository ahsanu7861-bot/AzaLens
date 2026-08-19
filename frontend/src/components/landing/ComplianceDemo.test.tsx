import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ComplianceDemo from "./ComplianceDemo";
import {
  confirmedDemoCard,
  landingDemoContract,
  withheldDemoCard,
} from "../../data/landingDemo";
import { horizonLabel } from "../../lib/guidanceLabels";

// A "standalone" verdict command is an element whose entire text is just
// the word BUY, SELL or HOLD — the shape of the old mockup's `<p>BUY</p>`.
// This intentionally does not flag prose like "solicitation to buy or
// sell any security" (a disclaimer, not a command), since that sentence
// is not the full text of any single element.
const STANDALONE_VERDICT_COMMAND = /^(buy|sell|hold)$/i;

// The product publishes no confidence percentage. What must never appear is an
// unsupported claim that it predicts outcomes (accuracy / win rate / success
// rate / probability of profit).
const UNSUPPORTED_PERFORMANCE_CLAIMS = [
  /%\s*accurate/i,
  /accura(te|cy)/i,
  /win[\s-]?rate/i,
  /%\s*success/i,
  /success[\s-]?rate/i,
  /probability of profit/i,
];

// Every percentage the demo renders must come from the Shariah panel's
// documented screening ratios. The retired 67% and 100% agreement figures are
// deliberately absent: leaving them allowed would silently permit their return.
const ALLOWED_PERCENTAGES = new Set(["18%", "0.6%", "0.4%"]);

// The agreement engine's internal lean. It is not wording this product
// publishes, and must reach neither the verdict headline nor the horizon badge.
const INTERNAL_DIRECTION = /bullish/i;

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

  /*
   * Item 2.15. The value asserted is read from the landing contract rather than
   * written here: backend/tests/testLandingDemoContract.js proves that value is
   * what the real guidance engine derives. This test owns "the card renders the
   * contract"; the backend owns "the contract is correct". Neither restates the
   * other's vocabulary.
   */
  it("renders the canonical public verdict label as the headline", () => {
    render(<ComplianceDemo />);

    const confirmedCard = screen.getByTestId("landing-demo-confirmed");

    expect(within(confirmedCard).getByText("AzaLens Verdict")).toBeInTheDocument();
    expect(
      within(confirmedCard).getByRole("heading", {
        name: confirmedDemoCard.publicLabel.toUpperCase(),
      }),
    ).toBeInTheDocument();
  });

  it("renders the canonical horizon as the badge", () => {
    render(<ComplianceDemo />);

    const confirmedCard = screen.getByTestId("landing-demo-confirmed");

    expect(
      within(confirmedCard).getByText(
        horizonLabel(confirmedDemoCard.horizonToken),
      ),
    ).toBeInTheDocument();
  });

  it("never lets the internal agreement direction become the headline or the badge", () => {
    render(<ComplianceDemo />);

    const confirmedCard = screen.getByTestId("landing-demo-confirmed");

    // Scoped to the verdict row — the headline and the horizon badge sit in the
    // same flex container. "Bullish" elsewhere in the card is legitimate: the
    // Evidence Agreement strip reports family votes, which are evidence, not a
    // published verdict. Only these two slots are forbidden.
    const heading = within(confirmedCard).getByRole("heading", {
      name: confirmedDemoCard.publicLabel.toUpperCase(),
    });
    const verdictRow = heading.parentElement;

    expect(verdictRow).not.toBeNull();
    expect(verdictRow?.textContent ?? "").not.toMatch(INTERNAL_DIRECTION);
    expect(verdictRow?.textContent ?? "").toContain(
      horizonLabel(confirmedDemoCard.horizonToken),
    );
  });

  /*
   * Human review of the first Linux candidates found the 42-character canonical
   * label splitting mid-word — CONSTRU/CTIVE, ESTABLIS/HED — in this card's
   * ~240px column. The landing demo is the only consumer that passes the compact
   * headline scale; the analysis workspace stays on the default.
   */
  it("renders the long canonical label at the compact headline scale", () => {
    render(<ComplianceDemo />);

    const confirmedCard = screen.getByTestId("landing-demo-confirmed");
    const heading = within(confirmedCard).getByRole("heading", {
      name: confirmedDemoCard.publicLabel.toUpperCase(),
    });

    expect(heading.className).toContain("text-2xl");
    expect(heading.className).toContain("sm:text-3xl");
    // `break-words` is what fragmented the label inside words. Its absence here
    // is the correction; wrapping now happens only between words.
    expect(heading.className).not.toContain("break-words");
    expect(heading.className).not.toContain("break-all");
  });

  it("keeps the whole canonical label, never truncated or ellipsized", () => {
    render(<ComplianceDemo />);

    const confirmedCard = screen.getByTestId("landing-demo-confirmed");
    const heading = within(confirmedCard).getByRole("heading", {
      name: confirmedDemoCard.publicLabel.toUpperCase(),
    });

    expect(heading.textContent).toBe(confirmedDemoCard.publicLabel.toUpperCase());
    expect(heading.className).not.toMatch(/truncate|text-ellipsis|line-clamp/);
    expect(heading.textContent).not.toContain("…");
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
    expect(withheldDemoCard.shariah.provider).toBeUndefined();
    expect(confirmedDemoCard.shariah.provider).toBeUndefined();
  });

  /*
   * The scenarios stack at every width, and must keep doing so.
   *
   * `IslamicCompliance` sizes its metric grid from viewport breakpoints, so at
   * viewport >= 1280 it becomes three columns while a side-by-side demo column
   * is capped at 559px by the ProductPreview container — which pushed the
   * "Unavailable" and "0.4% of dividends" badges 48px and 51px outside their
   * cards. A safe side-by-side would need ~1474px of inner width against the
   * ~1142px available, so no breakpoint can rescue it.
   *
   * Geometric containment is proved in a real browser by
   * e2e/landing-visual.spec.ts; jsdom has no layout, so this asserts the
   * structural rule that keeps that containment true.
   */
  it("stacks the two demonstration scenarios at every width", () => {
    const { container } = render(<ComplianceDemo />);
    const grid = container.querySelector(".grid");

    expect(grid).not.toBeNull();
    expect(grid?.className).toMatch(/\bgrid\b/);
    // No multi-column rule at any breakpoint — plain or prefixed.
    expect(grid?.className).not.toMatch(/grid-cols-(?!1\b)\d/);
  });

  it("keeps both demonstration scenarios mounted", () => {
    render(<ComplianceDemo />);

    expect(screen.getByTestId("landing-demo-withheld")).toBeInTheDocument();
    expect(screen.getByTestId("landing-demo-confirmed")).toBeInTheDocument();
  });

  it("renders the Shariah badge text in full, never abbreviated", () => {
    render(<ComplianceDemo />);

    const confirmedCard = screen.getByTestId("landing-demo-confirmed");

    // The two badges that were clipped. Their full text must survive; the
    // browser-level spec proves they also fit inside their cards.
    expect(
      within(confirmedCard).getByText("0.4% of dividends"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("landing-demo-withheld")).getAllByText(
        "Unavailable",
      ).length,
    ).toBeGreaterThan(0);
  });
});

/*
 * Item 2.16. The landing projection is not `AnalysisData`, so `risk` is absent
 * rather than emptied: `risk: {}` type-checks only because every field inside it
 * is optional, and it would assert an assessment that was never made. The real
 * engine cannot derive one from these inputs — it rejects them for want of a
 * current price and an ATR.
 */
describe("landing demo contract shape", () => {
  it("carries no risk member on either card", () => {
    expect("risk" in confirmedDemoCard).toBe(false);
    expect("risk" in withheldDemoCard).toBe(false);
  });

  it("carries no risk value anywhere in the static contract", () => {
    const serialized = JSON.stringify(landingDemoContract);

    for (const forbidden of ["riskLevel", "riskScore", "riskSummary"]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(serialized).not.toMatch(/"(Medium|MEDIUM)"/);
  });

  it("presents the withheld card as withheld rather than as a failed analysis", () => {
    // The honest withheld shape is a gate message plus an unresolved screening
    // status — not a fabricated "Unavailable" risk level, which was a display
    // default the contract never produced.
    expect(withheldDemoCard.withheldMessage).toMatch(/withholds its trade analysis/i);
    expect(withheldDemoCard.shariah.summary?.status).toBe("UNKNOWN");
    expect(JSON.stringify(withheldDemoCard)).not.toContain("Unavailable");
  });

  /*
   * Closes the evidence loop. The backend suite proves the JSON's evidence block
   * is exactly what the guidance engine derives; this proves the object the card
   * actually renders is that block. Rendered evidence is therefore engine-derived
   * transitively, without a cast anywhere in the chain.
   */
  it("renders the evidence the backend derivation was pinned against", () => {
    expect(confirmedDemoCard.evidence).toEqual(
      landingDemoContract.confirmed.presentation.evidence,
    );
  });

  it("renders the same Shariah status the backend derivation was run against", () => {
    // Closes the loop between the engine input recorded in the JSON and the
    // panel the visitor actually sees.
    expect(confirmedDemoCard.shariah.summary?.status).toBe(
      landingDemoContract.confirmed.derivation.shariah.summary.status,
    );
    expect(withheldDemoCard.shariah.summary?.status).toBe(
      landingDemoContract.withheld.derivation.shariah.summary.status,
    );
  });
});
