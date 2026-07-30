import { describe, expect, it, vi } from "vitest";

import { api } from "./api";
import { runWatchlistScan } from "./scanner";

vi.mock("./api", () => ({
  api: { post: vi.fn() },
}));

describe("scanner service", () => {
  it("posts only the selected symbols", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          generatedAt: "2026-07-30T00:00:00.000Z",
          universe: "WATCHLIST_SELECTION",
          symbolsTouched: 2,
          universeLimit: 20,
          providerCallsPlanned: 2,
          shariahCalls: 0,
          methodology: "Historical observations.",
          disclaimer: "Research only.",
          results: [],
        },
      },
    });

    const scan = await runWatchlistScan(["AAPL", "MSFT"]);

    expect(api.post).toHaveBeenCalledWith("/api/scanner", {
      symbols: ["AAPL", "MSFT"],
    });
    expect(scan.shariahCalls).toBe(0);
  });
});
