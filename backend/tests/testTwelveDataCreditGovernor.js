"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  BASIC_PLAN_ID,
  COORDINATION_MODES,
  TWELVE_DATA_CREDIT_WEIGHTS,
  TWELVE_DATA_PLAN_PRESETS,
  TwelveDataCreditGovernor,
  getTwelveDataCreditSnapshot,
  reserveTwelveDataCredits,
  resolveTwelveDataGovernorRuntime,
} = require("../services/twelveDataCreditGovernor");

async function main() {
  assert.equal(BASIC_PLAN_ID, "basic_internal");
  assert.equal(COORDINATION_MODES.DISABLED, "disabled");
  assert.deepEqual(TWELVE_DATA_CREDIT_WEIGHTS, {
    quote: 1,
    time_series: 1,
    symbol_search: 1,
    profile: 10,
    stocks: 1,
    logo: 1,
    profile_bundle: 12,
  });
  assert.equal(TWELVE_DATA_PLAN_PRESETS.basic_internal.enabled, true);
  assert.equal(TWELVE_DATA_PLAN_PRESETS.basic_internal.creditsPerMinute, 8);
  assert.equal(TWELVE_DATA_PLAN_PRESETS.basic_internal.creditsPerDay, 800);
  for (const planId of ["venture_610", "venture_1597", "venture_2584"]) {
    assert.equal(TWELVE_DATA_PLAN_PRESETS[planId].enabled, false);
    assert.throws(
      () => new TwelveDataCreditGovernor({
        plan: TWELVE_DATA_PLAN_PRESETS[planId],
      }),
      /disabled/
    );
  }

  assert.deepEqual(
    resolveTwelveDataGovernorRuntime({}),
    {
      mode: "disabled",
      enabled: false,
      reason: "coordination_disabled",
      storagePath: null,
      durableLedger: false,
      singleInstanceAcknowledged: false,
      multiInstanceSafe: false,
    }
  );
  assert.equal(
    resolveTwelveDataGovernorRuntime({
      TWELVE_DATA_CREDIT_COORDINATION_MODE: "single_instance",
    }).reason,
    "single_instance_not_acknowledged"
  );
  assert.equal(
    resolveTwelveDataGovernorRuntime({
      TWELVE_DATA_CREDIT_COORDINATION_MODE: "single_instance",
      TWELVE_DATA_SINGLE_INSTANCE_ACK: "true",
      TWELVE_DATA_CREDIT_LEDGER_PATH: "relative/ledger.json",
    }).reason,
    "durable_ledger_path_required"
  );
  assert.equal(
    resolveTwelveDataGovernorRuntime({
      TWELVE_DATA_CREDIT_COORDINATION_MODE: "single_instance",
      TWELVE_DATA_SINGLE_INSTANCE_ACK: "true",
      TWELVE_DATA_CREDIT_LEDGER_PATH: "/durable/ledger.json",
    }).reason,
    "durable_ledger_not_acknowledged"
  );
  const safeSingleInstance = resolveTwelveDataGovernorRuntime({
    TWELVE_DATA_CREDIT_COORDINATION_MODE: "single_instance",
    TWELVE_DATA_SINGLE_INSTANCE_ACK: "true",
    TWELVE_DATA_CREDIT_LEDGER_PATH: "/durable/ledger.json",
    TWELVE_DATA_CREDIT_LEDGER_DURABLE_ACK: "true",
  });
  assert.equal(safeSingleInstance.enabled, true);
  assert.equal(safeSingleInstance.storagePath, "/durable/ledger.json");
  assert.equal(safeSingleInstance.multiInstanceSafe, false);
  for (const mode of ["multi_instance", "shared_atomic"]) {
    const posture = resolveTwelveDataGovernorRuntime({
      TWELVE_DATA_CREDIT_COORDINATION_MODE: mode,
    });
    assert.equal(posture.enabled, false);
    assert.equal(posture.reason, "shared_atomic_coordinator_unavailable");
  }
  assert.equal(
    resolveTwelveDataGovernorRuntime({
      TWELVE_DATA_CREDIT_COORDINATION_MODE: "unknown",
    }).reason,
    "coordination_mode_invalid"
  );

  const disabledSnapshot = getTwelveDataCreditSnapshot();
  assert.equal(disabledSnapshot.coordination.enabled, false);
  assert.equal(disabledSnapshot.coordination.mode, "disabled");
  assert.equal(disabledSnapshot.coordination.multiInstanceSafe, false);
  assert.doesNotMatch(
    JSON.stringify(disabledSnapshot),
    /ledger\.json|api.?key|token|secret|symbol/i
  );

  let now = Date.parse("2026-08-28T10:00:00.000Z");
  const governor = new TwelveDataCreditGovernor({ now: () => now });
  for (let index = 0; index < 8; index += 1) {
    governor.tryReserve(1);
  }
  assert.throws(
    () => governor.tryReserve(1),
    (error) =>
      error.code === "TWELVE_DATA_CREDIT_BUDGET_EXCEEDED" &&
      error.reason === "minute_limit_exhausted"
  );
  assert.throws(
    () => new TwelveDataCreditGovernor().tryReserve(12),
    (error) => error.reason === "request_exceeds_minute_limit"
  );

  now += 60_000;
  governor.tryReserve(8);
  assert.equal(governor.snapshot().accounting.dayCreditsReserved, 16);

  const daily = new TwelveDataCreditGovernor({
    now: () => now,
    plan: {
      id: "daily-test",
      creditsPerMinute: 800,
      creditsPerDay: 800,
      enabled: true,
    },
  });
  daily.tryReserve(800);
  assert.throws(
    () => daily.tryReserve(1),
    (error) => error.reason === "daily_limit_exhausted"
  );

  const refusal = new TwelveDataCreditGovernor({
    now: () => now,
    maxQueueLength: 0,
  });
  refusal.tryReserve(8);
  await assert.rejects(
    refusal.reserve(1, { mode: "queue" }),
    (error) => error.reason === "queue_full"
  );

  const boundedWait = new TwelveDataCreditGovernor({ now: () => now });
  boundedWait.tryReserve(8);
  await assert.rejects(
    boundedWait.reserve(1, { mode: "queue" }),
    (error) => error.reason === "queue_wait_exceeded"
  );

  const snapshotText = JSON.stringify(governor.snapshot());
  assert.match(snapshotText, /basic_internal/);
  assert.doesNotMatch(snapshotText, /api.?key|token|secret|symbol/i);

  const storageDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "azalens-b5a-ledger-")
  );
  const storagePath = path.join(storageDirectory, "ledger.json");
  try {
    const firstProcess = new TwelveDataCreditGovernor({
      now: () => now,
      storagePath,
    });
    firstProcess.tryReserve(5);
    const secondProcess = new TwelveDataCreditGovernor({
      now: () => now,
      storagePath,
    });
    secondProcess.tryReserve(3);
    assert.throws(
      () => firstProcess.tryReserve(1),
      (error) => error.reason === "minute_limit_exhausted"
    );
    assert.equal(fs.statSync(storageDirectory).mode & 0o777, 0o700);
    assert.equal(fs.statSync(storagePath).mode & 0o777, 0o600);
    const ledgerText = fs.readFileSync(storagePath, "utf8");
    assert.doesNotMatch(ledgerText, /api.?key|token|secret|symbol/i);
  } finally {
    fs.rmSync(storageDirectory, { recursive: true, force: true });
  }

  process.env.NODE_ENV = "test";
  process.env.TWELVE_DATA_CREDIT_GOVERNOR_TEST_ENFORCE = "true";
  await assert.rejects(
    reserveTwelveDataCredits("quote"),
    (error) =>
      error.code === "TWELVE_DATA_CREDIT_BUDGET_EXCEEDED" &&
      error.reason === "coordination_disabled"
  );
  process.env.TWELVE_DATA_API_KEY = Buffer.from([
    116, 101, 115, 116,
  ]).toString();
  const axios = require("axios");
  const originalGet = axios.get;
  let transportCalls = 0;
  axios.get = async () => {
    transportCalls += 1;
    throw new Error("Transport must not be reached.");
  };
  try {
    const {
      clearTwelveDataProfileCache,
      getTwelveDataCompanyProfile,
    } = require("../providers/twelveDataProvider");
    clearTwelveDataProfileCache();
    const blocked = await getTwelveDataCompanyProfile("AAPL");
    assert.equal(blocked.success, false);
    assert.equal(blocked.code, "TWELVE_DATA_CREDIT_BUDGET_EXCEEDED");
    assert.equal(transportCalls, 0);
  } finally {
    axios.get = originalGet;
    delete process.env.TWELVE_DATA_API_KEY;
    delete process.env.TWELVE_DATA_CREDIT_GOVERNOR_TEST_ENFORCE;
  }

  console.log("Twelve Data Basic credit governor tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
