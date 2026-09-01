import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import CompanyOverview from "./CompanyOverview";

describe("private-personal market truthfulness", () => {
  it("renders consolidation uncertainty and broker verification from provenance", () => {
    render(
      <CompanyOverview
        symbol="AAPL"
        market={{
          success: true,
          provider: "Finnhub",
          data: { symbol: "AAPL", company: "Apple", currency: "USD", price: 100 },
          provenance: {
            state: "REALTIME_CONSOLIDATION_UNVERIFIED",
            underlyingState: "REALTIME_CONSOLIDATION_UNVERIFIED",
            provider: "Finnhub",
            sourceTimestamp: "2026-09-01T20:00:00.000Z",
            retrievalTimestamp: "2026-09-01T20:00:01.000Z",
            cache: { state: "MISS", ageSeconds: 0 },
            interval: null,
            displayEntitlement: "PRIVATE_PERSONAL_OWNER_ONLY",
            brokerVerificationRequired: true,
            limitations: ["Consolidation unverified."],
          },
        }}
      />,
    );

    expect(screen.getByText(/Real-time provider quote · consolidation unverified/i)).toBeInTheDocument();
    expect(screen.getByText(/Verify the executable price in your broker before acting/i)).toBeInTheDocument();
    expect(screen.queryByText(/NBBO quote|consolidated quote/i)).not.toBeInTheDocument();
  });
});
