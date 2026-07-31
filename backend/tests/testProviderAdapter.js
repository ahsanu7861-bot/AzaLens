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

console.log("Provider adapter capability configuration tests passed.");
