import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const services = vi.hoisted(() => ({
  addToWatchlist: vi.fn(), getWatchlist: vi.fn(), removeFromWatchlist: vi.fn(),
  addHolding: vi.fn(), getPortfolio: vi.fn(), removeHolding: vi.fn(), updateHolding: vi.fn(),
}));

vi.mock("../services/watchlist", () => services);
vi.mock("../services/portfolio", () => services);
vi.mock("../components/equities/EquitySearchBox", () => ({
  default: ({ onSelect }: { onSelect: (stock: { symbol: string }) => void }) => (
    <button type="button" onClick={() => onSelect({ symbol: "TWELVECHARS1" })}>Choose fixture stock</button>
  ),
}));

import PortfolioPage from "./PortfolioPage";
import WatchlistPage from "./WatchlistPage";

describe("personal persistence limit messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    services.getWatchlist.mockResolvedValue([]);
    services.getPortfolio.mockResolvedValue([]);
  });

  it("renders the watchlist 100-stock cap message", async () => {
    services.addToWatchlist.mockRejectedValue(new Error("Your watchlist is limited to 100 stocks."));
    render(<MemoryRouter><WatchlistPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Choose fixture stock" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Your watchlist is limited to 100 stocks.");
  });

  it("renders the portfolio 50-holding cap message", async () => {
    services.addHolding.mockRejectedValue(new Error("Your portfolio is limited to 50 current holdings."));
    render(<MemoryRouter><PortfolioPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Choose fixture stock" }));
    const [shares, averagePrice] = screen.getAllByRole("spinbutton");
    fireEvent.change(shares, { target: { value: "1" } });
    fireEvent.change(averagePrice, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Add holding" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Your portfolio is limited to 50 current holdings."));
  });
});
