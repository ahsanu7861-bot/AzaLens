"use strict";

/*
  The Twelve Data quote adapter reproduces the Finnhub adapter's coalescing
  shape, so it can reproduce the Finnhub adapter's crash.

  The derived pending-quote promise is only awaited by a concurrent caller that
  happens to arrive while it is pending. When none does, nothing attaches a
  rejection handler, and on Node's default settings an unhandled rejection
  terminates the process - a visible outage, not a degraded response.

  This is the Twelve Data equivalent of
  backend/tests/testFinnhubQuoteRejectionSafety.js, and it exists so the fix
  cannot be lost when the Finnhub adapter is eventually deleted in PR C.

  Zero network. Zero provider credits.
*/

const assert = require("node:assert/strict");
const axios = require("axios");

const originalGet = axios.get;

process.env.TWELVE_DATA_API_KEY = "twelve-data-rejection-test-key";

const {
  clearTwelveDataQuoteCache,
  clearTwelveDataSearchCache,
  getTwelveDataQuote,
  searchTwelveDataEquities,
} = require("../providers/twelveDataProvider");

function waitForPendingRejections() {
  return new Promise((resolve) => {
    setImmediate(() => setImmediate(resolve));
  });
}

async function run() {
  axios.get = async (url) => {
    if (url.endsWith("/quote") || url.endsWith("/symbol_search")) {
      throw new Error("simulated Twelve Data network failure");
    }

    throw new Error(`Unexpected Twelve Data URL: ${url}`);
  };

  clearTwelveDataQuoteCache();
  clearTwelveDataSearchCache();

  let unhandledRejection = null;
  const onUnhandledRejection = (error) => {
    unhandledRejection = error;
  };

  process.on("unhandledRejection", onUnhandledRejection);

  try {
    const quote = await getTwelveDataQuote("nflx");

    assert.equal(quote.success, false);
    assert.equal(quote.symbol, "NFLX");
    assert.equal(quote.provider, "TwelveData");

    /*
      The defect only surfaces once the derived pending promise has fully
      settled and Node has run its unhandled-rejection check, which happens on
      a later turn than the rejection itself.
    */
    await waitForPendingRejections();

    assert.equal(
      unhandledRejection,
      null,
      "a rejecting Twelve Data quote must not produce an unhandled rejection"
    );

    // The search path carries the same coalescing shape and the same guard.
    await assert.rejects(
      searchTwelveDataEquities("apple"),
      /simulated Twelve Data network failure/
    );

    await waitForPendingRejections();

    assert.equal(
      unhandledRejection,
      null,
      "a rejecting Twelve Data search must not produce an unhandled rejection"
    );
  } finally {
    process.removeListener("unhandledRejection", onUnhandledRejection);
  }

  console.log("Twelve Data quote rejection safety tests passed.");
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    axios.get = originalGet;
    clearTwelveDataQuoteCache();
    clearTwelveDataSearchCache();
  });
