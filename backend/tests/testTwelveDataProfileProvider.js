"use strict";

const assert = require("node:assert/strict");
const axios = require("axios");

process.env.TWELVE_DATA_API_KEY = "test-key";
const originalGet = axios.get;
let calls = 0;
let requestedUrls = [];

axios.get = async (url) => {
  calls += 1;
  requestedUrls.push(url);
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

function stub(handler) {
  requestedUrls = [];
  axios.get = async (url, config) => {
    calls += 1;
    requestedUrls.push(url);
    return handler(url, config);
  };
}

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

    /*
      The profile batch is exactly /profile, /stocks and /logo.

      It must never include /ipo_calendar. That endpoint costs 100 API credits,
      is gated to Pro or Venture and above, and is a date-ranged feed of recent
      and upcoming IPOs - so for a company listed decades ago it returns
      nothing at all. Spending 100 credits to populate one presentation row
      with "Unavailable" is worse than simply saying "Unavailable".
    */
    assert.deepEqual(
      requestedUrls
        .map((url) => url.replace("https://api.twelvedata.com/", ""))
        .sort(),
      ["logo", "profile", "stocks"],
      "the profile batch must be exactly profile + stocks + logo"
    );

    // ----------------------------------------------------------------
    // A missing IPO date stays unavailable and is never filled in
    // ----------------------------------------------------------------
    assert.equal(
      first.data.ipoDate,
      null,
      "Twelve Data supplies no per-symbol historical IPO date, so it stays null"
    );
    assert.ok(
      "ipoDate" in first.data,
      "the field must remain present and explicitly null, not silently dropped"
    );

    const serializedProfile = JSON.stringify(first);
    assert.equal(
      /finnhub/i.test(serializedProfile),
      false,
      "a Twelve Data profile must carry no Finnhub provenance"
    );
    assert.equal(first.provider, "TwelveData");
    assert.equal(first.data.source, "Twelve Data Company Profile");

    // ----------------------------------------------------------------
    // A missing logo degrades the field, never the profile
    // ----------------------------------------------------------------
    provider.clearTwelveDataProfileCache();
    stub(async (url) => {
      if (url.endsWith("/profile")) {
        return {
          data: {
            symbol: "NOLOGO",
            name: "No Logo Inc.",
            exchange: "NASDAQ",
            mic_code: "XNGS",
            sector: "Technology",
            industry: "Software",
            country: "United States",
            website: "https://example.com",
          },
        };
      }

      if (url.endsWith("/stocks")) {
        return {
          data: {
            data: [
              {
                symbol: "NOLOGO",
                currency: "USD",
                exchange: "NASDAQ",
                mic_code: "XNGS",
                country: "United States",
                type: "Common Stock",
              },
            ],
          },
        };
      }

      if (url.endsWith("/logo")) {
        throw new Error("simulated logo outage");
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const withoutLogo = await provider.getTwelveDataCompanyProfile("NOLOGO");

    assert.equal(
      withoutLogo.success,
      true,
      "an optional logo failure must not fail the whole profile"
    );
    assert.equal(withoutLogo.data.logo, null);
    assert.equal(withoutLogo.data.name, "No Logo Inc.");
    assert.equal(withoutLogo.data.currency, "USD");
    assert.equal(withoutLogo.data.industry, "Software");

    // ----------------------------------------------------------------
    // A profile failure is honest - no fabricated fields, no fallback
    // ----------------------------------------------------------------
    provider.clearTwelveDataProfileCache();
    stub(async (url) => {
      if (url.endsWith("/profile")) {
        return {
          data: { code: 404, message: "**symbol** not found", status: "error" },
        };
      }

      if (url.endsWith("/stocks")) return { data: { data: [] } };
      if (url.endsWith("/logo")) return { data: {} };

      throw new Error(`Unexpected URL: ${url}`);
    });

    const failed = await provider.getTwelveDataCompanyProfile("NOSUCH");

    assert.equal(failed.success, false);
    assert.equal(failed.provider, "TwelveData");
    assert.equal(failed.data, null, "a failed profile must not invent data");
    assert.match(failed.error, /not found/);
    assert.equal(
      requestedUrls.some((url) => url.includes("finnhub")),
      false,
      "a Twelve Data profile failure must not reach for Finnhub"
    );

    console.log("Twelve Data profile normalization, listing, cache and deduplication tests passed.");
  } finally {
    axios.get = originalGet;
    provider.clearTwelveDataProfileCache();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
