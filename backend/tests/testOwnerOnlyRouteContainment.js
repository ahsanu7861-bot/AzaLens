"use strict";

const assert = require("node:assert/strict");
const { once } = require("node:events");
const axios = require("axios");

process.env.APP_ENV = "test";
process.env.NODE_ENV = "test";
process.env.CLOSED_DEMO_ENABLED = "true";
process.env.CLOSED_DEMO_ACCESS_CODE = "owner-fixture-only";
process.env.CLOSED_DEMO_SIGNING_SECRET = "s".repeat(40);
process.env.PRIVATE_PERSONAL_PROVIDER_MODE = "true";
process.env.FINNHUB_API_KEY = "fixture";
process.env.TWELVE_DATA_API_KEY = "fixture";
process.env.QUOTE_PROVIDER = "finnhub";
process.env.PROFILE_PROVIDER = "finnhub";
process.env.SEARCH_PROVIDER = "finnhub";
process.env.HISTORY_PROVIDER = "twelve_data";
process.env.FUNDAMENTALS_PROVIDER = "finnhub";
process.env.TWELVE_DATA_PROFILE_ENABLED = "false";

let providerCalls = 0;
const originalGet = axios.get;
axios.get = async () => { providerCalls += 1; throw new Error("provider boundary reached"); };

(async () => {
  const { app } = require("../server");
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  try {
    for (const path of [
      "/api/analyze/AAPL", "/api/search?q=apple", "/stock/AAPL",
      "/history/AAPL", "/rsi/AAPL", "/api/scanner",
    ]) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(response.status, 401, `${path} must be owner-only`);
      const body = await response.json();
      assert.equal(body.code, "CLOSED_DEMO_ACCESS_REQUIRED");
    }
    assert.equal(providerCalls, 0, "unauthorized requests must not reach any provider transport");
    console.log("Owner-only route containment passed for analysis, search and every provider-backed route family; provider calls: 0.");
  } finally {
    server.close();
    await once(server, "close");
    axios.get = originalGet;
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
