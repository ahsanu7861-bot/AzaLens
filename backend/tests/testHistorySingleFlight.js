"use strict";

/*
  B3a history single-flight contract.

  All HTTP is stubbed. The suite proves request counts, provider-qualified
  isolation and cleanup after failure without making a provider call.
*/

const assert = require("node:assert/strict");
const axios = require("axios");

process.env.FINNHUB_API_KEY = "history-single-flight-finnhub-test-key";
process.env.TWELVE_DATA_API_KEY = "history-single-flight-twelve-test-key";

const originalAxiosGet = axios.get;
const originalHistoryProvider = process.env.HISTORY_PROVIDER;

const {
  clearAllCache
} = require("../utils/cache");
const {
  getHistory
} = require("../services/marketEngine");
const { setGovernorForTests } = require("../services/twelveDataCreditGovernor");

function twelveDataResponse(symbol = "EXM") {
  return {
    data: {
      values: [
        {
          datetime: "2026-08-25",
          open: "1",
          high: "2",
          low: "0.5",
          close: symbol === "ALT" ? "2.5" : "1.5",
          volume: "100"
        }
      ],
      meta: {
        interval: "1day"
      }
    }
  };
}

function finnhubResponse() {
  return {
    data: {
      s: "ok",
      t: [1787616000],
      o: [10],
      h: [20],
      l: [5],
      c: [15],
      v: [1000]
    }
  };
}

async function allowPendingRegistration() {
  await new Promise((resolve) => setImmediate(resolve));
}

async function testIdenticalRequestsCoalesceAndCache() {
  clearAllCache();
  process.env.HISTORY_PROVIDER = "twelve_data";

  let calls = 0;
  let reservations = 0;
  setGovernorForTests({ reserve: async (credits) => { reservations += 1; assert.equal(credits, 1); return { credits }; }, snapshot: () => ({}) });
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });

  axios.get = async (url) => {
    assert.ok(url.endsWith("api.twelvedata.com/time_series"));
    calls += 1;
    await gate;
    return twelveDataResponse();
  };

  const pending = Promise.all([
    getHistory("EXM", "1day"),
    getHistory("EXM", "1day"),
    getHistory("EXM", "1day")
  ]);

  await allowPendingRegistration();
  assert.equal(calls, 1, "one owner must buy the provider request");
  assert.equal(reservations, 1, "one cold coalesced history owner must reserve exactly one credit");
  release();

  const results = await pending;
  assert.deepEqual(
    results.map((result) => result.cache).sort(),
    ["COALESCED", "COALESCED", "MISS"]
  );
  assert.ok(results.every((result) => result.provider === "TwelveData"));
  const coalesced = results.filter((result) => result.cache === "COALESCED");
  assert.ok(coalesced.every((result) => result.provenance.state === "CACHE"));
  assert.ok(coalesced.every((result) => result.provenance.cache.state === "COALESCED"));
  assert.ok(coalesced.every((result) => result.provenance.cache.ageSeconds === 0));

  const cached = await getHistory("EXM", "1day");
  assert.equal(cached.cache, "HIT");
  assert.equal(cached.provenance.state, "CACHE");
  assert.equal(cached.provenance.cache.state, "HIT");
  assert.ok(Number.isFinite(cached.provenance.cache.ageSeconds));
  assert.equal(cached.provenance.sourceTimestamp, results[0].provenance.sourceTimestamp);
  assert.ok(Date.parse(cached.provenance.retrievalTimestamp) >= Date.parse(results[0].provenance.retrievalTimestamp));
  assert.equal(calls, 1, "a cache hit must buy no provider request");
  assert.equal(reservations, 1, "a warm cache hit must reserve zero new credits");
  setGovernorForTests(null);
}

async function testRequestIdentityStaysSeparated() {
  clearAllCache();
  process.env.HISTORY_PROVIDER = "twelve_data";

  let calls = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });

  axios.get = async (url, config) => {
    assert.ok(url.endsWith("api.twelvedata.com/time_series"));
    calls += 1;
    await gate;
    return twelveDataResponse(config?.params?.symbol);
  };

  const pending = Promise.all([
    getHistory("EXM", "1day"),
    getHistory("ALT", "1day"),
    getHistory("EXM", "1week")
  ]);

  await allowPendingRegistration();
  assert.equal(
    calls,
    3,
    "different symbols or intervals must never share an owner"
  );
  release();
  const results = await pending;
  assert.ok(results.every((result) => result.cache === "MISS"));
}

async function testProvidersNeverCoalesce() {
  clearAllCache();

  let twelveCalls = 0;
  let finnhubCalls = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });

  axios.get = async (url) => {
    if (url.endsWith("api.twelvedata.com/time_series")) {
      twelveCalls += 1;
      await gate;
      return twelveDataResponse();
    }

    if (url.endsWith("finnhub.io/api/v1/stock/candle")) {
      finnhubCalls += 1;
      await gate;
      return finnhubResponse();
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  process.env.HISTORY_PROVIDER = "twelve_data";
  const twelvePending = getHistory("EXM", "1day");
  await allowPendingRegistration();

  process.env.HISTORY_PROVIDER = "finnhub";
  const finnhubPending = getHistory("EXM", "1day");
  await allowPendingRegistration();

  assert.equal(twelveCalls, 1);
  assert.equal(finnhubCalls, 1);

  release();
  const [twelveResult, finnhubResult] = await Promise.all([
    twelvePending,
    finnhubPending
  ]);

  assert.equal(twelveCalls, 1);
  assert.equal(finnhubCalls, 1);
  assert.equal(twelveResult.provider, "TwelveData");
  assert.equal(finnhubResult.provider, "Finnhub");
}

async function testFailureClearsThePendingOwner() {
  clearAllCache();
  process.env.HISTORY_PROVIDER = "twelve_data";

  let calls = 0;
  let shouldFail = true;

  axios.get = async () => {
    calls += 1;

    if (shouldFail) {
      const error = new Error("simulated provider timeout");
      error.code = "ECONNABORTED";
      throw error;
    }

    return twelveDataResponse();
  };

  const failed = await Promise.all([
    getHistory("REC", "1day"),
    getHistory("REC", "1day"),
    getHistory("REC", "1day")
  ]);

  assert.equal(calls, 1, "concurrent failures must share one attempt");
  assert.ok(failed.every((result) => result.success === false));

  shouldFail = false;
  const recovered = await getHistory("REC", "1day");
  assert.equal(recovered.success, true);
  assert.equal(recovered.cache, "MISS");
  assert.equal(calls, 2, "the next request must get a new owner after failure");
}

async function testInvalidInputBypassesTheProvider() {
  clearAllCache();
  process.env.HISTORY_PROVIDER = "twelve_data";
  let calls = 0;
  axios.get = async () => {
    calls += 1;
    throw new Error("invalid input reached the provider");
  };

  const invalidSymbol = await getHistory("   ", "1day");
  const invalidInterval = await getHistory("EXM", "not-an-interval");

  assert.equal(invalidSymbol.code, "INVALID_SYMBOL");
  assert.equal(invalidInterval.code, "INVALID_INTERVAL");
  assert.equal(calls, 0);
}

(async () => {
  try {
    await testIdenticalRequestsCoalesceAndCache();
    await testRequestIdentityStaysSeparated();
    await testProvidersNeverCoalesce();
    await testFailureClearsThePendingOwner();
    await testInvalidInputBypassesTheProvider();
    console.log("History single-flight tests passed.");
  } finally {
    axios.get = originalAxiosGet;
    clearAllCache();

    if (originalHistoryProvider === undefined) {
      delete process.env.HISTORY_PROVIDER;
    } else {
      process.env.HISTORY_PROVIDER = originalHistoryProvider;
    }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
