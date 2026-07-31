"use strict";

const assert = require("node:assert/strict");
const axios = require("axios");

process.env.TWELVE_DATA_API_KEY = "test-key";
const originalGet = axios.get;
let calls = 0;

axios.get = async (url) => {
  calls += 1;
  if (url.endsWith("/profile")) return { data: {
    symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", mic_code: "XNGS",
    sector: "Technology", industry: "Consumer Electronics", country: "United States",
    website: "https://www.apple.com"
  } };
  if (url.endsWith("/stocks")) return { data: { data: [
    { symbol: "AAPL", currency: "EUR", exchange: "VSE", mic_code: "XWBO",
      country: "Austria", type: "Common Stock" },
    { symbol: "AAPL", currency: "USD", exchange: "NASDAQ", mic_code: "XNGS",
      country: "United States", type: "Common Stock" }
  ] } };
  if (url.endsWith("/logo")) return { data: { url: "https://api.twelvedata.com/logo/apple.com" } };
  throw new Error(`Unexpected URL: ${url}`);
};

const provider = require("../providers/twelveDataProvider");

(async () => {
  try {
    const [first, coalesced] = await Promise.all([
      provider.getTwelveDataCompanyProfile("AAPL"),
      provider.getTwelveDataCompanyProfile("AAPL")
    ]);
    assert.equal(first.success, true);
    assert.equal(coalesced.success, true);
    assert.equal(first.data.currency, "USD");
    assert.equal(first.data.exchange, "NASDAQ");
    assert.equal(first.data.sector, "Technology");
    assert.equal(first.data.ipoDate, null);
    assert.equal(calls, 3, "simultaneous requests must share one endpoint batch");

    const cached = await provider.getTwelveDataCompanyProfile("AAPL");
    assert.equal(cached.cache.hit, true);
    assert.equal(calls, 3, "cached profile must not call Twelve Data again");

    const selected = provider.selectCanonicalListing([
      { symbol: "EXM", mic_code: "XWBO", type: "Common Stock" },
      { symbol: "EXM", mic_code: "XNGS", type: "Common Stock" }
    ], { mic_code: "XNGS" }, "EXM");
    assert.equal(selected.mic_code, "XNGS");

    console.log("Twelve Data profile normalization, listing, cache and deduplication tests passed.");
  } finally {
    axios.get = originalGet;
    provider.clearTwelveDataProfileCache();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
