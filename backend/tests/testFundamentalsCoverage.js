const assert = require("assert");
const axios = require("axios");

process.env.FINNHUB_API_KEY = "test-key";

const originalGet = axios.get;

axios.get = async (url) => {
  if (url.includes("/quote")) {
    return {
      data: {
        c: 200,
        pc: 198,
        o: 199,
        h: 202,
        l: 197,
        d: 2,
        dp: 1.01,
        t: 1785052800
      }
    };
  }

  if (url.includes("/stock/profile2")) {
    return {
      data: {
        name: "Example Corp",
        ticker: "EXM",
        country: "US",
        currency: "USD",
        exchange: "NASDAQ",
        finnhubIndustry: "Technology",
        ipo: "2000-01-01",
        weburl: "https://example.com",
        logo: "https://example.com/logo.png"
      }
    };
  }

  throw new Error(`Unexpected URL: ${url}`);
};

const {
  getFinnhubCompanyProfile,
  getFinnhubQuote
} = require("../providers/finnhubProvider");

const {
  buildFundamentalsSnapshot
} = require("../services/masterAnalysisService");

(async () => {
  try {
    const quote = await getFinnhubQuote("EXM");
    const profile = await getFinnhubCompanyProfile("EXM");
    const result = {
      ...quote,
      companyProfile: profile.data,
      data: {
        ...quote.data,
        company: profile.data?.name,
        exchange: profile.data?.exchange,
        currency: profile.data?.currency
      }
    };

    assert.equal(result.success, true);
    assert.equal(
      result.companyProfile?.industry,
      "Technology"
    );
    assert.equal(
      result.companyProfile?.source,
      "Finnhub Company Profile"
    );
    assert.ok(
      result.companyProfile?.retrievedAt
    );
    assert.deepEqual(
      result.limitations,
      []
    );

    const fundamentals =
      buildFundamentalsSnapshot({
        market: result,
        generatedAt:
          "2026-07-26T00:00:00.000Z"
      });

    assert.equal(
      fundamentals.status,
      "PARTIAL"
    );
    assert.equal(
      fundamentals.companyProfile
        ?.industry,
      "Technology"
    );
    assert.equal(
      fundamentals.coverage
        ?.financialStatements,
      "UNAVAILABLE"
    );
    assert.deepEqual(
      fundamentals.unavailableSections,
      [
        "financialStatements",
        "valuationAndPeers",
        "earningsAndEstimates",
        "filingsAndOwnership"
      ]
    );

    const unavailable =
      buildFundamentalsSnapshot({
        market: {
          success: true,
          limitations: [
            "Company profile enrichment is unavailable."
          ]
        },
        generatedAt:
          "2026-07-26T00:00:00.000Z"
      });

    assert.equal(
      unavailable.status,
      "UNAVAILABLE"
    );
    assert.equal(
      unavailable.companyProfile,
      null
    );

    console.log(
      "Fundamentals provider and API-contract coverage tests passed."
    );
  } finally {
    axios.get = originalGet;
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
