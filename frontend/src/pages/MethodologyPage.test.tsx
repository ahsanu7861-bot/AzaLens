import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { ThemeContext } from "../app/providers/theme";
import MethodologyPage from "./MethodologyPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <ThemeContext.Provider
        value={{
          preference: "system",
          resolvedTheme: "night",
          setPreference: () => undefined,
        }}
      >
        <MethodologyPage />
      </ThemeContext.Provider>
    </MemoryRouter>,
  );
}

describe("MethodologyPage truthfulness contract", () => {
  it("states the Shariah source, selected methodology and non-endorsement boundary", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: "Methodology & limitations" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Halal Terminal supplies/i)).toBeInTheDocument();
    expect(screen.getByText(/sole displayed Shariah methodology/i)).toBeInTheDocument();
    expect(screen.getByText(/not affiliated with or endorsed by AAOIFI/i)).toBeInTheDocument();
  });

  it("publishes the provider methodology and official AAOIFI source links", () => {
    renderPage();

    expect(screen.getByRole("link", { name: /provider methodology/i })).toHaveAttribute(
      "href",
      "https://www.halalterminal.com/methodology",
    );
    expect(screen.getByRole("link", { name: /official standards list/i })).toHaveAttribute(
      "href",
      "https://aaoifi.com/shariah-standards-3/?lang=en",
    );
  });

  it("states the fail-closed, freshness and purification boundaries", () => {
    renderPage();

    expect(screen.getByText(/produces a withheld result rather than a guess/i)).toBeInTheDocument();
    expect(screen.getByText(/cached for up to 24 hours/i)).toBeInTheDocument();
    expect(screen.getByText(/older than seven days as stale/i)).toBeInTheDocument();
    expect(screen.getByText(/does not calculate an investor's personal/i)).toBeInTheDocument();
  });

  it("does not overclaim the frozen risk compatibility behavior", () => {
    renderPage();

    expect(screen.getByText(/not empirically calibrated or validated/i)).toBeInTheDocument();
    expect(screen.getByText(/Contractual governance is not proof of accuracy/i)).toBeInTheDocument();
  });

  it("states that the page is research, not advice, execution or a fatwa", () => {
    renderPage();

    expect(screen.getByText(/It is not investment advice/i)).toBeInTheDocument();
    expect(screen.getByText(/does not execute trades/i)).toBeInTheDocument();
    expect(screen.getByText(/a fatwa or a personal religious ruling/i)).toBeInTheDocument();
  });
});
