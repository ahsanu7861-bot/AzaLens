import { describe, expect, it } from "vitest";

import stockChartSource from "./StockChart.tsx?raw";
import {
  EMPTY_HISTORY,
  readHistoryProvider,
  type HistoryProvenance,
} from "./historyProvenance";
import type { HistoricalBar, HistoryResponse } from "../types/analysis";

/*
 * B7-0 captures the provider that `/history/:symbol` already sends and renders
 * nothing with it. That decides how this suite is written: there is deliberately
 * no DOM output to assert against, so the invariants are proven against the pure
 * reader, the atomic state shape, and the component source itself. Adding a
 * `data-provider` attribute purely to make state observable would change the
 * rendered DOM, which B7-0 forbids.
 *
 * The source is read through Vite's `?raw` import rather than node:fs: jsdom
 * tests in src/ have no Node types by design (tsconfig.app.json exposes only
 * vite/client), a constraint the repository already records in
 * LandingPage.test.tsx.
 */

/*
 * Executable source only. The guards below assert what the component DOES, and
 * a comment explaining why a provider label must not be hardcoded is not a
 * hardcoded provider label. Stripping comments keeps the guard honest in both
 * directions rather than weakening it to accommodate prose.
 */
const stockChartCode = stockChartSource.replace(
  /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
  "",
);

function bar(date: string, close: number): HistoricalBar {
  return {
    date,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1_000,
  };
}

describe("readHistoryProvider", () => {
  it("captures the provider when the response explicitly declares one", () => {
    const result: HistoryResponse = {
      success: true,
      symbol: "AAPL",
      interval: "1day",
      provider: "TwelveData",
      bars: [bar("2026-08-01", 100)],
    };

    expect(readHistoryProvider(result)).toBe("TwelveData");
  });

  it("captures Finnhub exactly as sent, with no rewriting", () => {
    expect(readHistoryProvider({ provider: "Finnhub" })).toBe("Finnhub");
  });

  /*
   * Negative control. History defaults to Twelve Data in
   * backend/providers/marketDataProvider.js, so the tempting bug is to treat a
   * missing field as "TwelveData". A response that declares no provider must
   * yield no provider.
   */
  it("fabricates no provider when the field is absent", () => {
    expect(readHistoryProvider({})).toBeNull();
  });

  it("fabricates no provider when the field is undefined or null", () => {
    expect(readHistoryProvider({ provider: undefined })).toBeNull();
    expect(
      readHistoryProvider({ provider: null } as unknown as HistoryResponse),
    ).toBeNull();
  });

  it("treats a blank or whitespace-only provider as no provider", () => {
    expect(readHistoryProvider({ provider: "" })).toBeNull();
    expect(readHistoryProvider({ provider: "   " })).toBeNull();
  });

  it("rejects non-string provider values rather than coercing them", () => {
    for (const malformed of [42, true, {}, [], Number.NaN]) {
      expect(
        readHistoryProvider({
          provider: malformed,
        } as unknown as HistoryResponse),
      ).toBeNull();
    }
  });

  /*
   * An unrecognised label is preserved verbatim. B7-0 renders nothing from it,
   * so preserving it is safe, and normalising it here would destroy the only
   * evidence a later registry has to work from.
   */
  it("preserves an unknown provider instead of mapping it to TwelveData", () => {
    expect(readHistoryProvider({ provider: "SomeOtherVendor" })).toBe(
      "SomeOtherVendor",
    );
    expect(readHistoryProvider({ provider: "twelvedata" })).toBe("twelvedata");
    expect(readHistoryProvider({ provider: "Twelve Data" })).toBe("Twelve Data");
  });
});

describe("history provenance coupling", () => {
  it("pairs a provider with the bars it arrived with", () => {
    const bars = [bar("2026-08-01", 100), bar("2026-08-02", 101)];
    const state: HistoryProvenance = {
      bars,
      provider: readHistoryProvider({ provider: "TwelveData" }),
    };

    expect(state.provider).toBe("TwelveData");
    expect(state.bars).toBe(bars);
  });

  it("carries no provider in the empty state", () => {
    expect(EMPTY_HISTORY).toEqual({ bars: [], provider: null });
    expect(EMPTY_HISTORY.provider).toBeNull();
  });

  /*
   * The clearing invariant, expressed structurally: every transition replaces
   * the whole value, so a provider cannot outlive the bars it described.
   */
  it("cannot retain a provider once history is cleared", () => {
    let state: HistoryProvenance = {
      bars: [bar("2026-08-01", 100)],
      provider: "TwelveData",
    };

    state = EMPTY_HISTORY;

    expect(state.provider).toBeNull();
    expect(state.bars).toHaveLength(0);
  });
});

/*
 * Source-level controls. These assert the wiring the pure function cannot: that
 * the component holds one atomic value, replaces it wholesale on both the
 * success and failure paths, and contains no hardcoded or inferred provider.
 */
describe("StockChart provenance wiring", () => {
  it("holds bars and provider in a single atomic state value", () => {
    expect(stockChartCode).toContain(
      "useState<HistoryProvenance>(EMPTY_HISTORY)",
    );
    expect(stockChartCode).not.toContain("useState<HistoricalBar[]>");
    expect(stockChartCode).not.toContain("setBars(");
  });

  it("writes provider and bars together on the success path", () => {
    expect(stockChartCode).toContain("provider: readHistoryProvider(result),");
  });

  it("clears provenance wholesale on the failure path", () => {
    expect(stockChartCode).toContain("setHistory(EMPTY_HISTORY);");
  });

  /*
   * The abort is what prevents a superseded response from pairing its provider
   * with a later request's bars: the effect is keyed on [symbol], React runs the
   * cleanup before the next effect, and the aborted fetch rejects with an
   * AbortError that returns before any setHistory call.
   */
  it("aborts a superseded request so it can never write provenance", () => {
    expect(stockChartCode).toContain("new AbortController()");
    expect(stockChartCode).toContain("signal: controller.signal");
    expect(stockChartCode).toContain("return () => controller.abort();");
    expect(stockChartCode).toContain('caughtError.name === \'AbortError\'');
  });

  /*
   * Negative control for the prohibited inference. No provider label, and no
   * environment or default-derived source, may appear in the component's code.
   */
  it("hardcodes no provider label and infers none from configuration", () => {
    for (const forbidden of [
      "TwelveData",
      "Twelve Data",
      "twelve_data",
      "Finnhub",
      "finnhub",
      "HISTORY_PROVIDER",
      "DEFAULTS",
    ]) {
      expect(
        stockChartCode.includes(forbidden),
        `StockChart.tsx code must not mention ${forbidden}`,
      ).toBe(false);
    }
  });

  /*
   * Rendered-output invariance. B7-0 adds no attribution text, link, logo,
   * wrapper or style, so none of these may appear in the component source.
   */
  it("renders no attribution surface", () => {
    for (const forbidden of [
      "Data provided by",
      "Data from Twelve",
      "Source: Twelve",
      "Powered by",
      "twelvedata.com",
      "ProviderAttribution",
      "AttributionBar",
    ]) {
      expect(
        stockChartCode.includes(forbidden),
        `StockChart.tsx must not render ${forbidden}`,
      ).toBe(false);
    }
  });

  /*
   * `layout.attributionLogo` is a lightweight-charts option that suppresses the
   * charting library's own watermark. It predates B7 entirely, has nothing to do
   * with provider attribution, and B7-0 must leave it exactly as it was - pinned
   * here so a future edit cannot quietly repurpose or flip it.
   */
  it("leaves the charting library's own attributionLogo option untouched", () => {
    expect(stockChartCode).toContain("attributionLogo: false,");
  });
});
