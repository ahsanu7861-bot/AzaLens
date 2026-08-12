import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  EVIDENCE_STATES,
  GRADED_EVIDENCE_STATES,
  LIMITED_EVIDENCE_STATE,
} from "../../types/analysis";
import VerdictCard from "./VerdictCard";

/*
 * The frontend declares the seven wire values independently of the backend: it
 * cannot import backend/analysis/agreement/agreementEngine.js, which is CommonJS
 * and server-only. There is therefore no shared cross-language source to trust.
 *
 * What replaces that trust is symmetry: this suite pins the exact strings from
 * the frontend side, and backend/tests/testEvidenceAgreementContract.js pins the
 * same strings from the backend side. Either declaration drifting alone fails its
 * own suite. These literals are written out on purpose - importing the constant
 * and comparing it to itself would assert nothing.
 */
describe("evidence-state wire vocabulary", () => {
  it("declares exactly the seven approved wire strings, in order", () => {
    expect([...EVIDENCE_STATES]).toEqual([
      "Evidence unavailable",
      "No directional evidence",
      "Conflicting evidence",
      "Limited evidence",
      "Low agreement",
      "Moderate agreement",
      "High agreement",
    ]);
  });

  it("contains no duplicate wire values", () => {
    expect(new Set(EVIDENCE_STATES).size).toBe(EVIDENCE_STATES.length);
  });

  it("grades only the three states that assert how strongly evidence agrees", () => {
    expect([...GRADED_EVIDENCE_STATES]).toEqual([
      "High agreement",
      "Moderate agreement",
      "Low agreement",
    ]);

    for (const graded of GRADED_EVIDENCE_STATES) {
      expect(EVIDENCE_STATES).toContain(graded);
    }
  });

  it("degrades an unsupported grade to a declared state, not invented wording", () => {
    expect(LIMITED_EVIDENCE_STATE).toBe("Limited evidence");
    expect(EVIDENCE_STATES).toContain(LIMITED_EVIDENCE_STATE);
  });
});

describe("VerdictCard Evidence Agreement presentation", () => {
  it.each([
    ["Limited evidence", 44, 4, 9],
    ["No directional evidence", 35, 9, 9],
    ["Conflicting evidence", 50, 9, 9],
  ])("shows %s as a domain state, not a confidence tier", (
    evidenceState,
    confidence,
    availableIndicators,
    expectedIndicators,
  ) => {
    render(
      <VerdictCard
        direction="Mixed"
        confidence={confidence}
        evidenceState={evidenceState}
        availableIndicators={availableIndicators}
        expectedIndicators={expectedIndicators}
      />,
    );

    expect(screen.getByText("Evidence Agreement")).toBeInTheDocument();
    expect(screen.getByText(evidenceState)).toBeInTheDocument();
    expect(
      screen.getByText(`${availableIndicators} of ${expectedIndicators} indicators available. Not a probability or performance guarantee.`),
    ).toBeInTheDocument();
    expect(screen.queryByText(/confidence$/i)).not.toBeInTheDocument();
  });

  /*
   * Temporary PR 1B presentation safeguards. A graded label may appear only when
   * the evidence behind it is complete and directional. These assertions read the
   * rendered output, so they prove what a user actually sees.
   */
  const GRADES = /\b(High|Moderate|Low) agreement\b/;

  it("preserves current behaviour for complete directional evidence", () => {
    render(
      <VerdictCard
        direction="Constructive"
        confidence={74}
        evidenceState="Moderate agreement"
        availableIndicators={9}
        expectedIndicators={9}
      />,
    );

    expect(screen.getByText("Moderate agreement")).toBeInTheDocument();
    // The percentage itself is untouched by the safeguard.
    expect(screen.getByText("74%")).toBeInTheDocument();
  });

  it.each([
    ["High agreement", 80],
    ["Moderate agreement", 60],
    ["Low agreement", 30],
  ])("never shows %s when coverage is incomplete", (evidenceState, confidence) => {
    render(
      <VerdictCard
        direction="Constructive"
        confidence={confidence}
        evidenceState={evidenceState}
        availableIndicators={4}
        expectedIndicators={9}
      />,
    );

    expect(screen.queryByText(GRADES)).not.toBeInTheDocument();
    expect(screen.getByText("Limited evidence")).toBeInTheDocument();
    // The underlying number is still reported verbatim - only wording changed.
    expect(screen.getByText(`${confidence}%`)).toBeInTheDocument();
  });

  it.each([
    ["No directional evidence"],
    ["Conflicting evidence"],
    ["Limited evidence"],
  ])("renders the backend state %s verbatim and never grades it", (evidenceState) => {
    render(
      <VerdictCard
        direction="Mixed"
        confidence={50}
        evidenceState={evidenceState}
        availableIndicators={9}
        expectedIndicators={9}
      />,
    );

    expect(screen.getByText(evidenceState)).toBeInTheDocument();
    expect(screen.queryByText(GRADES)).not.toBeInTheDocument();
  });

  it.each([
    [undefined, undefined, undefined, "Awaiting evidence"],
    ["", undefined, undefined, "Awaiting evidence"],
    ["   ", undefined, undefined, "Awaiting evidence"],
    [undefined, 4, 9, "Limited evidence"],
  ])(
    "fails closed for missing or malformed evidence state (%j)",
    (evidenceState, available, expected, label) => {
      render(
        <VerdictCard
          direction="Constructive"
          confidence={92}
          evidenceState={evidenceState as string | undefined}
          availableIndicators={available as number | undefined}
          expectedIndicators={expected as number | undefined}
        />,
      );

      // A high percentage alone must never be promoted into a grade.
      expect(screen.queryByText(GRADES)).not.toBeInTheDocument();
      expect(screen.getByText(label)).toBeInTheDocument();
    },
  );

  it("cannot turn incomplete evidence into a permissive conclusion", () => {
    render(
      <VerdictCard
        direction="Constructive"
        confidence={99}
        evidenceState="High agreement"
        availableIndicators={1}
        expectedIndicators={9}
      />,
    );

    const view = screen.getByText("Limited evidence");
    expect(view).toBeInTheDocument();
    expect(screen.queryByText(GRADES)).not.toBeInTheDocument();
    // No transaction command is introduced by the safeguard.
    expect(document.body.textContent).not.toMatch(/\b(?:buy|sell|hold)\b/i);
  });

  it("keeps invalidation evidence inside valid definition-list descriptions", () => {
    const { container } = render(
      <VerdictCard
        direction="Bullish"
        confidence={60}
        invalidation={{
          status: "intact",
          technical: "Price remains above support.",
          fundamental: "Risk boundaries remain intact.",
          evidence: {
            technical: {
              status: "intact",
              evidence: "Technical evidence note.",
            },
            fundamental: {
              status: "intact",
              evidence: "Fundamental evidence note.",
            },
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
});
