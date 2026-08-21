import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import MethodologyPage from "./MethodologyPage";

function renderPage() {
  render(<MemoryRouter><MethodologyPage /></MemoryRouter>);
}

describe("MethodologyPage", () => {
  it("publishes the current contract without claiming a verified external edition", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Methodology & Limitations" })).toBeInTheDocument();
    expect(screen.getByText(/internal Shariah response contract is version 0\.5\.0/i)).toBeInTheDocument();
    expect(screen.getByText(/independently implements AAOIFI Shari’ah Standard No\. 21/i)).toBeInTheDocument();
    expect(screen.getByText(/no AAOIFI accreditation, endorsement, or formal relationship/i)).toBeInTheDocument();
    expect(screen.getByText(/precise edition or revision is not exposed or verified/i)).toBeInTheDocument();
  });

  it("distinguishes local research boundaries from a religious ruling", () => {
    renderPage();
    expect(screen.getByText(/debt above 30% of assets/i)).toBeInTheDocument();
    expect(screen.getByText(/impermissible income above 5%/i)).toBeInTheDocument();
    expect(screen.getByText(/not a reproduction of the provider’s complete screening methodology/i)).toBeInTheDocument();
  });

  it("states freshness, horizon, purification and authority limits", () => {
    renderPage();
    expect(screen.getByText(/cached for 24 hours/i)).toBeInTheDocument();
    expect(screen.getByText(/older than 7 days/i)).toBeInTheDocument();
    expect(screen.getByText(/2–10 trading sessions/i)).toBeInTheDocument();
    expect(screen.getByText(/does not calculate an investor’s personal cash obligation/i)).toBeInTheDocument();
    expect(screen.getByText(/not a fatwa/i)).toBeInTheDocument();
  });
});
