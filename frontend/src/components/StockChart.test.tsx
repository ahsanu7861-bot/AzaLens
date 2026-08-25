import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import StockChart from "./StockChart";
import { ThemeContext } from "../app/providers/theme";

/*
 * B7b. These tests exist for one question: does the Twelve Data credit describe
 * the response actually on screen, and nothing else?
 *
 * lightweight-charts is mocked because jsdom has no canvas and no layout, so
 * createChart cannot run. The mock is deliberately minimal - the chart's
 * drawing is not under test here, its ATTRIBUTION is - and it returns just
 * enough surface for the chart effect to complete without touching the DOM it
 * would normally rasterise into.
 */
vi.mock("lightweight-charts", () => {
  const series = {
    setData: vi.fn(),
    priceScale: () => ({ applyOptions: vi.fn() }),
  };

  return {
    createChart: vi.fn(() => ({
      addSeries: vi.fn(() => series),
      timeScale: () => ({ fitContent: vi.fn() }),
      applyOptions: vi.fn(),
      resize: vi.fn(),
      remove: vi.fn(),
    })),
    CandlestickSeries: "Candlestick",
    HistogramSeries: "Histogram",
    LineSeries: "Line",
    ColorType: { Solid: "solid" },
    CrosshairMode: { Normal: 0 },
  };
});

const APPROVED_TEXT = "Data provided by Twelve Data";
const APPROVED_HREF = "https://twelvedata.com";
const TRADINGVIEW_TEXT = "TradingView Lightweight Charts™";

const BARS = [
  { date: "2026-08-01", open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
  { date: "2026-08-02", open: 1.5, high: 2.5, low: 1, close: 2, volume: 12 },
];

function renderChart(symbol = "AAPL") {
  return render(
    <ThemeContext.Provider
      value={{
        preference: "night",
        resolvedTheme: "night",
        setPreference: vi.fn(),
      }}
    >
      <StockChart symbol={symbol} />
    </ThemeContext.Provider>,
  );
}

function respondWith(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  });
}

function successBody(provider?: unknown) {
  const body: Record<string, unknown> = {
    success: true,
    symbol: "AAPL",
    interval: "1day",
    bars: BARS,
  };

  if (arguments.length > 0) {
    body.provider = provider;
  }

  return body;
}

function twelveDataLink() {
  return screen.queryByRole("link", { name: APPROVED_TEXT });
}

/*
 * ResizeObserver is installed once, permanently, at module scope - NOT stubbed
 * per test and torn down in afterEach.
 *
 * The chart effect runs in a passive effect after the fetch resolves, which is a
 * later tick than the assertion most of these tests await. A per-test stub
 * removed in afterEach could therefore be gone by the time React flushed that
 * effect, and `new ResizeObserver(...)` in StockChart.tsx threw
 * "ResizeObserver is not defined" during teardown. It was timing-dependent:
 * green locally, red on slower CI. A permanent global has no such window, and
 * vi.unstubAllGlobals() below cannot remove it because it was never stubbed.
 */
class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver =
  TestResizeObserver as unknown as typeof globalThis.ResizeObserver;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("StockChart attributes the provider the response declared", () => {
  it("renders the exact approved wording and href for TwelveData", async () => {
    vi.stubGlobal("fetch", respondWith(successBody("TwelveData")));
    renderChart();

    const link = await screen.findByRole("link", { name: APPROVED_TEXT });

    expect(link).toHaveTextContent(APPROVED_TEXT);
    expect(link).toHaveAttribute("href", APPROVED_HREF);
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("keeps the two credits as separate anchors and separate statements", async () => {
    vi.stubGlobal("fetch", respondWith(successBody("TwelveData")));
    renderChart();

    const twelveData = await screen.findByRole("link", { name: APPROVED_TEXT });
    const tradingView = screen.getByRole("link", { name: TRADINGVIEW_TEXT });

    expect(twelveData).not.toBe(tradingView);
    expect(twelveData.contains(tradingView)).toBe(false);
    expect(tradingView.contains(twelveData)).toBe(false);

    // Distinct statements: neither anchor's text mentions the other's service.
    expect(twelveData.textContent).not.toMatch(/chart|TradingView/i);
    expect(tradingView.textContent).not.toMatch(/Twelve Data|data provided/i);
  });

  it("renders exactly one Twelve Data statement", async () => {
    vi.stubGlobal("fetch", respondWith(successBody("TwelveData")));
    const { container } = renderChart();

    await screen.findByRole("link", { name: APPROVED_TEXT });

    const occurrences = (container.textContent ?? "").split(APPROVED_TEXT)
      .length - 1;
    expect(occurrences).toBe(1);
    expect(
      container.querySelectorAll(`a[href="${APPROVED_HREF}"]`),
    ).toHaveLength(1);
  });

  it("carries no crawl-blocking rel token", async () => {
    vi.stubGlobal("fetch", respondWith(successBody("TwelveData")));
    renderChart();

    const link = await screen.findByRole("link", { name: APPROVED_TEXT });
    const tokens = (link.getAttribute("rel") ?? "").split(/\s+/).filter(Boolean);

    expect(tokens).toContain("noreferrer");
    expect(tokens).not.toContain("nofollow");
    expect(tokens).not.toContain("ugc");
    expect(tokens).not.toContain("sponsored");
  });
});

describe("StockChart never invents provenance", () => {
  /*
   * Each case renders BARS successfully. The chart is on screen; the Twelve
   * Data credit must not be. That combination is the whole point: attribution
   * follows what the response said, not the fact that a chart exists.
   */
  const unattributed: Array<[string, unknown]> = [
    ["a different provider", "Finnhub"],
    ["the backend's miss label", "Unknown"],
    ["a differently cased label", "twelvedata"],
    ["a spaced label", "Twelve Data"],
    ["a snake_case id", "twelve_data"],
    ["a blank string", "   "],
    ["an explicit null", null],
    ["a non-string value", 42],
  ];

  for (const [description, provider] of unattributed) {
    it(`renders bars but no attribution for ${description}`, async () => {
      vi.stubGlobal("fetch", respondWith(successBody(provider)));
      renderChart();

      await waitFor(() => {
        expect(
          screen.getByRole("link", { name: TRADINGVIEW_TEXT }),
        ).toBeInTheDocument();
      });
      await waitFor(() => {
        expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
      });

      expect(twelveDataLink()).toBeNull();
    });
  }

  it("renders no attribution when the field is absent entirely", async () => {
    vi.stubGlobal("fetch", respondWith(successBody()));
    renderChart();

    await waitFor(() => {
      expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
    });

    expect(twelveDataLink()).toBeNull();
  });
});

describe("StockChart hides attribution whenever the bars are hidden", () => {
  it("renders no attribution while loading", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    renderChart();

    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
    expect(twelveDataLink()).toBeNull();
  });

  it("renders no attribution in the error state", async () => {
    vi.stubGlobal(
      "fetch",
      respondWith({ success: false, error: "boom" }),
    );
    renderChart();

    await screen.findByText("boom");

    expect(twelveDataLink()).toBeNull();
  });

  it("renders no attribution when a success carries zero bars", async () => {
    vi.stubGlobal(
      "fetch",
      respondWith({
        success: true,
        symbol: "AAPL",
        interval: "1day",
        provider: "TwelveData",
        bars: [],
      }),
    );
    renderChart();

    await waitFor(() => {
      expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
    });

    expect(twelveDataLink()).toBeNull();
  });

  /*
   * The transition case, and the reason B2 needs `!loading` as well as a
   * resolved provenance. `history` still holds the previous symbol's response
   * while the next one is in flight - bars and provider together, never apart -
   * so without the loading term the old credit would stay on screen with no
   * bars visible to credit.
   */
  it("drops the previous symbol's attribution while the next load is pending", async () => {
    const pending = new Promise<never>(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => successBody("TwelveData"),
      })
      .mockImplementationOnce(() => pending);
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = renderChart("AAPL");
    await screen.findByRole("link", { name: APPROVED_TEXT });

    rerender(
      <ThemeContext.Provider
        value={{
          preference: "night",
          resolvedTheme: "night",
          setPreference: vi.fn(),
        }}
      >
        <StockChart symbol="MSFT" />
      </ThemeContext.Provider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Loading MSFT/i)).toBeInTheDocument();
    });

    expect(twelveDataLink()).toBeNull();
    expect(
      screen.getByRole("link", { name: TRADINGVIEW_TEXT }),
    ).toBeInTheDocument();
  });
});

describe("StockChart keeps the TradingView credit unconditional", () => {
  it("renders it while loading", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    renderChart();

    expect(
      screen.getByRole("link", { name: TRADINGVIEW_TEXT }),
    ).toBeInTheDocument();
  });

  it("renders it in the error state", async () => {
    vi.stubGlobal("fetch", respondWith({ success: false, error: "boom" }));
    renderChart();

    await screen.findByText("boom");

    expect(
      screen.getByRole("link", { name: TRADINGVIEW_TEXT }),
    ).toBeInTheDocument();
  });

  it("renders it on success, unchanged in wording and target", async () => {
    vi.stubGlobal("fetch", respondWith(successBody("TwelveData")));
    renderChart();

    await screen.findByRole("link", { name: APPROVED_TEXT });

    const tradingView = screen.getByRole("link", { name: TRADINGVIEW_TEXT });
    expect(tradingView).toHaveAttribute("href", "https://www.tradingview.com/");
    expect(tradingView).toHaveAttribute("target", "_blank");
    expect(tradingView).toHaveAttribute("rel", "noreferrer");
  });
});

describe("StockChart emits no empty attribution wrapper", () => {
  /*
   * The wrapper is rendered by the same condition as its content, so an
   * unresolved provenance must leave NO element behind - not an empty block
   * with a line box, which would be an invisible layout shift in the footer.
   */
  it("renders no attribution container when provenance is unresolved", async () => {
    vi.stubGlobal("fetch", respondWith(successBody("Finnhub")));
    const { container } = renderChart();

    await waitFor(() => {
      expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
    });

    expect(
      container.querySelector('[data-testid="chart-provider-attribution"]'),
    ).toBeNull();
  });

  it("renders the container only alongside its content", async () => {
    vi.stubGlobal("fetch", respondWith(successBody("TwelveData")));
    const { container } = renderChart();

    await screen.findByRole("link", { name: APPROVED_TEXT });

    const wrapper = container.querySelector(
      '[data-testid="chart-provider-attribution"]',
    );

    expect(wrapper).not.toBeNull();
    expect(wrapper?.textContent).toBe(APPROVED_TEXT);
  });
});
