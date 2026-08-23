"use strict";

/*
  Zero-network contract tests for the Twelve Data quote adapter.

  Every request is served from a hermetic fixture. No provider is contacted and
  no API credit is spent: `axios.get` is replaced for the duration of the run
  and any URL the fixtures do not expect fails the suite loudly rather than
  falling through to the network.
*/

const assert = require("node:assert/strict");
const axios = require("axios");

const originalGet = axios.get;

process.env.TWELVE_DATA_API_KEY = "twelve-data-quote-test-key";

const {
  clearTwelveDataQuoteCache,
  getTwelveDataQuote,
} = require("../providers/twelveDataProvider");

/*
  The documented `/quote` payload, kept whole rather than trimmed to the fields
  under test, so a normalization that silently reads the wrong field cannot
  pass by accident.
*/
function quoteFixture(overrides = {}) {
  return {
    symbol: "AAPL",
    name: "Apple Inc",
    exchange: "NASDAQ",
    mic_code: "XNGS",
    currency: "USD",
    datetime: "2026-08-21",
    timestamp: 1787356800,
    last_quote_at: 1787356740,
    open: "225.10",
    high: "228.40",
    low: "224.55",
    close: "227.30",
    volume: "41230000",
    previous_close: "223.94",
    change: "3.36",
    percent_change: "1.5004",
    average_volume: "52000000",
    is_market_open: false,
    fifty_two_week: {
      low: "164.08",
      high: "260.10",
    },
    ...overrides,
  };
}

let requestedUrls = [];

function stubQuote(handler) {
  requestedUrls = [];
  axios.get = async (url, config) => {
    requestedUrls.push(url);

    if (!url.endsWith("/quote")) {
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
  clearTwelveDataQuoteCache();
  stubQuote(async () => ({ data: quoteFixture() }));

  const normalized = await getTwelveDataQuote("aapl");

  assert.equal(normalized.success, true);
  assert.equal(normalized.provider, "TwelveData");
  assert.equal(normalized.symbol, "AAPL");
  assert.equal(normalized.data.symbol, "AAPL");
  assert.equal(normalized.data.company, "Apple Inc");
  assert.equal(normalized.data.exchange, "NASDAQ");
  assert.equal(normalized.data.currency, "USD");
  assert.equal(normalized.data.price, 227.3);
  assert.equal(normalized.data.previousClose, 223.94);
  assert.equal(normalized.data.open, 225.1);
  assert.equal(normalized.data.high, 228.4);
  assert.equal(normalized.data.low, 224.55);

  /*
    Provider-only session context is reported outside `data`, so the mounted
    quote contract is unchanged and downstream consumers see exactly the field
    set they saw before.
  */
  assert.equal(normalized.providerMetadata.isMarketOpen, false);
  assert.equal(normalized.providerMetadata.micCode, "XNGS");
  assert.equal(normalized.companyProfile, null);
  assert.deepEqual(normalized.limitations, []);
  assert.equal(
    "marketCap" in normalized.data,
    false,
    "the quote contract must not grow fields no mounted screen consumes"
  );

  // ------------------------------------------------------------------
  // 2. Absolute and percentage change
  // ------------------------------------------------------------------
  assert.equal(normalized.data.change, 3.36);

  /*
    `percent_change` is already a PERCENTAGE. A 1.5% move must normalize to
    1.5004, never to the fraction 0.015004. Dividing by 100 here would understate
    every price move on every screen by two orders of magnitude, and the shapes
    would still match, so nothing else would notice.
  */
  assert.equal(normalized.data.changePercent, 1.5004);
  assert.notEqual(
    normalized.data.changePercent,
    1.5004 / 100,
    "percentage change must not be converted to a fraction"
  );

  clearTwelveDataQuoteCache();
  stubQuote(async () => ({
    data: quoteFixture({
      close: "220.00",
      previous_close: "223.94",
      change: "-3.94",
      percent_change: "-1.7594",
    }),
  }));

  const negative = await getTwelveDataQuote("AAPL");
  assert.equal(negative.data.change, -3.94);
  assert.equal(negative.data.changePercent, -1.7594);

  clearTwelveDataQuoteCache();
  stubQuote(async () => ({
    data: quoteFixture({ change: "0", percent_change: "0" }),
  }));

  const flat = await getTwelveDataQuote("AAPL");
  assert.equal(flat.data.change, 0);
  assert.equal(flat.data.changePercent, 0);

  // ------------------------------------------------------------------
  // 3. Timestamp unit and timezone treatment
  // ------------------------------------------------------------------
  /*
    Twelve Data's `timestamp` is a Unix SECOND count, the same unit the existing
    normalized contract already carries from Finnhub. It passes through
    unconverted: downstream code distinguishes seconds from milliseconds by
    magnitude, so multiplying by 1000 here would push every quote time to the
    year 57000 while still looking like a number.

    No timezone conversion happens in the adapter. The value is an absolute
    instant; the display layer owns presentation.
  */
  assert.equal(normalized.data.timestamp, 1787356800);
  assert.ok(
    normalized.data.timestamp < 1e12,
    "quote timestamp must stay in Unix seconds"
  );
  assert.equal(
    new Date(normalized.data.timestamp * 1000).toISOString(),
    "2026-08-22T00:00:00.000Z"
  );
  assert.equal(normalized.providerMetadata.lastQuoteAt, 1787356740);

  // ------------------------------------------------------------------
  // 4. Malformed and unusable responses fail honestly
  // ------------------------------------------------------------------
  for (const [label, payload] of [
    ["empty body", {}],
    ["null body", null],
    ["array body", []],
    ["string body", "not json"],
    ["missing close", quoteFixture({ close: undefined })],
    ["non-numeric close", quoteFixture({ close: "n/a" })],
    ["zero close", quoteFixture({ close: "0" })],
    ["negative close", quoteFixture({ close: "-3" })],
  ]) {
    clearTwelveDataQuoteCache();
    stubQuote(async () => ({ data: payload }));

    const result = await getTwelveDataQuote("AAPL");

    assert.equal(result.success, false, `${label} must fail`);
    assert.equal(result.provider, "TwelveData");
    assert.equal(result.data, undefined, `${label} must not invent data`);
    assert.ok(result.error, `${label} must carry an error message`);
  }

  // A Twelve Data error body arrives with HTTP 200 and must still fail.
  clearTwelveDataQuoteCache();
  stubQuote(async () => ({
    data: { code: 404, message: "**symbol** not found", status: "error" },
  }));

  const notFound = await getTwelveDataQuote("NOSUCH");
  assert.equal(notFound.success, false);
  assert.equal(notFound.code, "TWELVE_DATA_PROVIDER_ERROR");
  assert.match(notFound.error, /not found/);

  // ------------------------------------------------------------------
  // 5. Timeout
  // ------------------------------------------------------------------
  clearTwelveDataQuoteCache();
  stubQuote(async () => {
    throw timeoutError();
  });

  const timedOut = await getTwelveDataQuote("AAPL");
  assert.equal(timedOut.success, false);
  assert.equal(timedOut.code, "TWELVE_DATA_TIMEOUT");
  assert.match(timedOut.error, /timed out/i);
  assert.equal(timedOut.cache.hit, false);

  // ------------------------------------------------------------------
  // 7. Rate limit
  // ------------------------------------------------------------------
  clearTwelveDataQuoteCache();
  stubQuote(async () => {
    throw httpError(429, "You have run out of API credits");
  });

  const rateLimited = await getTwelveDataQuote("AAPL");
  assert.equal(rateLimited.success, false);
  assert.equal(rateLimited.code, "TWELVE_DATA_RATE_LIMIT");
  assert.equal(rateLimited.httpStatus, 429);

  // A 429 delivered in the body rather than the status must classify the same.
  clearTwelveDataQuoteCache();
  stubQuote(async () => ({
    data: { code: 429, message: "API credits exceeded", status: "error" },
  }));

  const bodyRateLimited = await getTwelveDataQuote("AAPL");
  assert.equal(bodyRateLimited.success, false);
  assert.equal(bodyRateLimited.code, "TWELVE_DATA_RATE_LIMIT");

  // ------------------------------------------------------------------
  // 8. Caching and request coalescing
  // ------------------------------------------------------------------
  clearTwelveDataQuoteCache();

  let upstreamCalls = 0;
  let release = null;
  const gate = new Promise((resolve) => {
    release = resolve;
  });

  stubQuote(async () => {
    upstreamCalls += 1;
    await gate;
    return { data: quoteFixture() };
  });

  const concurrent = Promise.all([
    getTwelveDataQuote("AAPL"),
    getTwelveDataQuote("AAPL"),
    getTwelveDataQuote("AAPL"),
  ]);

  await new Promise((resolve) => setImmediate(resolve));
  release();

  const [first, second, third] = await concurrent;

  assert.equal(
    upstreamCalls,
    1,
    "three concurrent callers must buy exactly one provider request"
  );
  assert.equal(first.data.price, 227.3);
  assert.equal(second.data.price, 227.3);
  assert.equal(third.data.price, 227.3);

  const statuses = [first, second, third]
    .map((result) => result.cache.status)
    .sort();
  assert.deepEqual(statuses, ["COALESCED", "COALESCED", "MISS"]);

  // A fourth call is served from cache with no further provider request.
  const cached = await getTwelveDataQuote("AAPL");
  assert.equal(upstreamCalls, 1);
  assert.equal(cached.cache.hit, true);
  assert.equal(cached.cache.status, "HIT");
  assert.equal(cached.data.price, 227.3);

  // ------------------------------------------------------------------
  // 9. An empty symbol is rejected without a provider request
  // ------------------------------------------------------------------
  clearTwelveDataQuoteCache();
  requestedUrls = [];

  const empty = await getTwelveDataQuote("   ");
  assert.equal(empty.success, false);
  assert.equal(empty.code, "INVALID_SYMBOL");
  assert.equal(empty.cache.status, "BYPASS");
  assert.deepEqual(
    requestedUrls,
    [],
    "an invalid symbol must not reach the provider"
  );

  // ------------------------------------------------------------------
  // 10. A missing API key fails before any request
  // ------------------------------------------------------------------
  clearTwelveDataQuoteCache();
  requestedUrls = [];
  const savedKey = process.env.TWELVE_DATA_API_KEY;
  delete process.env.TWELVE_DATA_API_KEY;

  const keyless = await getTwelveDataQuote("AAPL");
  assert.equal(keyless.success, false);
  assert.equal(keyless.code, "TWELVE_DATA_API_KEY_MISSING");
  assert.deepEqual(requestedUrls, []);
  assert.doesNotMatch(
    String(keyless.error),
    /twelve-data-quote-test-key/,
    "a failure message must never contain a key value"
  );

  process.env.TWELVE_DATA_API_KEY = savedKey;

  console.log("Twelve Data quote contract tests passed.");
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    axios.get = originalGet;
    clearTwelveDataQuoteCache();
  });
