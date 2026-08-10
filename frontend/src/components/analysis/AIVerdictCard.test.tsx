import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AIVerdictCard from "./AIVerdictCard";

describe("AIVerdictCard Evidence Agreement presentation", () => {
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
      <AIVerdictCard
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

  it("keeps invalidation evidence inside valid definition-list descriptions", () => {
    const { container } = render(
      <AIVerdictCard
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
