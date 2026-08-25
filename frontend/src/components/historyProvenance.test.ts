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
   * Rendered-output invariance, narrowed for B7b.
   *
   * B7-0's version of this guard asserted that StockChart rendered NO
   * attribution surface at all, listing "ProviderAttribution" among the
   * forbidden strings. B7b intentionally invalidates that: the component is now
   * mounted under the chart it attributes.
   *
   * What survives is the invariant that actually protects the provider
   * contract, and it is strictly stronger than "does not mount anything":
   * StockChart may MOUNT the reviewed component, and may do nothing else. It
   * must not carry the phrase, must not carry the href, must not build an
   * anchor or any attribution markup of its own, must not restate the
   * registry's resolution or presentation logic, and must not name a provider.
   *
   * The reason this matters more than the old guard did: a surface that renders
   * its own <a>Data provided by Twelve Data</a> would look correct on screen
   * while bypassing every control in the registry - the exact-label match, the
   * three-state resolution, the frozen definition and the single-owner rule.
   * Duplication, not absence, is the real failure mode once mounting is allowed.
   *
   * Comments are stripped before matching (see stockChartCode), so prose that
   * discusses the phrase or a provider name does not trip these checks.
   */
  const ATTRIBUTION_CONTENT_FORBIDDEN = [
    // The approved wording, and near-miss paraphrases of it.
    "Data provided by",
    "Data from Twelve",
    "Source: Twelve",
    "Twelve Data",
    "TwelveData",
    // The required link target, in any form.
    "twelvedata.com",
    "twelvedata",
    // Hand-rolled attribution surfaces that would bypass the registry.
    "AttributionBar",
    "ProviderCredit",
    "attributionText",
    "attributionHref",
  ];

  it("carries no attribution content of its own", () => {
    for (const forbidden of ATTRIBUTION_CONTENT_FORBIDDEN) {
      expect(
        stockChartCode.includes(forbidden),
        `StockChart.tsx must not contain ${forbidden}; that content belongs to the registry`,
      ).toBe(false);
    }
  });

  /*
   * Non-vacuity. Every assertion above is a "does not contain" check, and such
   * a check passes trivially against an empty or unreadable source. If the
   * ?raw import ever stops delivering real code, this fails first and the
   * absence checks are known to be meaningless.
   */
  it("scans real component source rather than an empty string", () => {
    expect(stockChartCode.length).toBeGreaterThan(1000);
    expect(stockChartCode).toContain("export default function StockChart");
    expect(stockChartCode).toContain("az-chart-viewport");
  });

  /*
   * The positive half: it mounts the authorized component, and that is the ONLY
   * attribution module it is allowed to reach for.
   */
  it("mounts the authorized ProviderAttribution component and nothing else", () => {
    expect(stockChartCode).toContain("ProviderAttribution");
    expect(stockChartCode).toContain("<ProviderAttribution");
    expect(stockChartCode).toContain(
      "from './attribution/ProviderAttribution'",
    );

    /*
     * Exactly one attribution element, and it is passed the raw provenance
     * value from B7-0 state - not a resolved definition, not a label, not a
     * literal. A caller holding a definition could construct a claim the
     * backend never made; passing history.provider through is the only shape in
     * which it cannot.
     */
    const mounts = stockChartCode.match(/<ProviderAttribution/g) ?? [];
    expect(mounts).toHaveLength(1);
    expect(stockChartCode).toContain("provider={history.provider}");
  });

  /*
   * No duplicated resolution or presentation logic. StockChart may ASK the
   * registry whether this provenance resolves - that is a call, not a copy -
   * but it may not reimplement the mapping, reach into a definition's fields,
   * or index the registry record itself.
   */
  it("duplicates no registry resolution or presentation logic", () => {
    expect(stockChartCode).toContain("resolveProviderAttribution(");

    for (const forbidden of [
      "PROVIDER_ATTRIBUTION[",
      "normalizeAttributionProvider",
      "BACKEND_PROVIDER_LABELS",
      "ATTRIBUTION_PROVIDER_IDS",
      ".definition.text",
      ".definition.href",
      "definition.text",
      "definition.href",
    ]) {
      expect(
        stockChartCode.includes(forbidden),
        `StockChart.tsx must not reimplement or unpack registry internals (${forbidden})`,
      ).toBe(false);
    }
  });

  /*
   * No attribution anchor of its own. StockChart still renders exactly one
   * anchor - the pre-existing TradingView credit - and every other link on the
   * surface must come from a component, not from markup written here.
   *
   * Pinning the count is what makes this non-vacuous: "contains no
   * twelvedata.com" would still pass if someone added a second hand-rolled
   * anchor pointing somewhere else.
   */
  it("adds no attribution anchor of its own", () => {
    const anchors = stockChartCode.match(/<a\s/g) ?? [];

    expect(anchors).toHaveLength(1);
    expect(stockChartCode).not.toContain("href={");

    /*
     * Link targets are checked against the RAW source, not the stripped one.
     *
     * The comment stripper's `//.*$` arm also consumes the `//` inside a URL,
     * so "https://twelvedata.com" collapses to "https:" before any absence
     * check can see it. Scanning the stripped source for a href would therefore
     * pass for a StockChart that inlines the exact link this guard exists to
     * forbid. The raw source keeps the URL intact.
     */
    expect(stockChartSource).toContain("https://www.tradingview.com/");
    expect(stockChartSource).not.toMatch(/twelvedata/i);
  });

  /*
   * Mutation control.
   *
   * The checks above are absence assertions, and an absence assertion that has
   * never been shown to fire is not evidence. These synthesise the three ways
   * StockChart could bypass the registry - inlining the phrase, inlining the
   * href, hand-rolling the markup - and prove each is detected.
   *
   * The mutations are strings built here, not files written to the repository,
   * so no probe can be left behind.
   */
  it("detects a StockChart that inlines attribution content or markup", () => {
    const contains = (source: string) =>
      ATTRIBUTION_CONTENT_FORBIDDEN.some((token) => source.includes(token));

    const withPhrase = `${stockChartCode}\nconst leak = "Data provided by Twelve Data";`;
    const withMarkup = `${stockChartCode}\n<a href="https://twelvedata.com">Data provided by Twelve Data</a>;`;

    expect(contains(withPhrase)).toBe(true);
    expect(contains(withMarkup)).toBe(true);

    // ...and the real source is clean, so the detector is discriminating
    // rather than always-true.
    expect(contains(stockChartCode)).toBe(false);

    /*
     * The href mutation is applied to the RAW source, for the reason given in
     * the anchor test: stripped-source scanning cannot see a URL at all. This
     * proves the raw-source check fires, and that it is the ONLY check that
     * could have.
     */
    const rawWithHref = `${stockChartSource}\nconst leak = "https://twelvedata.com";`;
    expect(rawWithHref).toMatch(/twelvedata/i);
    expect(stockChartSource).not.toMatch(/twelvedata/i);

    // Demonstrates the hazard itself: stripping destroys the evidence.
    const strippedHref = rawWithHref.replace(
      /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
      "",
    );
    expect(strippedHref).not.toMatch(/twelvedata\.com/i);

    // A hand-rolled second anchor is caught by the anchor count.
    const extraAnchor = (withMarkup.match(/<a\s/g) ?? []).length;
    expect(extraAnchor).toBeGreaterThan(
      (stockChartCode.match(/<a\s/g) ?? []).length,
    );
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
