"use strict";

const assert = require("node:assert/strict");
const { createUserSupabaseClient } = require("../services/createUserSupabaseClient");
const { createEquity, createPolicy, createSchedule, getStatus } = require("../services/personalRiskBootstrapService");
const { readStatus, request, sql } = require("./helpers/localSupabase");

const { apiUrl, publishableKey, secretKey } = readStatus();
const env = { SUPABASE_URL: apiUrl, SUPABASE_PUBLISHABLE_KEY: publishableKey };
const made = [];
const PASSWORD = "azalens-local-test-password";
const RUN = Date.now();
const key = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = (path, options = {}) => request(`${apiUrl}${path}`, { apikey: secretKey, token: secretKey, ...options });
const anonymousRest = (path) => request(`${apiUrl}/rest/v1${path}`, { apikey: publishableKey });

async function user(label) {
  const email = `bootstrap-${label}-${RUN}@azalens.local`;
  const created = await admin("/auth/v1/admin/users", { method: "POST", body: { email, password: PASSWORD, email_confirm: true } });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  made.push(created.body.id);
  const login = await request(`${apiUrl}/auth/v1/token?grant_type=password`, { apikey: publishableKey, method: "POST", body: { email, password: PASSWORD } });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return { id: created.body.id, db: createUserSupabaseClient(login.body.access_token, env) };
}

(async () => {
  try {
    const a = await user("a");
    const b = await user("b");
    const [p1, p2] = await Promise.all([1, 2].map((n) => createPolicy({ db: a.db, userId: a.id, idempotencyKey: key(n) })));
    assert.deepEqual([p1.versionNo, p2.versionNo].sort(), ["1", "2"], "policy versions remain exact strings");
    const replay = await createPolicy({ db: a.db, userId: a.id, idempotencyKey: key(1) });
    assert.equal(replay.policyVersionId, p1.policyVersionId);
    assert.equal(replay.replayed, true);

    const [s1, s2] = await Promise.all([3, 4].map((n) => createSchedule({ db: a.db, userId: a.id, idempotencyKey: key(n) })));
    assert.deepEqual([s1.versionNo, s2.versionNo].sort(), ["1", "2"], "schedule versions remain exact strings");
    assert.equal(sql(`select string_agg(component_code,',' order by component_code) from public.broker_cost_schedule_components where schedule_id='${s2.scheduleVersionId}'`),
      "CLOSE_COMMISSION,FINRA_TAF_REFERENCE,REGULATORY_ALLOWANCE,SEC_REFERENCE");
    const scheduleReplay = await createSchedule({ db: a.db, userId: a.id, idempotencyKey: key(3) });
    assert.equal(scheduleReplay.scheduleVersionId, s1.scheduleVersionId);
    assert.equal(scheduleReplay.replayed, true);

    const observedAt = new Date(Date.now() - 60_000).toISOString().replace(/\.\d{3}Z$/, "Z");
    const e1 = await createEquity({ db: a.db, userId: a.id, idempotencyKey: key(5), accountEquity: "12345678.12345678", observedAt, basisTighteningConfirmed: false });
    assert.equal(e1.dailyEffectiveEquity, "12345678.12345678");
    await assert.rejects(() => createEquity({ db: a.db, userId: a.id, idempotencyKey: key(5), accountEquity: "12345678.12345679", observedAt, basisTighteningConfirmed: false }),
      (error) => error.code === "IDEMPOTENCY_CONFLICT", "conflicting replay maps to the reviewed 409 contract code");
    const equityReplay = await createEquity({ db: a.db, userId: a.id, idempotencyKey: key(5), accountEquity: "12345678.12345678", observedAt, basisTighteningConfirmed: false });
    assert.equal(equityReplay.equitySnapshotId, e1.equitySnapshotId);
    assert.equal(equityReplay.replayed, true);
    await assert.rejects(() => createEquity({ db: a.db, userId: a.id, idempotencyKey: key(8), accountEquity: "2500", observedAt, basisTighteningConfirmed: false }),
      (error) => error.code === "PERSONAL_RISK_INPUT_INVALID", "a lower basis requires explicit tightening confirmation");
    const e2 = await createEquity({ db: a.db, userId: a.id, idempotencyKey: key(6), accountEquity: "2500", observedAt, basisTighteningConfirmed: true });
    assert.equal(e2.dailyEffectiveEquity, "2500.00000000");
    const e3 = await createEquity({ db: a.db, userId: a.id, idempotencyKey: key(7), accountEquity: "2600", observedAt, basisTighteningConfirmed: false });
    assert.equal(e3.dailyEffectiveEquity, "2500.00000000", "higher snapshot cannot raise the basis");

    const own = await getStatus({ db: a.db, userId: a.id, observedAt, operation: "EQUITY_SNAPSHOT", idempotencyKey: key(5) });
    assert.equal(own.pendingIntent.state, "COMMITTED");
    assert.equal(own.pendingIntent.equitySnapshotId, e1.equitySnapshotId);
    assert.equal(own.costSchedule.components.length, 4);
    assert.equal(own.bootstrapComplete, true);
    assert.deepEqual([
      own.policyVersion.max_planned_loss_per_position_pct,
      own.policyVersion.max_aggregate_open_planned_loss_pct,
      own.policyVersion.daily_realized_gross_loss_limit_pct,
      own.policyVersion.weekly_realized_gross_loss_limit_pct,
      own.policyVersion.estimated_exit_slippage_bps,
    ], ["0.500000", "2.000000", "1.000000", "2.500000", "25.0000"]);
    assert.equal(typeof own.policyVersion.version_no, "string");
    assert.equal(typeof own.costSchedule.version_no, "string");
    assert.equal(typeof own.dailyBasis.basis_sequence, "string");
    assert.equal(typeof own.weeklyBasis.basis_sequence, "string");
    assert.equal(own.pendingIntent.dailyEffectiveEquity, "12345678.12345678");
    assert.equal(Object.hasOwn(own.policyVersion, "request_fingerprint"), false);
    assert.equal(Object.hasOwn(own.equitySnapshot, "client_idempotency_key"), false);
    const cases = [
      ["POLICY_VERSION", "personal_risk_policy_versions", key(1)],
      ["COST_SCHEDULE", "broker_cost_schedule_versions", key(3)],
      ["EQUITY_SNAPSHOT", "broker_equity_snapshots", key(5)],
    ];
    for (const [operation, table, committedKey] of cases) {
      const committed = await getStatus({ db: a.db, userId: a.id, observedAt, operation, idempotencyKey: committedKey });
      assert.equal(committed.pendingIntent.state, "COMMITTED", `${operation}: owner resolves its key`);
      const missing = await getStatus({ db: a.db, userId: a.id, observedAt, operation, idempotencyKey: key(999) });
      assert.equal(missing.pendingIntent.state, "NOT_FOUND", `${operation}: missing key is NOT_FOUND`);
      const isolated = await getStatus({ db: b.db, userId: b.id, observedAt, operation, idempotencyKey: committedKey });
      assert.equal(isolated.pendingIntent.state, "NOT_FOUND", `${operation}: other owner cannot resolve key`);
      const ownRead = await a.db.from(table).select("client_idempotency_key").eq("user_id", a.id).eq("client_idempotency_key", committedKey);
      assert.equal(ownRead.error, null);
      assert.equal(ownRead.data.length, 1, `${table}: owner SELECT sees key`);
      const otherRead = await b.db.from(table).select("client_idempotency_key").eq("client_idempotency_key", committedKey);
      assert.equal(otherRead.data.length, 0, `${table}: other owner SELECT sees no key`);
      const anonymous = await anonymousRest(`/${table}?select=client_idempotency_key&client_idempotency_key=eq.${committedKey}`);
      assert.equal(anonymous.status, 401, `${table}: anonymous cannot resolve key`);
      console.log(`PASS database resolver ${operation}: owner=COMMITTED, other-owner=NOT_FOUND, anonymous=401, missing=NOT_FOUND.`);
    }
    const other = await getStatus({ db: b.db, userId: b.id, observedAt, operation: "EQUITY_SNAPSHOT", idempotencyKey: key(5) });
    assert.equal(other.bootstrapComplete, false);
    console.log("PASS database: application RPC/readback used only createUserSupabaseClient(owner JWT + publishable key); elevated credentials were limited to disposable-user setup and cleanup.");
    console.log("PASS database: same-key replay and conflicting replay; distinct concurrent keys created successive policy and schedule versions.");
    console.log("PASS database: atomic equity snapshot plus daily/weekly bases; lower basis tightened and higher snapshot did not raise it.");
    console.log("PASS database: applicable schedule has exactly CLOSE_COMMISSION, FINRA_TAF_REFERENCE, REGULATORY_ALLOWANCE and SEC_REFERENCE.");
    console.log("Personal-risk bootstrap database, RLS, replay, concurrency and basis contracts passed.");
  } finally {
    for (const id of made) {
      const tables = ["broker_cost_schedule_components", "daily_risk_equity_bases", "weekly_risk_equity_bases",
        "broker_equity_snapshots", "broker_cost_schedule_versions", "personal_risk_policy_versions"];
      for (const table of tables) {
        sql(`delete from public.${table} where user_id='${id}'`);
      }
      for (const table of tables) assert.equal(sql(`select count(*) from public.${table} where user_id='${id}'`), "0", `${table} cleanup`);
      const deleted = await admin(`/auth/v1/admin/users/${id}`, { method: "DELETE" });
      assert.equal(deleted.ok, true, JSON.stringify(deleted.body));
      assert.equal(sql(`select count(*) from auth.users where id='${id}'`), "0", "authentication user cleanup");
    }
    console.log("PASS database cleanup: all six affected tables contain zero disposable-user rows and all disposable authentication users are absent.");
  }
})().catch((error) => { console.error(error); process.exit(1); });
