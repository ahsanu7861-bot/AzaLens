"use strict";

function finnhub() {
  return require("./finnhubProvider");
}

function twelveData() {
  return require("./twelveDataProvider");
}

const DEFAULTS = Object.freeze({
  quote: "finnhub",
  profile: "finnhub",
  search: "finnhub",
  history: "twelve_data",
  fundamentals: "finnhub",
});

function configuredProvider(capability, env = process.env) {
  const key = `${capability.toUpperCase()}_PROVIDER`;
  return String(env[key] || DEFAULTS[capability]).trim().toLowerCase();
}

function unsupported(capability, provider) {
  const error = new Error(
    `${provider} does not implement the ${capability} capability.`,
  );
  error.code = "PROVIDER_CAPABILITY_UNSUPPORTED";
  throw error;
}

function getCapabilityProviders(env = process.env) {
  return Object.fromEntries(
    Object.keys(DEFAULTS).map((capability) => [
      capability,
      configuredProvider(capability, env),
    ]),
  );
}

async function getQuote(symbol) {
  const provider = configuredProvider("quote");
  if (provider === "finnhub") return finnhub().getFinnhubQuote(symbol);
  return unsupported("quote", provider);
}

async function getCompanyProfile(symbol) {
  const provider = configuredProvider("profile");
  if (provider === "finnhub") {
    const result = await finnhub().getFinnhubQuote(symbol);
    return {
      success: result?.success === true && Boolean(result.companyProfile),
      provider: result?.provider || "Finnhub",
      symbol: result?.symbol || String(symbol || "").trim().toUpperCase(),
      data: result?.companyProfile || null,
      error: result?.companyProfile ? null : result?.error || "Company profile unavailable.",
    };
  }
  return unsupported("profile", provider);
}

async function searchSymbols(query, limit) {
  const provider = configuredProvider("search");
  if (provider === "finnhub") return finnhub().searchListedEquities(query, limit);
  return unsupported("search", provider);
}

async function getHistoricalCandles(symbol, interval) {
  const provider = configuredProvider("history");
  if (provider === "twelve_data") {
    return twelveData().getHistoricalData(symbol, interval);
  }
  if (provider === "finnhub") {
    return finnhub().getHistoricalCandles(symbol, interval);
  }
  return unsupported("history", provider);
}

async function getFundamentals(symbol) {
  const provider = configuredProvider("fundamentals");
  if (provider === "finnhub") return getCompanyProfile(symbol);
  return unsupported("fundamentals", provider);
}

module.exports = {
  DEFAULTS,
  getCapabilityProviders,
  getCompanyProfile,
  getFundamentals,
  getHistoricalCandles,
  getQuote,
  searchSymbols,
};
