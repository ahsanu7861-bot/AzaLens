import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import DashboardPage from "./DashboardPage";
import { getPortfolio } from "../services/portfolio";
import { getWatchlist } from "../services/watchlist";

vi.mock("../services/watchlist", () => ({
  getWatchlist: vi.fn(),
}));

vi.mock("../services/portfolio", () => ({
  getPortfolio: vi.fn(),
}));

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("DashboardPage honesty contract", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows only saved workspace facts and recorded cost basis", async () => {
    vi.mocked(getWatchlist).mockResolvedValue([
      { symbol: "AAPL" },
      { symbol: "MSFT" },
    ]);
    vi.mocked(getPortfolio).mockResolvedValue([
      { symbol: "AAPL", shares: 2, averagePrice: 100 },
      { symbol: "MSFT", shares: 3, averagePrice: 200 },
    ]);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("$800.00")).toBeInTheDocument();
    });

    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.getByText("MSFT")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Not calculated")).toBeInTheDocument();
    expect(screen.queryByText("AI Market Sentiment")).not.toBeInTheDocument();
    expect(screen.queryByText("Upcoming Reports")).not.toBeInTheDocument();
    expect(getWatchlist).toHaveBeenCalledTimes(1);
    expect(getPortfolio).toHaveBeenCalledTimes(1);
  });
});
