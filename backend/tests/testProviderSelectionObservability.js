"use strict";

/*
  Provider selection must be observable, and "no Finnhub call is hiding behind
  a Twelve Data selection" must be provable rather than promised.

  PR B needs both: a protected way to read which provider owns each capability,
  and evidence that the selection is actually honoured at the request level. A
  selection that reports Twelve Data while quietly spending Finnhub credits is
  exactly the failure this suite is built to catch.

  Zero network. Zero provider credits.
*/

const assert = require("node:assert/strict");
const axios = require("axios");

const originalGet = axios.get;

process.env.FINNHUB_API_KEY = "selection-observability-finnhub-key";
process.env.TWELVE_DATA_API_KEY = "selection-observability-twelve-key";

const adapter = require("../providers/marketDataProvider");
const observability = require("../utils/observability");
const finnhubProvider = require("../providers/finnhubProvider");
const twelveDataProvider = require("../providers/twelveDataProvider");

const TWELVE_DATA_ONLY = Object.freeze({
  QUOTE_PROVIDER: "twelve_data",
  PROFILE_PROVIDER: "twelve_data",
  SEARCH_PROVIDER: "twelve_data",
  HISTORY_PROVIDER: "twelve_data",
  FUNDAMENTALS_PROVIDER: "twelve_data",
  TWELVE_DATA_PROFILE_ENABLED: "true",
});

function resetProviderCaches() {
  finnhubProvider.clearFinnhubQuoteCache();
  finnhubProvider.clearFinnhubProfileCache();
  finnhubProvider.clearFinnhubSearchCache();
  twelveDataProvider.clearTwelveDataQuoteCache();
  twelveDataProvider.clearTwelveDataProfileCache();
  twelveDataProvider.clearTwelveDataSearchCache();
}

async function run() {
  const saved = {};
  for (const key of Object.keys(TWELVE_DATA_ONLY)) {
    saved[key] = process.env[key];
  }

  try {
    // ----------------------------------------------------------------
    // 1. The default selection is reported truthfully
    // ----------------------------------------------------------------
    const defaultSnapshot = adapter.getProviderSelectionSnapshot({});

    assert.deepEqual(defaultSnapshot.capabilities, {
      quote: "finnhub",
      profile: "finnhub",
      search: "finnhub",
      history: "twelve_data",
      fundamentals: "finnhub",
    });
    assert.equal(defaultSnapshot.usesDefaults, true);
    assert.equal(defaultSnapshot.fallbackEnabled, false);
    assert.equal(defaultSnapshot.featureFlags.twelveDataProfileEnabled, false);
    assert.deepEqual(defaultSnapshot.requiredProviderKeys, [
      "FINNHUB_API_KEY",
      "TWELVE_DATA_API_KEY",
    ]);
    assert.deepEqual(defaultSnapshot.activeProviders, [
      "finnhub",
      "twelve_data",
    ]);
    assert.equal(defaultSnapshot.cacheContractVersion, "v1");

    // ----------------------------------------------------------------
    // 2. A non-default selection is visibly non-default
    // ----------------------------------------------------------------
    const migrated = adapter.getProviderSelectionSnapshot(TWELVE_DATA_ONLY);

    assert.equal(migrated.usesDefaults, false);
    assert.deepEqual(migrated.activeProviders, ["twelve_data"]);
    assert.deepEqual(migrated.requiredProviderKeys, ["TWELVE_DATA_API_KEY"]);
    assert.equal(migrated.featureFlags.twelveDataProfileEnabled, true);
    assert.deepEqual(migrated.capabilityLabels, {
      quote: "TwelveData",
      profile: "TwelveData",
      search: "TwelveData",
      history: "TwelveData",
      fundamentals: "TwelveData",
    });

    /*
      The defaults travel alongside the live selection so a reader can see the
      drift without having to know the accepted values by heart.
    */
    assert.deepEqual(migrated.defaults, adapter.DEFAULTS);

    // ----------------------------------------------------------------
    // 3. No secret ever reaches the snapshot
    // ----------------------------------------------------------------
    const serialized = JSON.stringify(
      adapter.getProviderSelectionSnapshot({
        ...TWELVE_DATA_ONLY,
        FINNHUB_API_KEY: "selection-observability-finnhub-key",
        TWELVE_DATA_API_KEY: "selection-observability-twelve-key",
        OBSERVABILITY_METRICS_TOKEN: "selection-observability-metrics-token",
      })
    );

    for (const secret of [
      "selection-observability-finnhub-key",
      "selection-observability-twelve-key",
      "selection-observability-metrics-token",
    ]) {
      assert.equal(
        serialized.includes(secret),
        false,
        "provider selection observability must publish names, never values"
      );
    }

    assert.ok(
      serialized.includes("FINNHUB_API_KEY") === false,
      "the migrated selection must not even name a key it does not require"
    );

    // ----------------------------------------------------------------
    // 4. The protected metrics snapshot carries the selection
    // ----------------------------------------------------------------
    observability.resetObservabilityForTests();
    const metrics = observability.getMetricsSnapshot();

    assert.ok(metrics.providerSelection, "metrics must report provider selection");
    assert.deepEqual(
      metrics.providerSelection.capabilities,
      adapter.getCapabilityProviders()
    );
    assert.equal(metrics.providerSelection.fallbackEnabled, false);
    assert.equal(
      metrics.providerSelection.marketDataDelay.minutes,
      15,
      "the disclosed market-data delay must be traceable from metrics"
    );
    assert.equal(metrics.providerSelection.marketDataDelay.source, "DEFAULT");

    /*
      The public readiness endpoint must stay a yes/no. Provider names,
      capability selection and key names all belong behind the metrics token,
      and none of them may leak into an unauthenticated response.
    */
    const readiness = JSON.stringify(
      observability.buildReadinessSnapshot({
        env: {
          FINNHUB_API_KEY: "selection-observability-finnhub-key",
          TWELVE_DATA_API_KEY: "selection-observability-twelve-key",
        },
        strict: true,
      })
    );

    for (const forbidden of [
      "selection-observability-finnhub-key",
      "selection-observability-twelve-key",
      "FINNHUB_API_KEY",
      "TWELVE_DATA_API_KEY",
      "QUOTE_PROVIDER",
      "capabilities",
    ]) {
      assert.equal(
        readiness.includes(forbidden),
        false,
        `the public readiness endpoint must not expose "${forbidden}"`
      );
    }

    assert.match(readiness, /"marketProviders":"configured"/);

    // ----------------------------------------------------------------
    // 4b. Strict readiness refuses a configuration that cannot serve
    // ----------------------------------------------------------------
    /*
      Key presence alone was never sufficient. An unsupported provider requires
      no key at all, so "every required key is present" was trivially true and
      strict readiness reported ready for a selection that could not answer a
      single request. A selected-but-disabled Twelve Data capability had the
      same shape: green health check, every request failing.
    */
    const KEYS = {
      FINNHUB_API_KEY: "selection-observability-finnhub-key",
      TWELVE_DATA_API_KEY: "selection-observability-twelve-key",
    };

    const readinessCases = [
      ["accepted defaults", {}, true, "configured"],
      ["unknown quote provider", { QUOTE_PROVIDER: "alphavantage" }, false, "misconfigured"],
      ["unknown history provider", { HISTORY_PROVIDER: "yahoo" }, false, "misconfigured"],
      ["whitespace provider", { SEARCH_PROVIDER: "   " }, false, "misconfigured"],
      ["twelve data profile without its flag", { PROFILE_PROVIDER: "twelve_data" }, false, "misconfigured"],
      ["twelve data fundamentals without its flag", { FUNDAMENTALS_PROVIDER: "twelve_data" }, false, "misconfigured"],
      [
        "twelve data profile with its flag",
        { PROFILE_PROVIDER: "twelve_data", TWELVE_DATA_PROFILE_ENABLED: "true" },
        true,
        "configured",
      ],
      [
        "correct twelve data-only selection",
        {
          QUOTE_PROVIDER: "twelve_data",
          PROFILE_PROVIDER: "twelve_data",
          SEARCH_PROVIDER: "twelve_data",
          HISTORY_PROVIDER: "twelve_data",
          FUNDAMENTALS_PROVIDER: "twelve_data",
          TWELVE_DATA_PROFILE_ENABLED: "true",
          FINNHUB_API_KEY: "",
        },
        true,
        "configured",
      ],
      ["missing key for a selected provider", { FINNHUB_API_KEY: "" }, false, "incomplete"],
    ];

    for (const [label, overrides, expectedReady, expectedState] of readinessCases) {
      const snapshot = observability.buildReadinessSnapshot({
        env: { ...KEYS, ...overrides },
        strict: true,
      });

      assert.equal(
        snapshot.ready,
        expectedReady,
        `strict readiness for "${label}" must be ${expectedReady}`
      );
      assert.equal(
        snapshot.checks.marketProviders,
        expectedState,
        `readiness state for "${label}" must be "${expectedState}"`
      );
      assert.equal(snapshot.status, expectedReady ? "ready" : "not_ready");
    }

    // ----------------------------------------------------------------
    // 4c. The public readiness response stays aggregate-only
    // ----------------------------------------------------------------
    /*
      Diagnosing a misconfiguration must not come at the cost of publishing the
      configuration. The unauthenticated response says one aggregate word;
      everything specific stays behind the metrics token.
    */
    for (const [label, overrides] of [
      ["unsupported provider", { QUOTE_PROVIDER: "alphavantage" }],
      ["disabled capability", { PROFILE_PROVIDER: "twelve_data" }],
      ["missing key", { FINNHUB_API_KEY: "" }],
      ["healthy defaults", {}],
    ]) {
      const published = JSON.stringify(
        observability.buildReadinessSnapshot({
          env: { ...KEYS, ...overrides },
          strict: true,
        })
      );

      for (const forbidden of [
        "selection-observability-finnhub-key",
        "selection-observability-twelve-key",
        "FINNHUB_API_KEY",
        "TWELVE_DATA_API_KEY",
        "TWELVE_DATA_PROFILE_ENABLED",
        "QUOTE_PROVIDER",
        "PROFILE_PROVIDER",
        "alphavantage",
        "twelve_data",
        "finnhub",
        "capabilities",
        "capability",
        "PROVIDER_UNSUPPORTED",
        "PROVIDER_CAPABILITY_FLAG_DISABLED",
        "configurationProblems",
        "requiredProviderKeys",
      ]) {
        assert.equal(
          published.includes(forbidden),
          false,
          `public readiness for "${label}" must not expose "${forbidden}"`
        );
      }
    }

    // The detail is available, but only behind the token.
    observability.resetObservabilityForTests();
    const protectedMetrics = observability.getMetricsSnapshot();
    assert.ok(
      Array.isArray(protectedMetrics.providerSelection.configurationProblems),
      "protected metrics must carry the configuration problems the public endpoint withholds"
    );

    // ----------------------------------------------------------------
    // 4d. Explicitly blank provider values are refused, not defaulted
    // ----------------------------------------------------------------
    /*
      `env[key] || DEFAULT` could not distinguish "nobody configured this" from
      "somebody configured it to nothing". An empty QUOTE_PROVIDER="" was falsy,
      so it collapsed into the accepted default: the service silently selected
      Finnhub, reported usesDefaults: true, and passed readiness. An operator who
      blanked a variable was told their edit had no consequences.
    */
    for (const variable of [
      "QUOTE_PROVIDER",
      "PROFILE_PROVIDER",
      "SEARCH_PROVIDER",
      "HISTORY_PROVIDER",
      "FUNDAMENTALS_PROVIDER",
    ]) {
      for (const blank of ["", " ", "   ", "\t", "\n"]) {
        const env = { ...KEYS, [variable]: blank };
        const snapshot = observability.buildReadinessSnapshot({ env, strict: true });

        assert.equal(
          snapshot.ready,
          false,
          `${variable}=${JSON.stringify(blank)} must not report ready`
        );
        assert.equal(
          snapshot.checks.marketProviders,
          "misconfigured",
          `${variable}=${JSON.stringify(blank)} must report the aggregate misconfigured state`
        );

        const selection = adapter.getProviderSelectionSnapshot(env);

        assert.equal(
          selection.usesDefaults,
          false,
          `${variable}=${JSON.stringify(blank)} must not be reported as using defaults`
        );
        assert.equal(
          selection.configurationProblems.length,
          1,
          `${variable}=${JSON.stringify(blank)} must produce exactly one diagnostic`
        );
        assert.equal(selection.configurationProblems[0].code, "PROVIDER_UNSUPPORTED");
        assert.equal(selection.configurationProblems[0].variable, variable);

        // And nothing about it may reach the public endpoint.
        const published = JSON.stringify(snapshot);
        for (const forbidden of [variable, "PROVIDER_UNSUPPORTED", "finnhub", "twelve_data"]) {
          assert.equal(
            published.includes(forbidden),
            false,
            `public readiness must not expose "${forbidden}" for a blank ${variable}`
          );
        }
      }
    }

    // Absence still selects the accepted defaults and stays ready.
    const absentSnapshot = observability.buildReadinessSnapshot({
      env: { ...KEYS },
      strict: true,
    });
    assert.equal(absentSnapshot.ready, true);
    assert.equal(absentSnapshot.checks.marketProviders, "configured");
    assert.equal(adapter.getProviderSelectionSnapshot({ ...KEYS }).usesDefaults, true);

    // ----------------------------------------------------------------
    // 4e. Delay-fallback diagnostics are protected-only and value-free
    // ----------------------------------------------------------------
    const savedDelay = {
      MARKET_DATA_DELAY_MINUTES: process.env.MARKET_DATA_DELAY_MINUTES,
      FINNHUB_DELAY_MINUTES: process.env.FINNHUB_DELAY_MINUTES,
    };

    try {
      process.env.MARKET_DATA_DELAY_MINUTES = "-999-not-a-delay";
      delete process.env.FINNHUB_DELAY_MINUTES;

      observability.resetObservabilityForTests();
      const withRejection = observability.getMetricsSnapshot();
      const delay = withRejection.providerSelection.marketDataDelay;

      assert.equal(delay.minutes, 15, "the safe default must still be used");
      assert.equal(delay.source, "DEFAULT");
      assert.equal(delay.fallbackReason, "ALL_SOURCES_INVALID");
      assert.deepEqual(delay.rejectedSources, [
        { variable: "MARKET_DATA_DELAY_MINUTES", reason: "NOT_NUMERIC" },
      ]);

      /*
        A rejected primary that falls through to a usable legacy source is a
        fallback, and the protected record must not claim otherwise. This used
        to report "NONE" beside a non-empty rejectedSources list.
      */
      process.env.MARKET_DATA_DELAY_MINUTES = "-5";
      process.env.FINNHUB_DELAY_MINUTES = "20";

      observability.resetObservabilityForTests();
      const fellThrough =
        observability.getMetricsSnapshot().providerSelection.marketDataDelay;

      assert.equal(fellThrough.minutes, 20, "the legacy value must still be used");
      assert.equal(fellThrough.source, "FINNHUB_DELAY_MINUTES");
      assert.equal(
        fellThrough.fallbackReason,
        "PRIMARY_SOURCE_REJECTED",
        "a rejected primary plus a resolved legacy source must be reported as a fallback"
      );
      assert.deepEqual(fellThrough.rejectedSources, [
        { variable: "MARKET_DATA_DELAY_MINUTES", reason: "NEGATIVE" },
      ]);
      assert.notEqual(
        fellThrough.fallbackReason,
        "NONE",
        "fallbackReason and rejectedSources must never disagree"
      );

      // A clean configuration claims no fallback and lists no rejection.
      process.env.MARKET_DATA_DELAY_MINUTES = "20";
      delete process.env.FINNHUB_DELAY_MINUTES;

      observability.resetObservabilityForTests();
      const clean =
        observability.getMetricsSnapshot().providerSelection.marketDataDelay;

      assert.equal(clean.fallbackReason, "NONE");
      assert.deepEqual(clean.rejectedSources, []);

      process.env.MARKET_DATA_DELAY_MINUTES = "-999-not-a-delay";
      delete process.env.FINNHUB_DELAY_MINUTES;
      observability.resetObservabilityForTests();

      assert.equal(
        JSON.stringify(withRejection).includes("-999-not-a-delay"),
        false,
        "a rejected delay value must never be echoed into metrics"
      );

      // The public readiness endpoint gains none of this.
      const publicWithRejection = JSON.stringify(
        observability.buildReadinessSnapshot({ env: { ...KEYS }, strict: true })
      );

      for (const forbidden of [
        "fallbackReason",
        "rejectedSources",
        "configuredSources",
        "MARKET_DATA_DELAY_MINUTES",
        "FINNHUB_DELAY_MINUTES",
        "-999-not-a-delay",
      ]) {
        assert.equal(
          publicWithRejection.includes(forbidden),
          false,
          `public readiness must not expose "${forbidden}"`
        );
      }
    } finally {
      for (const [key, value] of Object.entries(savedDelay)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }

    // ----------------------------------------------------------------
    // 5. A Twelve Data selection makes ZERO Finnhub call attempts
    // ----------------------------------------------------------------
    for (const [key, value] of Object.entries(TWELVE_DATA_ONLY)) {
      process.env[key] = value;
    }

    resetProviderCaches();

    const requestedUrls = [];

    axios.get = async (url) => {
      requestedUrls.push(url);

      if (url.includes("finnhub.io")) {
        throw new Error(
          `Finnhub was contacted under a Twelve Data selection: ${url}`
        );
      }

      if (url.endsWith("api.twelvedata.com/quote")) {
        return {
          data: {
            symbol: "EXM",
            name: "Example Corp",
            exchange: "NASDAQ",
            currency: "USD",
            close: "202.00",
            previous_close: "200.00",
            change: "2.00",
            percent_change: "1.00",
            timestamp: 1787356800,
          },
        };
      }

      if (url.endsWith("/symbol_search")) {
        return {
          data: {
            data: [
              {
                symbol: "EXM",
                instrument_name: "Example Corp",
                exchange: "NASDAQ",
                mic_code: "XNGS",
                instrument_type: "Common Stock",
                country: "United States",
                currency: "USD",
              },
            ],
          },
        };
      }

      if (url.endsWith("/profile")) {
        return {
          data: {
            name: "Example Corp",
            symbol: "EXM",
            exchange: "NASDAQ",
            mic_code: "XNGS",
            country: "United States",
            sector: "Technology",
            industry: "Software",
            website: "https://example.com",
          },
        };
      }

      if (url.endsWith("/stocks")) {
        return {
          data: {
            data: [
              {
                symbol: "EXM",
                name: "Example Corp",
                exchange: "NASDAQ",
                mic_code: "XNGS",
                country: "United States",
                currency: "USD",
                type: "Common Stock",
              },
            ],
          },
        };
      }

      if (url.endsWith("/logo")) {
        return { data: { url: "https://example.com/logo.png" } };
      }

      if (url.endsWith("/time_series")) {
        return {
          data: {
            values: [
              { datetime: "2026-08-19", open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 },
            ],
            meta: { exchange: "NASDAQ", currency: "USD", interval: "1day" },
          },
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    };

    const quote = await adapter.getQuote("EXM");
    const search = await adapter.searchSymbols("example");
    const profile = await adapter.getCompanyProfile("EXM");
    const fundamentals = await adapter.getFundamentals("EXM");
    const history = await adapter.getHistoricalCandles("EXM", "1day");

    assert.equal(quote.provider, "TwelveData");
    assert.equal(search[0].provider, "TwelveData");
    assert.equal(profile.provider, "TwelveData");
    assert.equal(fundamentals.provider, "TwelveData");
    assert.equal(history.provider, "TwelveData");

    const finnhubAttempts = requestedUrls.filter((url) =>
      url.includes("finnhub.io")
    );

    assert.deepEqual(
      finnhubAttempts,
      [],
      "a Twelve Data selection must make zero Finnhub call attempts"
    );

    assert.ok(
      requestedUrls.every((url) => url.includes("api.twelvedata.com")),
      "every request under a Twelve Data selection must go to Twelve Data"
    );

    /*
      The IPO calendar is a 100-credit date-ranged event feed that returns
      nothing for a company listed decades ago. It must never be called to fill
      a presentation-only field.
    */
    assert.equal(
      requestedUrls.some((url) => url.includes("ipo_calendar")),
      false,
      "the IPO calendar must never be requested"
    );

    console.log("Provider selection observability tests passed.");
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    axios.get = originalGet;
    resetProviderCaches();
  });
