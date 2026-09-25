"use strict";

const assert = require("node:assert/strict");
const {
  EQUITY_CONSTANTS, EXPECTED_COMPONENTS, POLICY_ARGUMENTS, RPC_NAMES, SCHEDULE_ARGUMENTS, SCHEDULE_CONTRACT,
  createEquity, createPolicy, createSchedule, getStatus, mapDatabaseError, newYorkPeriods,
} = require("../services/personalRiskBootstrapService");

const IDS = Object.freeze({
  policy: "10000000-0000-4000-8000-000000000001",
  schedule: "10000000-0000-4000-8000-000000000002",
  snapshot: "10000000-0000-4000-8000-000000000003",
  daily: "10000000-0000-4000-8000-000000000004",
  weekly: "10000000-0000-4000-8000-000000000005",
});

function query(result, calls, table) {
  const builder = {
    select(columns) { calls.push({ table, columns }); return builder; },
    eq() { return builder; }, order() { return builder; }, limit() { return builder; }, lte() { return builder; }, or() { return builder; },
    then(resolve) { resolve(result && Object.hasOwn(result, "data") ? result : { data: result || [], error: null }); },
  };
  return builder;
}

function mockDb({ rpcResult, tables = {} }) {
  const calls = [];
  const queues = Object.fromEntries(Object.entries(tables).map(([name, values]) => [name, Array.isArray(values) &&
    values.length && Array.isArray(values[0]) ? [...values] : [values]]));
  return {
    calls,
    rpc: async (name, args) => { calls.push({ rpc: name, args }); return rpcResult; },
    from(table) {
      const values = queues[table] || [[]];
      const value = values.length > 1 ? values.shift() : values[0];
      return query(value, calls, table);
    },
  };
}

async function responseInvalid(work) {
  await assert.rejects(work, (error) => error.code === "PERSONAL_RISK_RESPONSE_INVALID" &&
    error.message === "PERSONAL_RISK_RESPONSE_INVALID");
}

(async () => {
  assert.deepEqual(Object.values(RPC_NAMES).sort(), [
    "create_broker_cost_schedule_version", "create_broker_equity_snapshot", "create_personal_risk_policy_version",
  ]);
  assert.equal(POLICY_ARGUMENTS.p_estimated_exit_slippage_bps, "25.0000");
  assert.deepEqual(EXPECTED_COMPONENTS, ["CLOSE_COMMISSION", "FINRA_TAF_REFERENCE", "REGULATORY_ALLOWANCE", "SEC_REFERENCE"]);
  assert.equal(EQUITY_CONSTANTS.confirmationMethod, "OWNER_CONFIRMED_BROKER_VALUE");
  assert.equal(EQUITY_CONSTANTS.brokerIdentifier, "Saxo MENA");
  assert.equal(Object.values(SCHEDULE_ARGUMENTS).includes("REALIZED_HISTORICAL_COST"), false);
  assert.deepEqual(SCHEDULE_CONTRACT, { brokerLegalEntity: "Saxo Bank", finraSourceEffectiveFrom: "2026-01-01" });

  let db = mockDb({ rpcResult: { data: [{ policy_version_id: IDS.policy, version_no: 9e30, replayed: false }], error: null },
    tables: { personal_risk_policy_versions: [{ id: IDS.policy, version_no_text: "1" }] } });
  assert.deepEqual(await createPolicy({ db, userId: "owner", idempotencyKey: "key" }),
    { policyVersionId: IDS.policy, versionNo: "1", replayed: false });
  assert.equal(db.calls.filter((call) => call.rpc).length, 1);
  assert.match(db.calls.find((call) => call.table).columns, /version_no::text/);

  db = mockDb({ rpcResult: { data: [{ schedule_version_id: IDS.schedule, version_no: 9e30, replayed: true }], error: null },
    tables: { broker_cost_schedule_versions: [{ id: IDS.schedule, version_no_text: "2", broker_legal_entity: "Saxo Bank" }] } });
  assert.deepEqual(await createSchedule({ db, userId: "owner", idempotencyKey: "key" }),
    { scheduleVersionId: IDS.schedule, versionNo: "2", replayed: true });
  for (const broker_legal_entity of ["Unverified Broker", "Wrong Broker Group"]) {
    db = mockDb({ rpcResult: { data: [{ schedule_version_id: IDS.schedule, replayed: false }], error: null },
      tables: { broker_cost_schedule_versions: [{ id: IDS.schedule, version_no_text: "1", broker_legal_entity }] } });
    await responseInvalid(() => createSchedule({ db, userId: "owner", idempotencyKey: "key" }));
  }

  const equityRpc = { data: [{ equity_snapshot_id: IDS.snapshot, daily_basis_id: IDS.daily,
    weekly_basis_id: IDS.weekly, daily_effective_equity: 1e20, weekly_effective_equity: 1e20, replayed: false }], error: null };
  db = mockDb({ rpcResult: equityRpc, tables: {
    daily_risk_equity_bases: [[], [{ id: IDS.daily, source_snapshot_id: IDS.snapshot, effective_equity_text: "12345678.12345678" }]],
    weekly_risk_equity_bases: [[], [{ id: IDS.weekly, source_snapshot_id: IDS.snapshot, effective_equity_text: "12345678.12345678" }]],
  } });
  const equity = await createEquity({ db, userId: "owner", idempotencyKey: "key", accountEquity: "12345678.12345678",
    observedAt: "2026-09-21T15:00:37Z", basisTighteningConfirmed: false });
  assert.deepEqual([equity.dailyEffectiveEquity, equity.weeklyEffectiveEquity], ["12345678.12345678", "12345678.12345678"]);
  assert.equal(db.calls.filter((call) => call.rpc).length, 1, "mutation RPC is invoked once");
  const confirmationReference = db.calls.find((call) => call.rpc).args.p_confirmation_reference;
  assert.equal(confirmationReference,
    "saxo-owner-evidence://account-summary/20260921T150037Z");
  assert.equal(confirmationReference.length, 54);
  assert.match(confirmationReference, /^[\x20-\x7e]{1,240}$/);

  for (const [databaseCode, publicCode] of Object.entries({
    23505: "IDEMPOTENCY_CONFLICT", 22003: "NUMERIC_PRECISION_INVALID", 22023: "PERSONAL_RISK_INPUT_INVALID", 42501: "PERSONAL_RISK_FORBIDDEN",
    XX999: "PERSONAL_RISK_UNAVAILABLE",
  })) {
    assert.throws(() => mapDatabaseError({ code: databaseCode, message: "MESSAGE_SENTINEL", details: "DETAILS_SENTINEL", hint: "HINT_SENTINEL", sql: "SQL_SENTINEL" }),
      (error) => error.code === publicCode && !/SENTINEL/.test(JSON.stringify(error)));
  }

  for (const malformed of [[], [{ id: IDS.policy, version_no_text: "1" }, { id: IDS.policy, version_no_text: "2" }]]) {
    db = mockDb({ rpcResult: { data: [{ policy_version_id: IDS.policy, replayed: false }], error: null },
      tables: { personal_risk_policy_versions: malformed } });
    await responseInvalid(() => createPolicy({ db, userId: "owner", idempotencyKey: "key" }));
  }
  db = mockDb({ rpcResult: equityRpc, tables: {
    daily_risk_equity_bases: [[{ id: IDS.daily, effective_equity_text: "1e-7" }]], weekly_risk_equity_bases: [[]],
  } });
  await responseInvalid(() => createEquity({ db, userId: "owner", idempotencyKey: "key", accountEquity: "1",
    observedAt: "2026-09-21T15:00:37Z", basisTighteningConfirmed: false }));

  const scheduleRow = { id: IDS.schedule, version_no_text: "1", broker_legal_entity: "Saxo Bank", pricing_tier: "Classic",
    account_currency: "USD", instrument_scope: "LONG_US_LISTED_CASH_EQUITY", effective_from: "2026-09-19", effective_through: null,
    maximum_modeled_sell_proceeds_text: "100000.00000000", maximum_modeled_exit_quantity_text: "10000.00000000",
    evidence_reference: "fixture:evidence", evidence_captured_at: "2026-09-18T21:00:43Z", created_at: "2026-09-19T00:00:00Z" };
  const componentRow = (component_code, source_effective_from = "2026-01-01") => ({ id: IDS.policy, schedule_id: IDS.schedule,
    component_code, evidence_class: "REGULATOR_PUBLISHED", application_mode: "REFERENCE_ONLY", proceeds_rate_text: null,
    quantity_rate_text: null, minimum_amount_text: null, maximum_amount_text: null, fixed_amount_text: null,
    source_authority: "Fixture", source_reference: "fixture:source", source_effective_from, evidence_limitations: "Fixture limitation" });
  const components = EXPECTED_COMPONENTS.map((code) => componentRow(code));
  db = mockDb({ tables: { personal_risk_policy_versions: [], broker_cost_schedule_versions: [scheduleRow], broker_equity_snapshots: [],
    daily_risk_equity_bases: [], weekly_risk_equity_bases: [], broker_cost_schedule_components: components } });
  assert.equal((await getStatus({ db, userId: "owner", observedAt: "2026-09-21T15:00:37Z" })).costSchedule.broker_legal_entity, "Saxo Bank");
  db = mockDb({ tables: { personal_risk_policy_versions: [], broker_cost_schedule_versions: [scheduleRow], broker_equity_snapshots: [],
    daily_risk_equity_bases: [], weekly_risk_equity_bases: [], broker_cost_schedule_components:
      components.map((row) => row.component_code === "FINRA_TAF_REFERENCE" ? { ...row, source_effective_from: null } : row) } });
  await responseInvalid(() => getStatus({ db, userId: "owner", observedAt: "2026-09-21T15:00:37Z" }));

  const emptyStatus = { personal_risk_policy_versions: [], broker_cost_schedule_versions: [], broker_equity_snapshots: [] };
  for (const [label, daily, weekly, succeeds] of [
    ["zero", [], [], false],
    ["one", [{ id: IDS.daily, effective_equity_text: "12345678.12345678" }], [{ id: IDS.weekly, effective_equity_text: "12345678.12345678" }], true],
    ["multiple", [{ id: IDS.daily, effective_equity_text: "1" }, { id: IDS.daily, effective_equity_text: "1" }], [{ id: IDS.weekly, effective_equity_text: "1" }], false],
  ]) {
    db = mockDb({ tables: { ...emptyStatus, broker_equity_snapshots: [[], [{ id: IDS.snapshot }]],
      daily_risk_equity_bases: [[], daily], weekly_risk_equity_bases: [[], weekly] } });
    const work = () => getStatus({ db, userId: "owner", observedAt: "2026-09-21T15:00:37Z",
      operation: "EQUITY_SNAPSHOT", idempotencyKey: "key" });
    if (succeeds) assert.equal((await work()).pendingIntent.dailyEffectiveEquity, "12345678.12345678", label);
    else await responseInvalid(work);
  }

  assert.deepEqual(newYorkPeriods(new Date("2026-03-09T03:59:59Z")), { day: "2026-03-08", week: "2026-03-02" });
  assert.deepEqual(newYorkPeriods(new Date("2026-03-09T04:00:00Z")), { day: "2026-03-09", week: "2026-03-09" });
  assert.deepEqual(newYorkPeriods(new Date("2025-11-03T04:59:59Z")), { day: "2025-11-02", week: "2025-10-27" });
  assert.deepEqual(newYorkPeriods(new Date("2025-11-03T05:00:00Z")), { day: "2025-11-03", week: "2025-11-03" });
  console.log("PASS service: immutable UUID readback uses PostgreSQL text casts and exact one-row cardinality.");
  console.log("PASS service: equity RPC is invoked once; parsed RPC numerics are ignored; exact text basis readback is returned.");
  console.log("PASS service: pending equity zero/one/multiple cardinality and exponent-form internal decimals are validated.");
  console.log("PASS service: exact database error mapping exposes no database message, details, hint or SQL.");
  console.log("PASS service: New York midnight, Monday, spring-DST and fall-DST boundaries are enforced on both sides.");
  console.log("PASS service: derived confirmation reference is exact, length 54 and printable ASCII within 1..240.");
  console.log("PASS service: cost-schedule mutation readback requires Saxo Bank and status requires FINRA source-effective date 2026-01-01.");
  console.log("Personal-risk bootstrap service contracts passed.");
})().catch((error) => { console.error(error); process.exit(1); });
