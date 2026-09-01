"use strict";

const assert = require("node:assert/strict");
const { once } = require("node:events");
const axios = require("axios");

const ORIGIN = "https://owner.example";
Object.assign(process.env, {
  APP_ENV: "test", NODE_ENV: "test", CLOSED_DEMO_ENABLED: "true",
  CLOSED_DEMO_ACCESS_CODE: "owner-fixture-only", CLOSED_DEMO_SIGNING_SECRET: "s".repeat(40),
  PRIVATE_PERSONAL_PROVIDER_MODE: "true", TRUSTED_FRONTEND_ORIGINS: ORIGIN,
  FINNHUB_API_KEY: "fixture", TWELVE_DATA_API_KEY: "fixture",
  QUOTE_PROVIDER: "finnhub", PROFILE_PROVIDER: "finnhub", SEARCH_PROVIDER: "finnhub",
  HISTORY_PROVIDER: "twelve_data", FUNDAMENTALS_PROVIDER: "finnhub",
  TWELVE_DATA_PROFILE_ENABLED: "false", FEATURE_SCANNER_ENABLED: "true",
});

const SENTINELS = [910001.123, 920002.234, 930003.345, 940004.456, 950005.567];
const sentinelStrings = [...new Set(Array.from({ length: 100 }, (_, index) =>
  SENTINELS.map((sentinel) => String(sentinel + index))).flat())];
let transportCalls = 0;
const originalGet = axios.get;
const originalError = console.error;
const logged = [];
const { safeProviderErrorSummary, sanitizePrivatePersonalPayload } = require("../contracts/privatePersonalBoundary");

function tdFixture() {
  return { data: { values: Array.from({ length: 100 }, (_, index) => ({
    datetime: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    open: String(SENTINELS[0] + index), high: String(SENTINELS[1] + index),
    low: String(SENTINELS[2] + index), close: String(SENTINELS[3] + index),
    volume: String(SENTINELS[4] + index),
  })), meta: { interval: "1day", exchange: "NASDAQ", currency: "USD" } } };
}

axios.get = async (url) => {
  transportCalls += 1;
  if (String(url).includes("twelvedata.com/time_series")) return tdFixture();
  if (String(url).includes("/quote")) return { data: { c: 201.25, pc: 200, o: 200.5, h: 202, l: 199, t: 1788307200 } };
  if (String(url).includes("/stock/profile2")) return { data: { ticker: "AAPL", name: "Apple", country: "US", exchange: "NASDAQ NMS", currency: "USD" } };
  if (String(url).includes("/search")) return { data: { result: [{ symbol: "AAPL", description: "Apple", type: "Common Stock" }] } };
  throw new Error(`Unexpected fixture transport: ${url}`);
};
console.error = (...args) => logged.push(args);

function assertNoSentinels(value, label) {
  const serialized = JSON.stringify(value);
  for (const sentinel of sentinelStrings) {
    const index = serialized.indexOf(sentinel);
    assert.equal(index >= 0, false, `${label} leaked ${sentinel}: ${serialized.slice(Math.max(0, index - 100), index + 140)}`);
  }
  assert.doesNotMatch(serialized, /lastCandle|latestHistoricalClose|todayVolume|averageVolume30|"bars"|"[tohlcv]":\[/);
}

async function request(baseUrl, path, { cookie, origin = ORIGIN, method = "GET", body, secFetchSite } = {}) {
  const headers = {};
  if (origin !== undefined) headers.Origin = origin;
  if (cookie) headers.Cookie = cookie;
  if (secFetchSite) headers["Sec-Fetch-Site"] = secFetchSite;
  if (body) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await response.json(); } catch {}
  return { response, data };
}

(async () => {
  const hostileError = new Error(`credential fixture OHLC ${SENTINELS.join(" ")}`);
  hostileError.code = "ECONNABORTED";
  hostileError.response = { status: 429, data: { code: 429, message: hostileError.message, values: tdFixture().data.values, headers: { Authorization: "apikey fixture" } } };
  const summary = safeProviderErrorSummary(hostileError);
  assertNoSentinels(summary, "safe provider error summary");
  assert.equal(JSON.stringify(summary).includes("fixture"), false);
  const hostilePayload = sanitizePrivatePersonalPayload({ provider: "TwelveData", bars: tdFixture().data.values, data: { t: ["date"], o: [SENTINELS[0]], h: [SENTINELS[1]], l: [SENTINELS[2]], c: [SENTINELS[3]], v: [SENTINELS[4]] } });
  assertNoSentinels(hostilePayload, "central outbound sanitizer");
  const { app } = require("../server");
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const badOrigin of [undefined, "null", "not a url", "https://evil.example"]) {
      const options = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessCode: "owner-fixture-only" }) };
      if (badOrigin !== undefined) options.headers.Origin = badOrigin;
      const deniedUnlock = await fetch(`${baseUrl}/auth/demo/unlock`, options);
      assert.equal(deniedUnlock.status, 403);
    }
    const unlocked = await request(baseUrl, "/auth/demo/unlock", { method: "POST", body: { accessCode: "owner-fixture-only" } });
    assert.equal(unlocked.response.status, 200);
    const cookie = unlocked.response.headers.get("set-cookie").split(";")[0];
    const malformedCookie = await request(baseUrl, "/stock/AAPL", { cookie: "azalens_owner_access=%E0%A4%A" });
    assert.equal(malformedCookie.response.status, 401);

    const missingOrigin = await fetch(`${baseUrl}/stock/AAPL`, { headers: { Cookie: cookie } });
    assert.equal(missingOrigin.status, 403);
    assert.equal(transportCalls, 0);
    for (const origin of ["null", "not a url", "https://evil.example"]) {
      const before = transportCalls;
      const denied = await request(baseUrl, "/stock/AAPL", { cookie, origin });
      assert.equal(denied.response.status, 403);
      assert.equal(transportCalls, before);
    }
    const crossSite = await request(baseUrl, "/api/analyze/AAPL", { cookie, secFetchSite: "cross-site" });
    assert.equal(crossSite.response.status, 403);
    assert.equal(transportCalls, 0);

    const legacy = ["/history/AAPL", "/rsi/AAPL", "/ema/AAPL", "/sma/AAPL", "/macd/AAPL", "/bollinger/AAPL", "/atr/AAPL", "/adx/AAPL", "/obv/AAPL", "/rvol/AAPL", "/volume-spike/AAPL", "/candlestick/AAPL"];
    for (const path of legacy) {
      const result = await request(baseUrl, path, { cookie });
      assert.ok([200, 403].includes(result.response.status), `${path}: ${result.response.status}`);
      assertNoSentinels(result.data, path);
    }

    const analysis = await request(baseUrl, "/api/analyze/AAPL", { cookie });
    assert.equal(analysis.response.status, 200);
    assert.equal(analysis.data?.data?.priceContext?.analysisPrice, 201.25);
    assertNoSentinels(analysis.data, "complete analysis response");

    const scanner = await request(baseUrl, "/api/scanner", { cookie, method: "POST", body: { symbols: ["NVDA"] } });
    assert.equal(scanner.response.status, 200);
    assertNoSentinels(scanner.data, "scanner response");
    assert.equal("close" in scanner.data.data.results[0].metrics, false);

    axios.get = async () => { throw hostileError; };
    const failedHistory = await require("../providers/twelveDataProvider").getHistoricalData("ERR", "1day");
    assert.equal(failedHistory.success, false);
    assertNoSentinels(failedHistory, "provider error object");
    assertNoSentinels(logged, "logs");
    assert.equal(JSON.stringify(logged).includes("fixture"), false, "credentials must not reach logs");
    console.log = console.log;
    originalError("Private-personal response, scanner, legacy-route and cross-site boundaries passed; all transports were fixture-only.");
  } finally {
    server.close(); await once(server, "close"); axios.get = originalGet; console.error = originalError;
  }
})().catch((error) => { axios.get = originalGet; console.error = originalError; console.error(error); process.exitCode = 1; });
