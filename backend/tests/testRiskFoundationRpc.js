"use strict";

const assert = require("node:assert/strict");
const { readStatus, request, sql } = require("./helpers/localSupabase");

const { apiUrl, publishableKey, secretKey } = readStatus();
const RUN = Date.now();
const PASSWORD = "azalens-local-test-password";
const created = [];

const admin = (path, options = {}) =>
  request(`${apiUrl}${path}`, { apikey: secretKey, token: secretKey, ...options });
const rest = (path, token, options = {}) =>
  request(`${apiUrl}/rest/v1${path}`, { apikey: publishableKey, token, ...options });

async function makeUser(label) {
  const email = `risk007-${label}-${RUN}@azalens.local`;
  const made = await admin("/auth/v1/admin/users", {
    method: "POST", body: { email, password: PASSWORD, email_confirm: true },
  });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  created.push(made.body.id);
  const login = await request(`${apiUrl}/auth/v1/token?grant_type=password`, {
    apikey: publishableKey, method: "POST", body: { email, password: PASSWORD },
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return { id: made.body.id, token: login.body.access_token };
}

const uuid = (suffix) => `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const policy = (key, extra = {}) => ({
  p_client_idempotency_key: key,
  p_max_planned_loss_per_position_pct: "0.500000",
  p_max_aggregate_open_planned_loss_pct: "2.000000",
  p_daily_realized_gross_loss_limit_pct: "1.000000",
  p_weekly_realized_gross_loss_limit_pct: "2.500000",
  p_maximum_concurrent_open_positions: 5,
  p_estimated_exit_slippage_bps: "10.0000",
  ...extra,
});
const equity = (key, amount, observedAt, extra = {}) => ({
  p_client_idempotency_key: key,
  p_account_equity: amount,
  p_currency: "USD",
  p_broker_identifier: "Fixture Broker",
  p_confirmation_method: "OWNER_CONFIRMED_BROKER_VALUE",
  p_confirmation_reference: `fixture:${key}`,
  p_observed_at: observedAt,
  ...extra,
});

(async () => {
  try {
    const A = await makeUser("a");
    const B = await makeUser("b");

    const p1 = await rest("/rpc/create_personal_risk_policy_version", A.token, {
      method: "POST", body: policy(uuid(1)),
    });
    assert.equal(p1.status, 200, JSON.stringify(p1.body));
    assert.equal(p1.body[0].version_no, 1);
    assert.equal(p1.body[0].replayed, false);

    const replay = await rest("/rpc/create_personal_risk_policy_version", A.token, {
      method: "POST", body: policy(uuid(1)),
    });
    assert.equal(replay.status, 200);
    assert.equal(replay.body[0].policy_version_id, p1.body[0].policy_version_id);
    assert.equal(replay.body[0].replayed, true);

    const conflict = await rest("/rpc/create_personal_risk_policy_version", A.token, {
      method: "POST", body: policy(uuid(1), { p_estimated_exit_slippage_bps: "11.0000" }),
    });
    assert.equal(conflict.status, 409, JSON.stringify(conflict.body));

    const parallel = await Promise.all([2, 3, 4, 5].map((n) =>
      rest("/rpc/create_personal_risk_policy_version", A.token, {
        method: "POST", body: policy(uuid(n), { p_estimated_exit_slippage_bps: `${10 + n}.0000` }),
      })
    ));
    assert.ok(parallel.every((r) => r.status === 200), JSON.stringify(parallel.map((r) => r.status)));
    assert.deepEqual(parallel.map((r) => Number(r.body[0].version_no)).sort((a, b) => a - b), [2, 3, 4, 5]);

    const policyRows = await rest("/personal_risk_policy_versions?select=*", A.token);
    assert.equal(policyRows.status, 200);
    assert.equal(policyRows.body.length, 5);
    assert.ok(policyRows.body.every((row) =>
      row.portfolio_value_basis === "BROKER_CONFIRMED_ACCOUNT_EQUITY" &&
      row.thesis_and_protective_stop_separate === true &&
      row.protective_stop_evidence_policy === "OWNER_DECLARED_OR_BROKER_CONFIRMED_RECORDED_AS_SUCH" &&
      row.position_basis_method === "WEIGHTED_AVERAGE_SINGLE_AGGREGATED_POSITION" &&
      row.planned_loss_cost_basis === "REMAINING_EXIT_FEES_TAXES_AND_POLICY_SLIPPAGE" &&
      row.planned_loss_recalculation === "CURRENT_REMAINING_QUANTITY_WEIGHTED_ENTRY_STOP_AND_ESTIMATED_EXIT_COSTS" &&
      row.realized_pnl_cost_basis === "ACTUAL_ENTRY_AND_EXIT_FEES_AND_TAXES" &&
      row.realized_loss_aggregation === "LOSING_TRADES_GROSS_NO_WINNER_OFFSET" &&
      row.aggregate_open_loss_floor === "ZERO_PER_POSITION" &&
      row.protective_stop_required_for_risk_increase === true &&
      row.stop_loosening_is_risk_increasing === true &&
      row.risk_reducing_exit_always_permitted === true &&
      row.period_timezone === "America/New_York"
    ));

    const times = ["2026-09-17T14:00:00Z", "2026-09-17T15:00:00Z", "2026-09-17T16:00:00Z"];
    const amounts = ["100000.00000000", "90000.00000000", "95000.00000000"];
    const snapshots = [];
    for (let i = 0; i < times.length; i += 1) {
      const response = await rest("/rpc/create_broker_equity_snapshot", A.token, {
        method: "POST", body: equity(uuid(100 + i), amounts[i], times[i]),
      });
      assert.equal(response.status, 200, JSON.stringify(response.body));
      snapshots.push(response.body[0]);
    }
    assert.deepEqual(snapshots.map((x) => x.daily_effective_equity), ["100000.00000000", "90000.00000000", "90000.00000000"]);
    assert.deepEqual(snapshots.map((x) => x.weekly_effective_equity), ["100000.00000000", "90000.00000000", "90000.00000000"]);

    const basis = await rest("/daily_risk_equity_bases?select=id,previous_basis_id,effective_equity&period_start=eq.2026-09-17&order=recorded_at.asc", A.token);
    assert.equal(basis.status, 200);
    assert.equal(basis.body.length, 3);
    assert.equal(basis.body[0].previous_basis_id, null);
    assert.equal(basis.body[1].previous_basis_id, basis.body[0].id);
    assert.equal(basis.body[2].previous_basis_id, basis.body[1].id);

    const equityReplay = await rest("/rpc/create_broker_equity_snapshot", A.token, {
      method: "POST", body: equity(uuid(100), amounts[0], times[0]),
    });
    assert.equal(equityReplay.status, 200);
    assert.equal(equityReplay.body[0].equity_snapshot_id, snapshots[0].equity_snapshot_id);
    assert.equal(equityReplay.body[0].replayed, true);

    const future = await rest("/rpc/create_broker_equity_snapshot", A.token, {
      method: "POST", body: equity(uuid(200), "100000", "2099-01-01T00:00:00Z"),
    });
    assert.equal(future.status, 400, JSON.stringify(future.body));

    const overprecision = await rest("/rpc/create_personal_risk_policy_version", A.token, {
      method: "POST", body: policy(uuid(201), { p_max_planned_loss_per_position_pct: "0.5000001" }),
    });
    assert.equal(overprecision.status, 400, JSON.stringify(overprecision.body));

    for (const table of ["personal_risk_policy_versions", "broker_equity_snapshots", "daily_risk_equity_bases", "weekly_risk_equity_bases"]) {
      const hidden = await rest(`/${table}?select=*`, B.token);
      assert.equal(hidden.status, 200);
      assert.equal(hidden.body.length, 0, `${table} leaked across owners`);
      const directInsert = await rest(`/${table}`, A.token, { method: "POST", body: {} });
      assert.ok(directInsert.status >= 400, `${table} allowed direct insert`);
      const directUpdate = await rest(`/${table}?user_id=eq.${A.id}`, A.token, { method: "PATCH", body: { user_id: A.id } });
      assert.ok(directUpdate.status >= 400, `${table} allowed update`);
      const directDelete = await rest(`/${table}?user_id=eq.${A.id}`, A.token, { method: "DELETE" });
      assert.ok(directDelete.status >= 400, `${table} allowed delete`);
    }

    const anonRpc = await request(`${apiUrl}/rest/v1/rpc/create_personal_risk_policy_version`, {
      apikey: publishableKey, method: "POST", body: policy(uuid(300)),
    });
    assert.ok(anonRpc.status >= 400, `anon RPC status=${anonRpc.status}`);

    const ledgerReferences = sql(`
      select count(*) from pg_constraint c
      join pg_class child on child.oid=c.conrelid
      join pg_namespace n on n.oid=child.relnamespace
      where n.nspname='public' and child.relname like 'outcome_%'
        and c.confrelid in (
          'public.personal_risk_policy_versions'::regclass,
          'public.broker_equity_snapshots'::regclass,
          'public.daily_risk_equity_bases'::regclass,
          'public.weekly_risk_equity_bases'::regclass
        )
    `);
    assert.equal(ledgerReferences, "0", "migration 007 must not integrate the ledger");

    console.log("Migration 007 authenticated RPC, RLS, idempotency and monotonic-basis tests passed.");
  } finally {
    for (const id of created) {
      await admin(`/auth/v1/admin/users/${id}`, { method: "DELETE" });
    }
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
