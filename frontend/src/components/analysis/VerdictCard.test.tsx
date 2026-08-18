import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  EVIDENCE_STATES,
  EVIDENCE_FAMILY_IDS,
  EXPECTED_EVIDENCE_FAMILIES,
  type EvidenceAgreement,
  type EvidenceFamily,
  type FamilyVote,
} from "../../types/analysis";
import VerdictCard from "./VerdictCard";

/*
 * The frontend declares the wire vocabulary independently of the backend: it
 * cannot import backend/analysis/agreement/agreementEngine.js, which is CommonJS
 * and server-only. Both sides therefore pin the same literals in their own suite,
 * written out longhand — importing the constant and comparing it to itself would
 * assert nothing.
 */
describe("evidence-state wire vocabulary", () => {
  it("declares exactly the eight approved wire strings, in order", () => {
    expect([...EVIDENCE_STATES]).toEqual([
      "Evidence unavailable",
      "Insufficient evidence",
      "No directional evidence",
      "Conflicting evidence",
      "Limited evidence",
      "Low agreement",
      "Moderate agreement",
      "High agreement",
    ]);
  });

  it("contains no duplicates and fixes the denominator at four", () => {
    expect(new Set(EVIDENCE_STATES).size).toBe(EVIDENCE_STATES.length);
    expect(EXPECTED_EVIDENCE_FAMILIES).toBe(4);
    expect([...EVIDENCE_FAMILY_IDS]).toEqual([
      "trendPosition",
      "momentum",
      "priceAction",
      "volumeFlow",
    ]);
  });
});

function family(
  id: string,
  label: string,
  vote: FamilyVote,
  members: Array<[string, FamilyVote]>,
): EvidenceFamily {
  return { id, label, vote, members: members.map(([name, v]) => ({ name, vote: v })) };
}

function evidence(overrides: Partial<EvidenceAgreement> = {}): EvidenceAgreement {
  return {
    state: "Moderate agreement",
    support: {
      direction: "BULLISH",
      supportingFamilies: 3,
      opposingFamilies: 0,
      neutralFamilies: 1,
    },
    coverage: {
      usableFamilies: 4,
      expectedFamilies: 4,
      unavailableFamilies: 0,
      families: [
        family("trendPosition", "Trend position", "BULLISH", [
          ["EMA", "BULLISH"],
          ["SMA", "BULLISH"],
          ["Bollinger Bands", "BEARISH"],
        ]),
        family("momentum", "Momentum", "BULLISH", [
          ["RSI", "BULLISH"],
          ["MACD", "BULLISH"],
        ]),
        family("priceAction", "Price action", "NEUTRAL", [["Candlestick", "NEUTRAL"]]),
        family("volumeFlow", "Volume flow", "BULLISH", [["OBV", "BULLISH"]]),
      ],
    },
    summary: "3 of 4 evidence families support a bullish lean.",
    ...overrides,
  };
}

function region() {
  return screen.getByRole("region", { name: "Evidence Agreement" });
}

describe("VerdictCard Evidence Agreement presentation", () => {
  it("labels the Evidence Agreement region and lists all four families", () => {
    render(<VerdictCard direction="Constructive" evidence={evidence()} />);

    const view = region();
    const items = within(view).getAllByRole("listitem");
    expect(items).toHaveLength(4);

    for (const label of ["Trend position", "Momentum", "Price action", "Volume flow"]) {
      expect(within(view).getByText(label)).toBeInTheDocument();
    }
  });

  it("exposes each family state programmatically as '{family}: {state}'", () => {
    render(<VerdictCard direction="Constructive" evidence={evidence()} />);
    const view = region();

    expect(within(view).getByLabelText("Trend position: Bullish")).toBeInTheDocument();
    expect(within(view).getByLabelText("Momentum: Bullish")).toBeInTheDocument();
    expect(within(view).getByLabelText("Price action: Neutral")).toBeInTheDocument();
    expect(within(view).getByLabelText("Volume flow: Bullish")).toBeInTheDocument();
  });

  it("renders the synthesis and coverage as real text", () => {
    render(<VerdictCard direction="Constructive" evidence={evidence()} />);
    const view = region();

    expect(
      within(view).getByText("3 of 4 evidence families support a bullish lean."),
    ).toBeInTheDocument();
    expect(within(view).getByText("4 of 4 evidence families usable.")).toBeInTheDocument();
  });

  it.each([
    ["directional", "Moderate agreement", "3 of 4 evidence families support a bullish lean."],
    ["limited evidence", "Limited evidence", "2 of 4 evidence families support a bullish lean. 2 families are unavailable."],
    ["no directional evidence", "No directional evidence", "All 4 usable evidence families are neutral; none expresses a direction."],
    ["conflicting", "Conflicting evidence", "Directional evidence is split 2 against 2."],
    ["insufficient", "Insufficient evidence", "Only 1 of 4 evidence families is usable — not enough to assess agreement."],
    ["unavailable", "Evidence unavailable", "No evidence families are usable for this analysis."],
  ])("renders the %s state verbatim with its synthesis", (_label, state, summary) => {
    render(
      <VerdictCard
        direction="Mixed"
        evidence={evidence({ state, summary })}
      />,
    );

    const view = region();
    expect(within(view).getByText(state)).toBeInTheDocument();
    expect(within(view).getByText(summary)).toBeInTheDocument();
  });

  it("never renders a percentage in the Evidence Agreement region", () => {
    for (const state of EVIDENCE_STATES) {
      const { unmount } = render(
        <VerdictCard direction="Mixed" evidence={evidence({ state })} />,
      );
      expect(region().textContent ?? "").not.toMatch(/%/);
      expect(region().textContent ?? "").not.toMatch(/confidence/i);
      unmount();
    }
  });

  it("uses no progressbar and no aria-valuenow", () => {
    const { container } = render(
      <VerdictCard direction="Constructive" evidence={evidence()} />,
    );

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(container.querySelector("[aria-valuenow]")).toBeNull();
    expect(container.querySelector("[role='progressbar']")).toBeNull();
  });

  it("never falls back to 0% when no evidence is supplied", () => {
    const { container } = render(<VerdictCard direction="Analysis Limited" />);

    expect(container.textContent ?? "").not.toMatch(/0%/);
    expect(container.textContent ?? "").not.toMatch(/%/);
    expect(
      screen.getByText("No evidence assessment was supplied by the analysis API."),
    ).toBeInTheDocument();
  });

  it("shows an unavailable family as unavailable rather than neutral", () => {
    const limited = evidence({
      state: "Limited evidence",
      support: { direction: "BULLISH", supportingFamilies: 2, opposingFamilies: 0, neutralFamilies: 0 },
      coverage: {
        usableFamilies: 2,
        expectedFamilies: 4,
        unavailableFamilies: 2,
        families: [
          family("trendPosition", "Trend position", "BULLISH", [["EMA", "BULLISH"]]),
          family("momentum", "Momentum", "BULLISH", [["RSI", "BULLISH"], ["MACD", "BULLISH"]]),
          family("priceAction", "Price action", "UNAVAILABLE", [["Candlestick", "UNAVAILABLE"]]),
          family("volumeFlow", "Volume flow", "UNAVAILABLE", [["OBV", "UNAVAILABLE"]]),
        ],
      },
      summary: "2 of 4 evidence families support a bullish lean. 2 families are unavailable.",
    });

    render(<VerdictCard direction="Unconfirmed" evidence={limited} />);
    const view = region();

    expect(within(view).getByLabelText("Price action: Unavailable")).toBeInTheDocument();
    expect(within(view).getByLabelText("Volume flow: Unavailable")).toBeInTheDocument();
    expect(within(view).getByText("2 of 4 evidence families usable.")).toBeInTheDocument();
  });

  it("does not rely on colour alone: every family state carries its word", () => {
    render(<VerdictCard direction="Constructive" evidence={evidence()} />);
    const view = region();

    expect(within(view).getAllByText("Bullish").length).toBeGreaterThan(0);
    expect(within(view).getByText("Neutral")).toBeInTheDocument();
  });

  it("keeps invalidation evidence inside valid definition-list descriptions", () => {
    const { container } = render(
      <VerdictCard
        direction="Bullish"
        evidence={evidence()}
        invalidation={{
          status: "intact",
          technical: "Price remains above support.",
          fundamental: "Risk boundaries remain intact.",
          evidence: {
            technical: { status: "intact", evidence: "Technical evidence note." },
            fundamental: { status: "intact", evidence: "Fundamental evidence note." },
          },
        }}
      />,
    );

    const definitionList = container.querySelector("dl");
    expect(definitionList).not.toBeNull();
    expect(definitionList?.querySelector("p")).toBeNull();
    expect(screen.getByText("Technical evidence note.").tagName).toBe("DD");
    expect(screen.getByText("Fundamental evidence note.").tagName).toBe("DD");
  });

  it("introduces no transaction language", () => {
    const { container } = render(
      <VerdictCard direction="Constructive" evidence={evidence()} />,
    );
    expect(container.textContent ?? "").not.toMatch(/\b(?:buy|sell|hold)\b/i);
  });
});

/*
 * Headline presentation contract.
 *
 * The canonical public labels are long — "Constructive — Upside Evidence
 * Established" is 42 characters — and the landing demonstration renders this card
 * in a column roughly 240px wide. At the standard size `break-words` engaged
 * inside words there and split the label as CONSTRU/CTIVE and ESTABLIS/HED.
 *
 * These tests hold the two properties that matter: the default is unchanged, and
 * the compact variant cannot fix wrapping by damaging the label instead.
 */
const CANONICAL_LABEL = "Constructive — Upside Evidence Established";

// The exact className the headline carried before `headlineScale` existed.
const STANDARD_HEADLINE_CLASSES =
  "break-words font-display text-4xl font-bold tracking-tight sm:text-5xl";

function headlineOf(container: HTMLElement) {
  const heading = container.querySelector("h2");
  if (!heading) throw new Error("VerdictCard rendered no headline");
  return heading;
}

describe("VerdictCard headline scale", () => {
  it("renders the established standard classes when the prop is omitted", () => {
    const { container } = render(<VerdictCard direction={CANONICAL_LABEL} />);

    for (const className of STANDARD_HEADLINE_CLASSES.split(" ")) {
      expect(headlineOf(container).className).toContain(className);
    }
  });

  it("renders an identical headline whether the default is omitted or explicit", () => {
    const omitted = render(<VerdictCard direction={CANONICAL_LABEL} />);
    const explicit = render(
      <VerdictCard direction={CANONICAL_LABEL} headlineScale="standard" />,
    );

    expect(headlineOf(omitted.container).outerHTML).toBe(
      headlineOf(explicit.container).outerHTML,
    );
  });

  it("drops a type size and stops breaking inside words when compact", () => {
    const { container } = render(
      <VerdictCard direction={CANONICAL_LABEL} headlineScale="compact" />,
    );
    const headline = headlineOf(container);

    expect(headline.className).toContain("text-2xl");
    expect(headline.className).toContain("sm:text-3xl");

    // The cause of the mid-word split. Its absence is the whole correction.
    expect(headline.className).not.toContain("break-words");
    expect(headline.className).not.toContain("break-all");
  });

  it("never breaks inside a word in either variant", () => {
    for (const scale of ["standard", "compact"] as const) {
      const { container } = render(
        <VerdictCard direction={CANONICAL_LABEL} headlineScale={scale} />,
      );
      // `break-all` splits at any character; `break-words` only as a last resort.
      // Neither variant may use the former, and compact may use neither.
      expect(headlineOf(container).className).not.toMatch(/\bbreak-all\b/);
    }
  });

  it("renders the whole canonical label, never truncated or ellipsized", () => {
    for (const scale of ["standard", "compact"] as const) {
      const { container } = render(
        <VerdictCard direction={CANONICAL_LABEL} headlineScale={scale} />,
      );
      const headline = headlineOf(container);

      expect(headline.textContent).toBe(CANONICAL_LABEL.toUpperCase());
      expect(headline.className).not.toMatch(/truncate|text-ellipsis|line-clamp/);
      expect(headline.textContent).not.toContain("…");
      expect(headline.textContent).not.toContain("...");
    }
  });

  it("changes nothing outside the headline", () => {
    const standard = render(<VerdictCard direction={CANONICAL_LABEL} />);
    const compact = render(
      <VerdictCard direction={CANONICAL_LABEL} headlineScale="compact" />,
    );

    const strip = (root: HTMLElement) => {
      const clone = root.cloneNode(true) as HTMLElement;
      clone.querySelector("h2")?.remove();
      return clone.innerHTML;
    };

    expect(strip(compact.container)).toBe(strip(standard.container));
  });
});
