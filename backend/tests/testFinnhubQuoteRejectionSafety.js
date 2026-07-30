const assert = require("assert");
const axios = require("axios");

const originalGet = axios.get;

process.env.FINNHUB_API_KEY = "test-key";

const {
  getFinnhubQuote,
  clearFinnhubQuoteCache,
  clearFinnhubProfileCache
} = require("../providers/finnhubProvider");

function waitForPendingRejections() {
  return new Promise((resolve) => {
    setImmediate(() => setImmediate(resolve));
  });
}

async function run() {
  axios.get = async (url) => {
    if (url.endsWith("/quote")) {
      throw new Error("simulated Finnhub network failure");
    }

    if (url.endsWith("/stock/profile2")) {
      throw new Error("simulated Finnhub network failure");
    }

    throw new Error(`Unexpected Finnhub URL: ${url}`);
  };

  clearFinnhubQuoteCache();
  clearFinnhubProfileCache();

  let unhandledRejection = null;
  const onUnhandledRejection = (error) => {
    unhandledRejection = error;
  };
  process.on(
    "unhandledRejection",
    onUnhandledRejection
  );

  try {
    const result = await getFinnhubQuote("nflx");

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.symbol, "NFLX");

    /*
      The bug this guards against only surfaces once the
      derived pending-quote promise has fully settled and
      Node has had a chance to run its unhandled-rejection
      check, which happens on a later microtask/macrotask
      turn than the rejection itself.
    */
    await waitForPendingRejections();

    assert.strictEqual(
      unhandledRejection,
      null,
      "a rejecting quote must not produce an unhandled rejection"
    );
  } finally {
    process.removeListener(
      "unhandledRejection",
      onUnhandledRejection
    );
  }

  console.log(
    "Finnhub quote rejection safety tests passed."
  );
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    axios.get = originalGet;
    clearFinnhubQuoteCache();
    clearFinnhubProfileCache();
  });
