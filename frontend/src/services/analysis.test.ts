import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { getStockAnalysis } from "./analysis";

vi.mock("./api", () => ({
  api: {
    get: vi.fn(),
  },
}));

const completeAnalysis = {
  market: {},
  indicators: {},
  fundamentals: {},
  risk: {},
  shariah: {},
  explanation: {},
};

describe("getStockAnalysis runtime contract", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it("accepts a successful response containing all six workspaces", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        success: true,
        data: completeAnalysis,
      },
    });

    await expect(getStockAnalysis(" aapl ")).resolves.toBe(
      completeAnalysis,
    );
    expect(api.get).toHaveBeenCalledWith(
      "/api/analyze/AAPL",
      expect.any(Object),
    );
  });

  it("rejects success responses missing a required workspace", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { shariah: _missing, ...incompleteAnalysis } =
      completeAnalysis;

    vi.mocked(api.get).mockResolvedValue({
      data: {
        success: true,
        data: incompleteAnalysis,
      },
    });

    await expect(getStockAnalysis("AAPL")).rejects.toThrow(
      "invalid analysis response",
    );
    consoleError.mockRestore();
  });
});
