"use strict";

/* B3b: deterministic provider transitions. All HTTP is stubbed. */
const assert = require("node:assert/strict");
const axios = require("axios");

process.env.FINNHUB_API_KEY = "transition-finnhub-test-key";
process.env.TWELVE_DATA_API_KEY = "transition-twelve-test-key";

const originalAxiosGet = axios.get;
const variables = [
  "QUOTE_PROVIDER", "PROFILE_PROVIDER", "SEARCH_PROVIDER",
  "HISTORY_PROVIDER", "FUNDAMENTALS_PROVIDER",
  "TWELVE_DATA_PROFILE_ENABLED"
];
const saved = Object.fromEntries(
  variables.map((key) => [key, process.env[key]])
);

const adapter = require("../providers/marketDataProvider");
const finnhub = require("../providers/finnhubProvider");
const twelveData = require("../providers/twelveDataProvider");
const { getHistory, getMarketData } = require("../services/marketEngine");
const {
  buildFundamentalsSnapshot,
  buildSharedHistorySummary
} = require("../services/masterAnalysisService");
const { clearAllCache } = require("../utils/cache");

function select(provider) {
  for (const capability of [
    "QUOTE", "PROFILE", "SEARCH", "HISTORY", "FUNDAMENTALS"
  ]) {
    process.env[`${capability}_PROVIDER`] = provider;
  }
  process.env.TWELVE_DATA_PROFILE_ENABLED =
    provider === "twelve_data" ? "true" : "false";
}

function resetCaches() {
  clearAllCache();
  finnhub.clearFinnhubQuoteCache();
  finnhub.clearFinnhubProfileCache();
  finnhub.clearFinnhubSearchCache();
  twelveData.clearTwelveDataQuoteCache();
  twelveData.clearTwelveDataProfileCache();
  twelveData.clearTwelveDataSearchCache();
}

function ledger() {
  return {
    finnhub: { quote: 0, profile: 0, search: 0, history: 0 },
    twelve_data: {
      quote: 0, profile: 0, stocks: 0,
      logo: 0, search: 0, history: 0
    }
  };
}

function installHttpStub(calls) {
  axios.get = async (url) => {
    if (url.includes("finnhub.io") && url.endsWith("/quote")) {
      calls.finnhub.quote += 1;
      return { data: {
        c: 101, pc: 100, o: 100, h: 102, l: 99,
        d: 1, dp: 1, t: 1787356800
      } };
    }
    if (url.includes("finnhub.io") && url.endsWith("/stock/profile2")) {
      calls.finnhub.profile += 1;
      return { data: {
        name: "Finnhub Example", ticker: "EXM", exchange: "NASDAQ",
        country: "US", currency: "USD", finnhubIndustry: "Software"
      } };
    }
    if (url.includes("finnhub.io") && url.endsWith("/search")) {
      calls.finnhub.search += 1;
      return { data: { result: [{
        symbol: "EXM", displaySymbol: "NASDAQ:EXM",
        description: "Finnhub Example", type: "Common Stock"
      }] } };
    }
    if (url.includes("finnhub.io") && url.endsWith("/stock/candle")) {
      calls.finnhub.history += 1;
      return { data: {
        s: "ok", t: [1787184000], o: [10], h: [20],
        l: [5], c: [15], v: [1000]
      } };
    }
    if (url.endsWith("api.twelvedata.com/quote")) {
      calls.twelve_data.quote += 1;
      return { data: {
        symbol: "EXM", name: "Twelve Data Example", exchange: "NASDAQ",
        currency: "USD", close: "202", previous_close: "200",
        change: "2", percent_change: "1", timestamp: 1787356800
      } };
    }
    if (url.endsWith("api.twelvedata.com/profile")) {
      calls.twelve_data.profile += 1;
      return { data: {
        name: "Twelve Data Example", symbol: "EXM", exchange: "NASDAQ",
        country: "United States", sector: "Technology", industry: "Software"
      } };
    }
    if (url.endsWith("api.twelvedata.com/stocks")) {
      calls.twelve_data.stocks += 1;
      return { data: { data: [{
        symbol: "EXM", name: "Twelve Data Example", exchange: "NASDAQ",
        mic_code: "XNGS", country: "United States", currency: "USD",
        type: "Common Stock"
      }] } };
    }
    if (url.endsWith("api.twelvedata.com/logo")) {
      calls.twelve_data.logo += 1;
      return { data: { url: "https://example.test/logo.png" } };
    }
    if (url.endsWith("api.twelvedata.com/symbol_search")) {
      calls.twelve_data.search += 1;
      return { data: { data: [{
        symbol: "EXM", instrument_name: "Twelve Data Example",
        exchange: "NASDAQ", mic_code: "XNGS",
        instrument_type: "Common Stock", country: "United States",
        currency: "USD"
      }] } };
    }
    if (url.endsWith("api.twelvedata.com/time_series")) {
      calls.twelve_data.history += 1;
      return { data: {
        values: [{
          datetime: "2026-08-25", open: "1", high: "2",
          low: "0.5", close: "1.5", volume: "100"
        }],
        meta: { exchange: "NASDAQ", currency: "USD", interval: "1day" }
      } };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
}

const clone = (value) => JSON.parse(JSON.stringify(value));

async function exercise() {
  return {
    quote: await adapter.getQuote("EXM"),
    profile: await adapter.getCompanyProfile("EXM"),
    search: await adapter.searchSymbols("example"),
    history: await getHistory("EXM", "1day"),
    fundamentals: await adapter.getFundamentals("EXM")
  };
}

async function run() {
  const calls = ledger();
  installHttpStub(calls);
  resetCaches();

  try {
    select("finnhub");
    const finnhubCold = await exercise();
    assert.deepEqual(calls.finnhub, {
      quote: 1, profile: 1, search: 1, history: 1
    });
    assert.ok([
      finnhubCold.quote, finnhubCold.profile,
      finnhubCold.history, finnhubCold.fundamentals
    ].every((result) => result.provider === "Finnhub"));

    const afterFinnhubCold = clone(calls);
    const finnhubWarm = await exercise();
    assert.deepEqual(calls, afterFinnhubCold);
    assert.equal(finnhubWarm.quote.cache.status, "HIT");
    assert.equal(finnhubWarm.history.cache, "HIT");

    select("twelve_data");
    const twelveCold = await exercise();
    assert.deepEqual(calls.twelve_data, {
      quote: 1, profile: 1, stocks: 1,
      logo: 1, search: 1, history: 1
    });
    assert.ok([
      twelveCold.quote, twelveCold.profile,
      twelveCold.history, twelveCold.fundamentals
    ].every((result) => result.provider === "TwelveData"));
    assert.ok(twelveCold.search.every(
      (result) => result.provider === "TwelveData"
    ));

    const afterTwelveCold = clone(calls);
    const twelveWarm = await exercise();
    assert.deepEqual(calls, afterTwelveCold);
    assert.equal(twelveWarm.quote.cache.status, "HIT");
    assert.equal(twelveWarm.profile.cache.status, "HIT");
    assert.equal(twelveWarm.history.cache, "HIT");

    select("finnhub");
    const beforeRollback = clone(calls);
    const rollback = await exercise();
    assert.deepEqual(calls, beforeRollback,
      "rollback must reuse only preserved Finnhub cache entries");
    assert.ok([
      rollback.quote, rollback.profile,
      rollback.history, rollback.fundamentals
    ].every((result) => result.provider === "Finnhub"));
    assert.equal(rollback.quote.cache.status, "HIT");
    assert.equal(rollback.history.cache, "HIT");

    resetCaches();
    process.env.QUOTE_PROVIDER = "finnhub";
    process.env.PROFILE_PROVIDER = "twelve_data";
    process.env.HISTORY_PROVIDER = "twelve_data";
    process.env.FUNDAMENTALS_PROVIDER = "finnhub";
    process.env.TWELVE_DATA_PROFILE_ENABLED = "true";

    const market = await getMarketData("EXM");
    const history = await getHistory("EXM", "1day");
    const fundamentals = buildFundamentalsSnapshot({
      market, generatedAt: "2026-08-26T00:00:00.000Z"
    });
    const sharedHistory = buildSharedHistorySummary(history, "EXM");
    assert.equal(market.provider, "Finnhub");
    assert.equal(fundamentals.provider, "Twelve Data Company Profile");
    assert.equal(sharedHistory.provider, "TwelveData");

    const missingProfile = buildFundamentalsSnapshot({
      market: { success: true, companyProfile: { name: "Unknown source" } },
      generatedAt: "2026-08-26T00:00:00.000Z"
    });
    const missingHistory = buildSharedHistorySummary(
      { success: true, bars: [{ close: 1 }] }, "EXM"
    );
    assert.equal(missingProfile.provider, null,
      "missing profile provenance must never be guessed");
    assert.equal(missingHistory.provider, null,
      "missing history provenance must never be guessed");

    console.log("Provider transition matrix tests passed.");
  } finally {
    axios.get = originalAxiosGet;
    resetCaches();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
