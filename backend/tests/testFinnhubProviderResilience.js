const assert = require("assert");
const axios = require("axios");

const originalGet = axios.get;

process.env.FINNHUB_API_KEY = "test-key";

const {
  getFinnhubQuote,
  getFinnhubCompanyProfile,
  clearFinnhubQuoteCache,
  clearFinnhubProfileCache
} = require("../providers/finnhubProvider");

async function run() {
  let quoteRequestCount = 0;
  let profileRequestCount = 0;

  axios.get = async (url) => {
    if (url.endsWith("/quote")) {
      quoteRequestCount += 1;

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
      profileRequestCount += 1;

      const error =
        new Error(
          "Request failed with status code 429"
        );

      error.response = {
        status: 429,
        data: {}
      };

      throw error;
    }

    throw new Error(
      `Unexpected Finnhub URL: ${url}`
    );
  };

  clearFinnhubQuoteCache();
  clearFinnhubProfileCache();

  const quoteResult =
    await getFinnhubQuote("tsla");

  assert.strictEqual(
    quoteResult.success,
    true
  );
  assert.strictEqual(
    quoteResult.symbol,
    "TSLA"
  );
  assert.strictEqual(
    quoteResult.data.price,
    250
  );
  assert.strictEqual(
    quoteResult.data.company,
    null
  );
  assert.strictEqual(
    quoteResult.companyProfile,
    null
  );
  assert.deepStrictEqual(
    quoteResult.limitations,
    []
  );
  assert.strictEqual(
    quoteRequestCount,
    1
  );
  assert.strictEqual(
    profileRequestCount,
    0
  );

  const profileResult =
    await getFinnhubCompanyProfile("tsla");

  assert.strictEqual(
    profileResult.success,
    false
  );
  assert.strictEqual(
    profileResult.provider,
    "Finnhub"
  );
  assert.strictEqual(
    profileResult.symbol,
    "TSLA"
  );
  assert.strictEqual(
    profileResult.data,
    null
  );
  assert.strictEqual(
    profileResult.error,
    "Finnhub rate limit was reached."
  );
  assert.strictEqual(
    quoteRequestCount,
    1
  );
  assert.strictEqual(
    profileRequestCount,
    1
  );

  console.log(
    "Finnhub quote/profile resilience tests passed."
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
