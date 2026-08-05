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
});
