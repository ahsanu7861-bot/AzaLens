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
            capability: "QUOTE",
            provider: "Finnhub",
            source_observation: "REALTIME",
            venue_scope: "CONSOLIDATION_UNVERIFIED",
            interval: null,
            observed_at: "2026-09-01T20:00:00.000Z",
            delivery_state: "MISS",
            retrieved_at: "2026-09-01T20:00:01.000Z",
            original_retrieved_at: "2026-09-01T20:00:01.000Z",
            age_seconds: 0,
            freshness_threshold_seconds: 20,
            usable: true,
            entitlement_display: "UNRESOLVED",
            entitlement_analysis: "UNRESOLVED",
            entitlement_storage: "UNRESOLVED",
            entitlement_attribution: "UNRESOLVED",
            entitlement_authority: "UNKNOWN",
            entitlement_assessed_at: "2026-09-01T20:00:00.000Z",
            authority_reference: "unknown",
            limitation_codes: [
              "BROKER_VERIFICATION_REQUIRED",
              "CONSOLIDATION_UNVERIFIED",
              "ENTITLEMENT_UNRESOLVED",
            ],
          },
        }}
      />,
    );

    expect(screen.getByText(/Real-time provider quote · consolidation unverified/i)).toBeInTheDocument();
    expect(screen.getByText(/Verify the executable price in your broker before acting/i)).toBeInTheDocument();
    expect(screen.queryByText(/NBBO quote|consolidated quote/i)).not.toBeInTheDocument();
  });
});
