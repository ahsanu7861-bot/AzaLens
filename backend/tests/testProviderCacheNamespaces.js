"use strict";

/*
  Provider- and contract-version-qualified cache keys.

  Every affected cache in this codebase is a module-level Map: process-local,
  in-memory, cleared by restart, with no Redis, Supabase or other durable store
  behind it. That is worth preserving, and this suite pins it.

  But process locality does NOT make cross-provider reuse safe. The provider is
  selected per request from the environment, so one living process can serve
  requests under two different selections. And because the normalized shapes
  are compatible on purpose, reuse across providers would not look broken - it
  would just be wrong. Compatible shapes are what make this class of defect
  invisible, not what make it safe.

  Zero network. Zero provider credits.
*/

const assert = require("node:assert/strict");
const axios = require("axios");

const originalGet = axios.get;

process.env.FINNHUB_API_KEY = "cache-namespace-test-finnhub-key";
process.env.TWELVE_DATA_API_KEY = "cache-namespace-test-twelve-key";

const {
  CACHE_CONTRACT_VERSION,
  buildCacheKey,
  clearAllCache,
  clearCache,
  getCache,
  listCacheKeys,
  setCache,
} = require("../utils/cache");

const finnhubProvider = require("../providers/finnhubProvider");
const twelveDataProvider = require("../providers/twelveDataProvider");
const { getHistory } = require("../services/marketEngine");

function resetAll() {
  clearAllCache();
  finnhubProvider.clearFinnhubQuoteCache();
  finnhubProvider.clearFinnhubProfileCache();
  finnhubProvider.clearFinnhubSearchCache();
  twelveDataProvider.clearTwelveDataQuoteCache();
  twelveDataProvider.clearTwelveDataProfileCache();
  twelveDataProvider.clearTwelveDataSearchCache();
}

function everyKey() {
  return [
    ...listCacheKeys(),
    ...Object.values(
      finnhubProvider.getFinnhubCacheKeysForTests()
    ).flat(),
    ...Object.values(
      twelveDataProvider.getTwelveDataCacheKeysForTests()
    ).flat(),
  ];
}

function twelveDataBars() {
  return {
    success: true,
    provider: "TwelveData",
    data: {
      t: ["2026-08-18", "2026-08-19"],
      o: [1, 2],
      h: [2, 3],
      l: [0.5, 1.5],
      c: [1.5, 2.5],
      v: [100, 200],
    },
  };
}

function finnhubBars() {
  return {
    success: true,
    provider: "Finnhub",
    data: {
      t: [1787184000, 1787270400],
      o: [10, 20],
      h: [20, 30],
      l: [5, 15],
      c: [15, 25],
      v: [1000, 2000],
    },
  };
}

async function run() {
  const savedHistoryProvider = process.env.HISTORY_PROVIDER;
  const savedQuoteProvider = process.env.QUOTE_PROVIDER;

  try {
    // ----------------------------------------------------------------
    // 1. The key builder demands both qualifiers
    // ----------------------------------------------------------------
    assert.equal(
      buildCacheKey({
        provider: "twelve_data",
        capability: "history",
        parts: ["AAPL", "1day"],
      }),
      `${CACHE_CONTRACT_VERSION}:twelve_data:history:AAPL:1day`
    );

    assert.throws(
      () => buildCacheKey({ capability: "history", parts: ["AAPL"] }),
      /requires a provider identity/,
      "a key without a provider must be impossible to build"
    );

    assert.throws(
      () => buildCacheKey({ provider: "finnhub", parts: ["AAPL"] }),
      /requires a capability/
    );

    // ----------------------------------------------------------------
    // 2. Every live cache key carries provider AND contract version
    // ----------------------------------------------------------------
    resetAll();

    axios.get = async (url) => {
      if (url.includes("finnhub.io") && url.endsWith("/quote")) {
        return { data: { c: 101, pc: 100, o: 100, h: 102, l: 99, d: 1, dp: 1, t: 1787356800 } };
      }

      if (url.includes("finnhub.io") && url.endsWith("/stock/profile2")) {
        return { data: { name: "Example", ticker: "EXM", exchange: "NASDAQ" } };
      }

      if (url.includes("finnhub.io") && url.endsWith("/search")) {
        return {
          data: {
            result: [
              { symbol: "EXM", description: "Example", type: "Common Stock", displaySymbol: "NASDAQ:EXM" },
            ],
          },
        };
      }

      if (url.endsWith("api.twelvedata.com/quote")) {
        return {
          data: {
            symbol: "EXM",
            name: "Example",
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
                instrument_name: "Example",
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

      throw new Error(`Unexpected URL: ${url}`);
    };

    await finnhubProvider.getFinnhubQuote("EXM");
    await finnhubProvider.getFinnhubCompanyProfile("EXM");
    await finnhubProvider.searchListedEquities("example");
    await twelveDataProvider.getTwelveDataQuote("EXM");
    await twelveDataProvider.searchTwelveDataEquities("example");

    /*
      The history entry has to be written by marketEngine itself, not seeded by
      this test with the key it hopes marketEngine uses. Seeding it would test
      the key builder twice and the production call site not at all - a
      mutation that reverted marketEngine to the old unqualified
      `history_${SYMBOL}_${INTERVAL}` key would sail straight through.
    */
    process.env.HISTORY_PROVIDER = "twelve_data";
    clearAllCache();

    axios.get = async (url) => {
      if (url.endsWith("api.twelvedata.com/time_series")) {
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

    await getHistory("EXM", "1day");

    assert.deepEqual(
      listCacheKeys(),
      [`${CACHE_CONTRACT_VERSION}:twelve_data:history:EXM:1day`],
      "marketEngine must write the history entry under a provider- and version-qualified key"
    );

    const keys = everyKey();
    assert.ok(keys.length >= 6, "expected live cache entries to inspect");

    for (const key of keys) {
      assert.ok(
        key.startsWith(`${CACHE_CONTRACT_VERSION}:`),
        `cache key "${key}" is missing its contract version`
      );
      assert.ok(
        /^v\d+:(finnhub|twelve_data):/.test(key),
        `cache key "${key}" is missing its provider identity`
      );
    }

    // ----------------------------------------------------------------
    // 3. The two providers' namespaces are provably disjoint
    // ----------------------------------------------------------------
    const finnhubKeys = Object.values(
      finnhubProvider.getFinnhubCacheKeysForTests()
    ).flat();
    const twelveDataKeys = Object.values(
      twelveDataProvider.getTwelveDataCacheKeysForTests()
    ).flat();

    assert.ok(finnhubKeys.length > 0 && twelveDataKeys.length > 0);
    assert.ok(
      finnhubKeys.every((key) => key.includes(":finnhub:")),
      "every Finnhub key must be namespaced to Finnhub"
    );
    assert.ok(
      twelveDataKeys.every((key) => key.includes(":twelve_data:")),
      "every Twelve Data key must be namespaced to Twelve Data"
    );
    assert.equal(
      finnhubKeys.filter((key) => twelveDataKeys.includes(key)).length,
      0,
      "the two providers must not share a single cache key"
    );

    // ----------------------------------------------------------------
    // 4. A Finnhub history record cannot satisfy a Twelve Data request
    // ----------------------------------------------------------------
    clearAllCache();
    process.env.HISTORY_PROVIDER = "finnhub";

    /*
      Written by the production call path under Finnhub, so the entry carries
      whatever key marketEngine really uses. If that key ever stops naming its
      provider, the Twelve Data read below collides with it and this fails.
    */
    let seedFinnhubCalls = 0;
    axios.get = async (url) => {
      if (url.includes("finnhub.io") && url.endsWith("/stock/candle")) {
        seedFinnhubCalls += 1;
        return {
          data: {
            s: "ok",
            t: [1787184000, 1787270400],
            o: [10, 20],
            h: [20, 30],
            l: [5, 15],
            c: [15, 25],
            v: [1000, 2000],
          },
        };
      }

      throw new Error(`Unexpected URL while seeding Finnhub history: ${url}`);
    };

    const seeded = await getHistory("EXM", "1day");
    assert.equal(seedFinnhubCalls, 1);
    assert.equal(seeded.provider, "Finnhub");

    const finnhubHistoryKey = listCacheKeys()[0];
    assert.ok(
      finnhubHistoryKey.includes(":finnhub:"),
      "the seeded entry must be namespaced to Finnhub"
    );

    process.env.HISTORY_PROVIDER = "twelve_data";

    let twelveDataHistoryCalls = 0;
    axios.get = async (url) => {
      if (url.endsWith("api.twelvedata.com/time_series")) {
        twelveDataHistoryCalls += 1;
        return {
          data: {
            values: [
              { datetime: "2026-08-18", open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 },
              { datetime: "2026-08-19", open: 2, high: 3, low: 1.5, close: 2.5, volume: 200 },
            ],
            meta: { exchange: "NASDAQ", currency: "USD", interval: "1day" },
          },
        };
      }

      throw new Error(`Unexpected URL under Twelve Data selection: ${url}`);
    };

    const underTwelveData = await getHistory("EXM", "1day");

    assert.equal(
      twelveDataHistoryCalls,
      1,
      "a Twelve Data request must reach Twelve Data, not the Finnhub cache entry"
    );
    assert.equal(underTwelveData.provider, "TwelveData");
    assert.equal(underTwelveData.cache, "MISS");
    assert.equal(
      underTwelveData.bars[0].close,
      1.5,
      "the served bars must be Twelve Data's, not Finnhub's"
    );
    assert.ok(
      getCache(finnhubHistoryKey),
      "the Finnhub entry must survive untouched for rollback"
    );

    // ----------------------------------------------------------------
    // 5. Rollback: a Twelve Data record cannot satisfy a Finnhub request
    // ----------------------------------------------------------------
    /*
      Rollback direction. The Twelve Data entry written by the real call path
      above is left in place, and the provider is switched back to Finnhub.
    */
    process.env.HISTORY_PROVIDER = "finnhub";

    /*
      Drop only the Finnhub entry, leaving Twelve Data's in place. Without this
      the rollback read is legitimately served from Finnhub's own cache and the
      test proves nothing: the Twelve Data entry has to be the only candidate
      for a collision.
    */
    clearCache(finnhubHistoryKey);

    const keysBeforeRollback = listCacheKeys();
    assert.ok(
      keysBeforeRollback.some((key) => key.includes(":twelve_data:")),
      "a Twelve Data entry must be present before the rollback read"
    );

    let finnhubHistoryCalls = 0;
    axios.get = async (url) => {
      if (url.includes("finnhub.io") && url.endsWith("/stock/candle")) {
        finnhubHistoryCalls += 1;
        return {
          data: {
            s: "ok",
            t: [1787184000, 1787270400],
            o: [10, 20],
            h: [20, 30],
            l: [5, 15],
            c: [15, 25],
            v: [1000, 2000],
          },
        };
      }

      throw new Error(`Unexpected URL under Finnhub rollback: ${url}`);
    };

    const underFinnhub = await getHistory("EXM", "1day");

    assert.equal(
      finnhubHistoryCalls,
      1,
      "a rollback request must reach Finnhub, not the Twelve Data cache entry"
    );
    assert.equal(underFinnhub.provider, "Finnhub");
    assert.equal(underFinnhub.bars[0].close, 15);

    // ----------------------------------------------------------------
    // 6. Cached provenance stays truthful
    // ----------------------------------------------------------------
    const cachedUnderFinnhub = await getHistory("EXM", "1day");
    assert.equal(cachedUnderFinnhub.cache, "HIT");
    assert.equal(
      cachedUnderFinnhub.provider,
      "Finnhub",
      "a cache hit must report the provider that produced the record"
    );
    assert.equal(finnhubHistoryCalls, 1);

    // ----------------------------------------------------------------
    // 7. Pending requests do not coalesce across providers
    // ----------------------------------------------------------------
    resetAll();

    let finnhubQuoteCalls = 0;
    let twelveDataQuoteCalls = 0;
    let release = null;
    const gate = new Promise((resolve) => {
      release = resolve;
    });

    axios.get = async (url) => {
      if (url.includes("finnhub.io") && url.endsWith("/quote")) {
        finnhubQuoteCalls += 1;
        await gate;
        return { data: { c: 101, pc: 100, o: 100, h: 102, l: 99, d: 1, dp: 1, t: 1787356800 } };
      }

      if (url.endsWith("api.twelvedata.com/quote")) {
        twelveDataQuoteCalls += 1;
        await gate;
        return {
          data: {
            symbol: "EXM",
            name: "Example",
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

      throw new Error(`Unexpected URL: ${url}`);
    };

    const inFlight = Promise.all([
      finnhubProvider.getFinnhubQuote("EXM"),
      twelveDataProvider.getTwelveDataQuote("EXM"),
    ]);

    await new Promise((resolve) => setImmediate(resolve));

    const pendingFinnhub =
      finnhubProvider.getFinnhubCacheKeysForTests().pendingQuote;
    const pendingTwelveData =
      twelveDataProvider.getTwelveDataCacheKeysForTests().pendingQuote;

    assert.equal(pendingFinnhub.length, 1);
    assert.equal(pendingTwelveData.length, 1);
    assert.notEqual(
      pendingFinnhub[0],
      pendingTwelveData[0],
      "two providers' in-flight requests for the same symbol must not share a key"
    );

    release();
    const [finnhubQuote, twelveDataQuote] = await inFlight;

    assert.equal(finnhubQuoteCalls, 1);
    assert.equal(twelveDataQuoteCalls, 1);
    assert.equal(finnhubQuote.provider, "Finnhub");
    assert.equal(finnhubQuote.data.price, 101);
    assert.equal(twelveDataQuote.provider, "TwelveData");
    assert.equal(twelveDataQuote.data.price, 202);

    // ----------------------------------------------------------------
    // 8. Halal Terminal keeps its own namespace
    // ----------------------------------------------------------------
    clearAllCache();
    setCache("shariah_EXM", { provider: "Halal Terminal" }, 30);
    setCache(
      buildCacheKey({
        provider: "twelve_data",
        capability: "history",
        parts: ["EXM", "1day"],
      }),
      twelveDataBars(),
      30
    );

    const namespaced = listCacheKeys();
    assert.ok(namespaced.includes("shariah_EXM"));
    assert.equal(
      namespaced.filter((key) => key.startsWith("v1:")).length,
      1,
      "the Shariah namespace must stay outside the market-data namespaces"
    );

    // ----------------------------------------------------------------
    // 9. Every affected cache is process-local and non-durable
    // ----------------------------------------------------------------
    const cacheSource = require("node:fs").readFileSync(
      require.resolve("../utils/cache.js"),
      "utf8"
    );

    for (const forbidden of [
      "redis",
      "Redis",
      "createClient",
      "supabase",
      "Supabase",
    ]) {
      assert.equal(
        cacheSource.includes(forbidden),
        false,
        `the shared cache must not reach durable storage (found "${forbidden}")`
      );
    }

    assert.ok(
      /^const cache = new Map\(\);$/m.test(cacheSource),
      "the shared cache must remain a module-level Map"
    );

    console.log("Provider-qualified cache namespace tests passed.");
  } finally {
    if (savedHistoryProvider === undefined) delete process.env.HISTORY_PROVIDER;
    else process.env.HISTORY_PROVIDER = savedHistoryProvider;
    if (savedQuoteProvider === undefined) delete process.env.QUOTE_PROVIDER;
    else process.env.QUOTE_PROVIDER = savedQuoteProvider;
  }
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    axios.get = originalGet;
    resetAll();
  });
