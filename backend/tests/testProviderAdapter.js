"use strict";

const assert = require("node:assert/strict");

const adapter = require("../providers/marketDataProvider");

assert.deepEqual(adapter.getCapabilityProviders({}), {
  quote: "finnhub",
  profile: "finnhub",
  search: "finnhub",
  history: "twelve_data",
  fundamentals: "finnhub",
});

assert.deepEqual(adapter.getCapabilityProviders({
  QUOTE_PROVIDER: " Twelve_Data ",
  SEARCH_PROVIDER: "finnhub",
}), {
  quote: "twelve_data",
  profile: "finnhub",
  search: "finnhub",
  history: "twelve_data",
  fundamentals: "finnhub",
});

assert.deepEqual(adapter.getProviderCapabilities({}), {
  twelveDataProfile: false,
});
assert.deepEqual(adapter.getProviderCapabilities({
  TWELVE_DATA_PROFILE_ENABLED: "true",
}), {
  twelveDataProfile: true,
});

(async () => {
  const finnhubProvider = require("../providers/finnhubProvider");
  const twelveDataProvider = require("../providers/twelveDataProvider");
  const originalFinnhubProfile = finnhubProvider.getFinnhubCompanyProfile;
  const originalTwelveDataProfile = twelveDataProvider.getTwelveDataCompanyProfile;
  const originalProfileProvider = process.env.PROFILE_PROVIDER;
  const originalProfileEnabled = process.env.TWELVE_DATA_PROFILE_ENABLED;
  let finnhubCalls = 0;
  let twelveDataCalls = 0;

  try {
    finnhubProvider.getFinnhubCompanyProfile = async (symbol) => {
      finnhubCalls += 1;
      return { success: true, provider: "Finnhub", symbol, data: { ticker: symbol } };
    };
    twelveDataProvider.getTwelveDataCompanyProfile = async (symbol) => {
      twelveDataCalls += 1;
      return { success: true, provider: "TwelveData", symbol, data: { ticker: symbol } };
    };

    process.env.PROFILE_PROVIDER = "twelve_data";
    delete process.env.TWELVE_DATA_PROFILE_ENABLED;
    const currentTier = await adapter.getCompanyProfile("AAPL");
    assert.equal(currentTier.provider, "Finnhub");
    assert.equal(finnhubCalls, 1);
    assert.equal(twelveDataCalls, 0,
      "disabled Twelve Data profile capability must spend zero profile calls");

    process.env.TWELVE_DATA_PROFILE_ENABLED = "true";
    const upgradedTier = await adapter.getCompanyProfile("AAPL");
    assert.equal(upgradedTier.provider, "TwelveData");
    assert.equal(twelveDataCalls, 1);
  } finally {
    finnhubProvider.getFinnhubCompanyProfile = originalFinnhubProfile;
    twelveDataProvider.getTwelveDataCompanyProfile = originalTwelveDataProfile;
    if (originalProfileProvider === undefined) delete process.env.PROFILE_PROVIDER;
    else process.env.PROFILE_PROVIDER = originalProfileProvider;
    if (originalProfileEnabled === undefined) delete process.env.TWELVE_DATA_PROFILE_ENABLED;
    else process.env.TWELVE_DATA_PROFILE_ENABLED = originalProfileEnabled;
  }

  console.log("Provider adapter capability configuration and call-budget tests passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
