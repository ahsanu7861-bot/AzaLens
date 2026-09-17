"use strict";

const assert = require("node:assert/strict");
const axios = require("axios");

const { quoteProvenance, historyProvenance } = require("../contracts/marketDataProvenance");
const { validateEnvironment } = require("../scripts/validateEnvironment");
const { buildSharedHistorySummary } = require("../services/masterAnalysisService");

const quote = quoteProvenance({
  success: true,
  provider: "Finnhub",
  data: { timestamp: 1787356800 }, sourceObservation: "DELAYED",
  cache: { hit: false, status: "MISS", ageSeconds: 0 },
});
assert.equal(quote.source_observation, "DELAYED");
assert.ok(quote.limitation_codes.includes("BROKER_VERIFICATION_REQUIRED"));
assert.ok(quote.limitation_codes.includes("CONSOLIDATION_UNVERIFIED"));
assert.doesNotMatch(JSON.stringify(quote), /consolidated quote|NBBO quote/i);

const cached = quoteProvenance({
  success: true, provider: "Finnhub", data: { timestamp: 1787356800 }, sourceObservation: "DELAYED",
  cache: { hit: true, status: "HIT", ageSeconds: 4 },
});
assert.equal(cached.delivery_state, "HIT");
assert.equal(cached.source_observation, "DELAYED");

const failed = quoteProvenance({ success: false, cache: { status: "MISS" } });
assert.equal(failed.source_observation, "UNAVAILABLE");
assert.doesNotMatch(JSON.stringify(failed), /stale success/i);

const history = historyProvenance({ success: true, provider: "AnyHistory", cache: "MISS", interval: "1day", metadata: { latestDate: "2026-08-21" } });
assert.equal(history.source_observation, "EOD");
assert.equal(history.entitlement_display, "UNRESOLVED");

const inactiveTwelveQuote = quoteProvenance({
  success: true, provider: "TwelveData", data: { timestamp: 1787356800 }, sourceObservation: "DELAYED",
  cache: { hit: false, status: "MISS" },
});
assert.equal(inactiveTwelveQuote.source_observation, "DELAYED");
assert.equal(inactiveTwelveQuote.entitlement_display, "UNRESOLVED");
assert.doesNotMatch(JSON.stringify(inactiveTwelveQuote), /display entitled|consolidated/i);

const derived = buildSharedHistorySummary({
  success: true, provider: "TwelveData", cache: "MISS",
  bars: [
    { date: "2026-08-31", open: 10, high: 12, low: 9, close: 11, volume: 100 },
    { date: "2026-09-01", open: 11, high: 13, low: 10, close: 12, volume: 120 },
  ],
}, "AAPL");
assert.equal(derived.barCount, 2);
assert.equal(derived.latestHistoricalClose, 12);
assert.equal("bars" in derived, false);
assert.equal("data" in derived, false);
assert.doesNotMatch(JSON.stringify(derived), /"open"|"high"|"low"|"volume"/);

const production = {
  TWELVE_DATA_CREDIT_COORDINATION_MODE: "shared_atomic",
  APP_ENV: "production",
  FINNHUB_API_KEY: "fixture",
  TWELVE_DATA_API_KEY: "fixture",
  OBSERVABILITY_METRICS_TOKEN: "fixture",
  SUPABASE_URL: "https://jexphwidcfbgxpthgwum.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_notarealkey000000000",
  SUPABASE_SECRET_KEY: "sb_secret_notarealkey000000000",
  CLOSED_DEMO_ENABLED: "true",
  CLOSED_DEMO_ACCESS_CODE: "owner-only-fixture",
  CLOSED_DEMO_SIGNING_SECRET: "s".repeat(40),
  TRUSTED_FRONTEND_ORIGINS: "https://azalens.com",
  PRIVATE_OWNER_USER_ID: "11111111-1111-4111-8111-111111111111",
};
assert.equal(validateEnvironment(production).valid, false);
assert.match(validateEnvironment(production).errors.join(" "), /PRIVATE_PERSONAL_PROVIDER_MODE=true/);
assert.equal(validateEnvironment({ ...production, PRIVATE_PERSONAL_PROVIDER_MODE: "true" }).valid, true);
assert.equal(validateEnvironment({ ...production, PRIVATE_PERSONAL_PROVIDER_MODE: "true", TRUSTED_FRONTEND_ORIGINS: "" }).valid, false);
assert.equal(validateEnvironment({ ...production, PRIVATE_PERSONAL_PROVIDER_MODE: "true", TRUSTED_FRONTEND_ORIGINS: "https://*.vercel.app" }).valid, false);

process.env.PRIVATE_PERSONAL_PROVIDER_MODE = "true";
process.env.TWELVE_DATA_API_KEY = "fixture";
let providerCalls = 0;
const originalGet = axios.get;
axios.get = async () => { providerCalls += 1; throw new Error("must not be called"); };

(async () => {
  try {
    const provider = require("../providers/twelveDataProvider");
    const intraday = await provider.getHistoricalData("AAPL", "5min");
    assert.equal(intraday.success, false);
    assert.equal(intraday.code, "TWELVE_DATA_BASIC_INTRADAY_NOT_ENTITLED");
    assert.equal(providerCalls, 0);

    const serverSource = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "server.js"), "utf8");
    assert.match(serverSource, /RAW_PROVIDER_DATA_NOT_DISPLAY_ENTITLED/);
    const gateSource = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "middleware", "closedDemoGate.js"), "utf8");
    assert.match(gateSource, /private-personal AzaLens workspace is accessible only to its owner/);
    assert.doesNotMatch(serverSource, /retry\s*\(|setInterval\s*\(/);

    console.log("Private-personal entitlement, provenance, fail-closed boot and no-transport intraday tests passed.");
  } finally {
    axios.get = originalGet;
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
