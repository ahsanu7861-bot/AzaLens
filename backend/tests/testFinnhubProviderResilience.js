const assert = require("assert");
const axios = require("axios");

const originalGet = axios.get;

process.env.FINNHUB_API_KEY = "test-key";

const {
  getFinnhubQuote,
  clearFinnhubQuoteCache,
  clearFinnhubProfileCache
} = require("../providers/finnhubProvider");

async function run() {
  axios.get = async (url) => {
    if (url.endsWith("/quote")) {
      return {
        data: {
          c: 250,
          pc: 245,
          o: 247,
          h: 252,
          l: 246,
          d: 5,
          dp: 2.04,
          t: 1785000000
        }
      };
    }

    if (url.endsWith("/stock/profile2")) {
      const error =
        new Error("Request failed with status code 429");

      error.response = {
        status: 429,
        data: {}
      };

      throw error;
    }

    throw new Error(`Unexpected Finnhub URL: ${url}`);
  };

  clearFinnhubQuoteCache();
  clearFinnhubProfileCache();

  const result =
    await getFinnhubQuote("tsla");

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.symbol, "TSLA");
  assert.strictEqual(result.data.price, 250);
  assert.strictEqual(result.data.company, null);
  assert.deepStrictEqual(
    result.limitations,
    [
      "Company profile enrichment is unavailable: Finnhub rate limit was reached."
    ]
  );

  console.log(
    "Finnhub provider resilience tests passed."
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
