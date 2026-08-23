"use strict";

/*
  Zero-network contract tests for the Twelve Data equity-only symbol search.
  Every response is a hermetic fixture; no provider is contacted and no API
  credit is spent.
*/

const assert = require("node:assert/strict");
const axios = require("axios");

const originalGet = axios.get;

process.env.TWELVE_DATA_API_KEY = "twelve-data-search-test-key";
process.env.FINNHUB_API_KEY = "twelve-data-search-test-finnhub-key";

const {
  SUPPORTED_EQUITY_TYPES,
  clearTwelveDataSearchCache,
  searchTwelveDataEquities,
} = require("../providers/twelveDataProvider");

const {
  isListedEquitySearchResult,
} = require("../providers/finnhubProvider");

function row(overrides = {}) {
  return {
    symbol: "AAPL",
    instrument_name: "Apple Inc",
    exchange: "NASDAQ",
    mic_code: "XNGS",
    exchange_timezone: "America/New_York",
    instrument_type: "Common Stock",
    country: "United States",
    currency: "USD",
    ...overrides,
  };
}

let requestedUrls = [];
let lastParams = null;

function stubSearch(handler) {
  requestedUrls = [];
  axios.get = async (url, config) => {
    requestedUrls.push(url);
    lastParams = config?.params || null;

    if (!url.endsWith("/symbol_search")) {
      throw new Error(`Unexpected Twelve Data URL: ${url}`);
    }

    return handler(url, config);
  };
}

function timeoutError() {
  const error = new Error("timeout of 15000ms exceeded");
  error.code = "ECONNABORTED";
  return error;
}

function httpError(status, message) {
  const error = new Error(`Request failed with status code ${status}`);
  error.response = { status, data: { message } };
  return error;
}

async function run() {
  // ------------------------------------------------------------------
  // 1. Normalization of every consumed field
  // ------------------------------------------------------------------
  clearTwelveDataSearchCache();
  stubSearch(async () => ({ data: { data: [row()] } }));

  const [apple] = await searchTwelveDataEquities("apple");

  assert.deepEqual(apple, {
    symbol: "AAPL",
    name: "Apple Inc",
    exchange: "NASDAQ",
    micCode: "XNGS",
    country: "United States",
    currency: "USD",
    securityType: "Common Stock",
    provider: "TwelveData",
  });

  /*
    The exchange comes from Twelve Data's own `exchange` field. The Finnhub
    adapter has to split `displaySymbol` on ":" because Finnhub has no exchange
    field at all, and guessing a venue out of a display string is precisely how
    a foreign listing gets substituted for a US primary. That heuristic must
    not be reproduced here.
  */
  assert.equal(
    apple.exchange,
    "NASDAQ",
    "exchange must be read from the provider field, not parsed from a display symbol"
  );

  // ------------------------------------------------------------------
  // 2. Only supported listed-equity types survive
  // ------------------------------------------------------------------
  clearTwelveDataSearchCache();
  stubSearch(async () => ({
    data: {
      data: [
        row({ symbol: "AAPL", instrument_type: "Common Stock" }),
        row({ symbol: "ORD", instrument_type: "Ordinary Shares" }),
        row({ symbol: "PFD", instrument_type: "Preferred Stock" }),
        row({ symbol: "PFS", instrument_type: "Preferred Shares" }),
        row({ symbol: "LOWER", instrument_type: "common stock" }),
      ],
    },
  }));

  const accepted = await searchTwelveDataEquities("mixed", 50);
  assert.deepEqual(
    accepted.map((result) => result.symbol),
    ["AAPL", "ORD", "PFD", "PFS", "LOWER"],
    "every supported equity type, in any casing, must be accepted"
  );

  // ------------------------------------------------------------------
  // 3. Non-equity instruments are excluded
  // ------------------------------------------------------------------
  clearTwelveDataSearchCache();
  stubSearch(async () => ({
    data: {
      data: [
        row({ symbol: "EURUSD", instrument_type: "Physical Currency" }),
        row({ symbol: "BTCUSD", instrument_type: "Digital Currency" }),
        row({ symbol: "SPY", instrument_type: "ETF" }),
        row({ symbol: "VFIAX", instrument_type: "Mutual Fund" }),
        row({ symbol: "ESZ6", instrument_type: "Futures" }),
        row({ symbol: "AAPL240119C", instrument_type: "Option" }),
        row({ symbol: "UKOIL", instrument_type: "CFD" }),
        row({ symbol: "XAUUSD", instrument_type: "Commodity" }),
        row({ symbol: "SPX", instrument_type: "Index" }),
        row({ symbol: "TBOND", instrument_type: "Bond" }),
        row({ symbol: "REIT1", instrument_type: "Trust" }),
        row({ symbol: "NOTYPE", instrument_type: undefined }),
        row({ symbol: "AAPL", instrument_type: "Common Stock" }),
      ],
    },
  }));

  const filtered = await searchTwelveDataEquities("everything", 50);
  assert.deepEqual(
    filtered.map((result) => result.symbol),
    ["AAPL"],
    "forex, crypto, funds, futures, options, CFDs, commodities, indices, bonds and untyped rows must all be excluded"
  );

  // ------------------------------------------------------------------
  // 4. Instrument scope matches the accepted Finnhub contract exactly
  // ------------------------------------------------------------------
  /*
    PR A is a parity exercise. Twelve Data must not quietly widen or narrow the
    product's instrument scope - that is a user-visible product decision, and
    an adapter is not the place to make one. The two providers' accepted type
    sets are pinned together here so a change to either fails this suite.
  */
  const candidateTypes = [
    "Common Stock",
    "Ordinary Shares",
    "Preferred Stock",
    "Preferred Shares",
    "ETF",
    "Mutual Fund",
    "Index",
    "Digital Currency",
    "Physical Currency",
    "Futures",
    "Option",
    "CFD",
    "Commodity",
    "Bond",
    "Trust",
  ];

  for (const type of candidateTypes) {
    const finnhubAccepts = isListedEquitySearchResult({
      symbol: "AAPL",
      type,
    });
    const twelveDataAccepts = SUPPORTED_EQUITY_TYPES.includes(
      type.toLowerCase()
    );

    assert.equal(
      twelveDataAccepts,
      finnhubAccepts,
      `instrument scope diverged for "${type}"`
    );
  }

  // ------------------------------------------------------------------
  // 5. Duplicate tickers keep their exchange qualification
  // ------------------------------------------------------------------
  clearTwelveDataSearchCache();
  stubSearch(async () => ({
    data: {
      data: [
        row({ exchange: "NASDAQ", mic_code: "XNGS" }),
        row({
          exchange: "XETRA",
          mic_code: "XETR",
          country: "Germany",
          currency: "EUR",
        }),
        row({
          exchange: "BMV",
          mic_code: "XMEX",
          country: "Mexico",
          currency: "MXN",
        }),
        // Exact duplicate of the first listing - collapses.
        row({ exchange: "NASDAQ", mic_code: "XNGS" }),
      ],
    },
  }));

  const duplicates = await searchTwelveDataEquities("AAPL", 50);

  assert.equal(
    duplicates.length,
    3,
    "identical listings collapse, but distinct venues must all survive"
  );
  assert.deepEqual(
    duplicates.map((result) => result.micCode),
    ["XNGS", "XETR", "XMEX"]
  );
  assert.deepEqual(
    duplicates.map((result) => result.currency),
    ["USD", "EUR", "MXN"],
    "each listing must keep its own currency - never one venue's currency on another's row"
  );

  // ------------------------------------------------------------------
  // 6. International symbols normalize without losing their venue
  // ------------------------------------------------------------------
  clearTwelveDataSearchCache();
  stubSearch(async () => ({
    data: {
      data: [
        row({
          symbol: "BARC",
          instrument_name: "Barclays PLC",
          exchange: "LSE",
          mic_code: "XLON",
          country: "United Kingdom",
          currency: "GBP",
        }),
        row({
          symbol: "BRK.B",
          instrument_name: "Berkshire Hathaway Inc",
          exchange: "NYSE",
          mic_code: "XNYS",
        }),
        row({
          symbol: "BAC-PL",
          instrument_name: "Bank of America Corp Pref",
          exchange: "NYSE",
          mic_code: "XNYS",
          instrument_type: "Preferred Stock",
        }),
      ],
    },
  }));

  const international = await searchTwelveDataEquities("international", 50);
  assert.deepEqual(
    international.map((result) => result.symbol),
    ["BARC", "BRK.B", "BAC-PL"],
    "dotted, hyphenated and non-US symbols must survive normalization"
  );
  assert.equal(international[0].country, "United Kingdom");
  assert.equal(international[0].currency, "GBP");

  // A symbol that cannot be a listed equity ticker is rejected.
  clearTwelveDataSearchCache();
  stubSearch(async () => ({
    data: {
      data: [
        row({ symbol: "THIS_SYMBOL_IS_FAR_TOO_LONG" }),
        row({ symbol: "BAD SYMBOL" }),
        row({ symbol: "" }),
        row({ symbol: "OK" }),
      ],
    },
  }));

  const shaped = await searchTwelveDataEquities("shape", 50);
  assert.deepEqual(shaped.map((result) => result.symbol), ["OK"]);

  // ------------------------------------------------------------------
  // 7. Empty results stay honestly empty
  // ------------------------------------------------------------------
  clearTwelveDataSearchCache();
  stubSearch(async () => ({ data: { data: [] } }));
  assert.deepEqual(await searchTwelveDataEquities("nothing"), []);

  clearTwelveDataSearchCache();
  stubSearch(async () => ({ data: { data: [row({ instrument_type: "ETF" })] } }));
  assert.deepEqual(
    await searchTwelveDataEquities("etfonly"),
    [],
    "a response containing only unsupported instruments yields an empty list, not a fabricated row"
  );

  // A blank or oversized query never reaches the provider.
  clearTwelveDataSearchCache();
  requestedUrls = [];
  assert.deepEqual(await searchTwelveDataEquities("   "), []);
  assert.deepEqual(await searchTwelveDataEquities("x".repeat(81)), []);
  assert.deepEqual(requestedUrls, []);

  // ------------------------------------------------------------------
  // 8. Malformed responses fail safely
  // ------------------------------------------------------------------
  /*
    Two different failures, deliberately handled two different ways.

    A well-formed object that simply carries no rows is "no results", and an
    empty list is the truthful answer - Twelve Data returns `{data: []}` for a
    query that matched nothing.

    A body that is not an object at all is a protocol failure. Returning an
    empty list there would tell the user "no matches" when what actually
    happened is that the provider did not answer, so it rejects and the route
    reports the outage instead.
  */
  for (const [label, payload] of [
    ["missing data array", { status: "ok" }],
    ["data is an object", { data: { nope: true } }],
  ]) {
    clearTwelveDataSearchCache();
    stubSearch(async () => ({ data: payload }));

    const results = await searchTwelveDataEquities(`malformed-${label}`);
    assert.deepEqual(
      results,
      [],
      `${label} must yield an empty list rather than invented rows`
    );
  }

  for (const [label, payload] of [
    ["null body", null],
    ["string body", "not json"],
    ["array body", []],
  ]) {
    clearTwelveDataSearchCache();
    stubSearch(async () => ({ data: payload }));

    await assert.rejects(
      searchTwelveDataEquities(`unparseable-${label}`),
      /invalid response/,
      `${label} must fail rather than report "no matches"`
    );
  }

  // A provider error body must reject rather than masquerade as "no results".
  clearTwelveDataSearchCache();
  stubSearch(async () => ({
    data: { code: 400, message: "**symbol** parameter is missing", status: "error" },
  }));

  await assert.rejects(
    searchTwelveDataEquities("bad"),
    /parameter is missing/
  );

  // ------------------------------------------------------------------
  // 9. Timeout and rate limit are deterministic
  // ------------------------------------------------------------------
  clearTwelveDataSearchCache();
  stubSearch(async () => {
    throw timeoutError();
  });
  await assert.rejects(searchTwelveDataEquities("slow"), (error) => {
    assert.equal(error.code, "ECONNABORTED");
    return true;
  });

  clearTwelveDataSearchCache();
  stubSearch(async () => {
    throw httpError(429, "You have run out of API credits");
  });
  await assert.rejects(searchTwelveDataEquities("busy"), (error) => {
    assert.equal(error.response.status, 429);
    return true;
  });

  // ------------------------------------------------------------------
  // 10. Caching, coalescing and the request contract
  // ------------------------------------------------------------------
  clearTwelveDataSearchCache();

  let upstreamCalls = 0;
  stubSearch(async () => {
    upstreamCalls += 1;
    return { data: { data: [row()] } };
  });

  await searchTwelveDataEquities("apple");
  await searchTwelveDataEquities("APPLE");
  await searchTwelveDataEquities("  apple  ");

  assert.equal(
    upstreamCalls,
    1,
    "repeat queries differing only in case or padding must share one cached result"
  );

  assert.equal(lastParams.symbol, "apple");
  assert.equal(lastParams.outputsize, 120);
  assert.equal(
    lastParams.apikey,
    "twelve-data-search-test-key",
    "the key travels as a request parameter and never in the response"
  );

  clearTwelveDataSearchCache();
  upstreamCalls = 0;
  let release = null;
  const gate = new Promise((resolve) => {
    release = resolve;
  });

  stubSearch(async () => {
    upstreamCalls += 1;
    await gate;
    return { data: { data: [row()] } };
  });

  const concurrent = Promise.all([
    searchTwelveDataEquities("apple"),
    searchTwelveDataEquities("apple"),
  ]);

  await new Promise((resolve) => setImmediate(resolve));
  release();
  const [firstSearch, secondSearch] = await concurrent;

  assert.equal(upstreamCalls, 1, "concurrent identical searches must coalesce");
  assert.deepEqual(firstSearch, secondSearch);

  // The limit is applied to the returned slice, not to the cached record.
  clearTwelveDataSearchCache();
  stubSearch(async () => ({
    data: {
      data: [
        row({ symbol: "A", mic_code: "XNGS" }),
        row({ symbol: "B", mic_code: "XNGS" }),
        row({ symbol: "C", mic_code: "XNGS" }),
      ],
    },
  }));

  assert.equal((await searchTwelveDataEquities("abc", 2)).length, 2);
  assert.equal((await searchTwelveDataEquities("abc", 3)).length, 3);

  console.log("Twelve Data equity-only search contract tests passed.");
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    axios.get = originalGet;
    clearTwelveDataSearchCache();
  });
