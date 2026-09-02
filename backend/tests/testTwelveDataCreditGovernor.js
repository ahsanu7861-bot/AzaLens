"use strict";
const assert = require("node:assert/strict");
const { createSharedAtomicCoordinator } = require("../services/twelveDataSharedAtomicCoordinator");
const { SharedAtomicTwelveDataGovernor, TwelveDataCreditBudgetError, getTwelveDataCreditSnapshot, resolveTwelveDataGovernorRuntime, setGovernorForTests } = require("../services/twelveDataCreditGovernor");

async function main() {
  assert.deepEqual(resolveTwelveDataGovernorRuntime({}), { mode: "disabled", enabled: false, reason: "coordination_disabled", durableLedger: false, multiInstanceSafe: false });
  const configured = resolveTwelveDataGovernorRuntime({ TWELVE_DATA_CREDIT_COORDINATION_MODE: "shared_atomic", SUPABASE_URL: "https://example.invalid", SUPABASE_SECRET_KEY: "fake" });
  assert.equal(configured.enabled, true); assert.equal(configured.multiInstanceSafe, true);
  const disabled = getTwelveDataCreditSnapshot({});
  assert.equal(disabled.accounting.minuteCreditsReserved, null);
  assert.equal(disabled.accounting.dayCreditsRemaining, null);
  assert.doesNotMatch(JSON.stringify(disabled), /0\/8|0\/800/);

  let calls = 0;
  const accepted = { accepted: true, reason: null, reserved_at: "2026-09-02T00:00:00Z", minute_credits: 1, day_credits: 1 };
  const governor = new SharedAtomicTwelveDataGovernor({ coordinator: { reserve: async () => { calls += 1; return accepted; } } });
  await governor.reserve(1); assert.equal(calls, 1);

  const daily = new SharedAtomicTwelveDataGovernor({ coordinator: { reserve: async () => ({ ...accepted, accepted: false, reason: "daily_limit_exhausted" }) } });
  await assert.rejects(daily.reserve(1, { mode: "queue" }), (e) => e.reason === "daily_limit_exhausted");
  const minute = new SharedAtomicTwelveDataGovernor({ maxQueueWaitMs: 5, coordinator: { reserve: async () => ({ ...accepted, accepted: false, reason: "minute_limit_exhausted", retry_after_ms: 10 }) } });
  await assert.rejects(minute.reserve(1, { mode: "queue" }), (e) => e.reason === "queue_timeout");
  const outage = new SharedAtomicTwelveDataGovernor({ coordinator: { reserve: async () => { throw new Error("db body secret"); } } });
  await assert.rejects(outage.reserve(1), (e) => e.reason === "coordinator_unavailable" && !e.message.includes("secret"));

  const unavailable = createSharedAtomicCoordinator({ url: "https://example.invalid", secretKey: "fake", fetchImpl: async () => { throw new Error("offline"); } });
  await assert.rejects(unavailable.reserve({ planId: "basic_internal", credits: 1 }), (e) => e.reason === "coordinator_unavailable");
  const invalid = createSharedAtomicCoordinator({ url: "https://example.invalid", secretKey: "fake", fetchImpl: async () => ({ ok: true, json: async () => ({ unexpected: true }) }) });
  await assert.rejects(invalid.reserve({ planId: "basic_internal", credits: 1 }), (e) => e.reason === "coordinator_unavailable");
  let rpcBody;
  const databaseTimed = createSharedAtomicCoordinator({
    url: "https://example.invalid",
    secretKey: "fake",
    fetchImpl: async (_url, options) => {
      rpcBody = JSON.parse(options.body);
      return { ok: true, json: async () => [accepted] };
    },
  });
  await databaseTimed.reserve({ planId: "basic_internal", credits: 1, now: Date.parse("2099-01-01") });
  assert.deepEqual(rpcBody, { p_plan_id: "basic_internal", p_credits: 1 });

  process.env.TWELVE_DATA_API_KEY = "fixture-only";
  const axios = require("axios");
  const originalGet = axios.get;
  let transportCalls = 0;
  axios.get = async () => { transportCalls += 1; throw new Error("provider transport must not run"); };
  setGovernorForTests({
    reserve: async () => { throw new TwelveDataCreditBudgetError("daily_limit_exhausted"); },
    snapshot: () => ({}),
  });
  try {
    const { getHistoricalData } = require("../providers/twelveDataProvider");
    require("../utils/cache").clearAllCache();
    const refused = await getHistoricalData("AAPL", "1day");
    assert.equal(refused.success, false);
    assert.equal(refused.code, "TWELVE_DATA_CREDIT_BUDGET_EXCEEDED");
    assert.equal(refused.reason, "daily_limit_exhausted");
    assert.equal(transportCalls, 0);
  } finally {
    setGovernorForTests(null);
    axios.get = originalGet;
    delete process.env.TWELVE_DATA_API_KEY;
  }
  console.log("Twelve Data shared atomic governor tests passed.");
}
main().catch((error) => { console.error(error); process.exit(1); });
