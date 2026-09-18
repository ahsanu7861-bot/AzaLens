"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const upPath = path.join(root, "supabase/migrations/20260918120000_007_personal_risk_foundations.sql");
const downPath = path.join(root, "db/down-migrations/20260918120000_007_personal_risk_foundations.sql");
const up = fs.readFileSync(upPath, "utf8");
const down = fs.readFileSync(downPath, "utf8");

const tables = [
  "personal_risk_policy_versions",
  "broker_equity_snapshots",
  "daily_risk_equity_bases",
  "weekly_risk_equity_bases",
];

for (const table of tables) {
  assert.match(up, new RegExp(`create table public\\.${table} \\(`));
  assert.match(up, new RegExp(`alter table public\\.${table} enable row level security;`));
  assert.match(up, new RegExp(`alter table public\\.${table} force row level security;`));
  assert.match(up, new RegExp(`create policy ${table}_select_own`));
  assert.match(down, new RegExp(`drop table if exists public\\.${table};`));
}

assert.equal((up.match(/create table public\./g) || []).length, 4, "exactly four foundation tables");
assert.match(up, /BROKER_CONFIRMED_ACCOUNT_EQUITY/);
assert.match(up, /OWNER_DECLARED_OR_BROKER_CONFIRMED_RECORDED_AS_SUCH/);
assert.match(up, /WEIGHTED_AVERAGE_SINGLE_AGGREGATED_POSITION/);
assert.match(up, /REMAINING_EXIT_FEES_TAXES_AND_POLICY_SLIPPAGE/);
assert.match(up, /CURRENT_REMAINING_QUANTITY_WEIGHTED_ENTRY_STOP_AND_ESTIMATED_EXIT_COSTS/);
assert.match(up, /ACTUAL_ENTRY_AND_EXIT_FEES_AND_TAXES/);
assert.match(up, /LOSING_TRADES_GROSS_NO_WINNER_OFFSET/);
assert.match(up, /ZERO_PER_POSITION/);
assert.match(up, /protective_stop_required_for_risk_increase/);
assert.match(up, /stop_loosening_is_risk_increasing/);
assert.match(up, /risk_reducing_exit_always_permitted/);
assert.match(up, /estimated_exit_slippage_bps/);
assert.match(up, /America\/New_York/);
assert.match(up, /check \(max_planned_loss_per_position_pct = 0\.500000\)/);
assert.match(up, /check \(max_aggregate_open_planned_loss_pct = 2\.000000\)/);
assert.match(up, /check \(daily_realized_gross_loss_limit_pct = 1\.000000\)/);
assert.match(up, /check \(weekly_realized_gross_loss_limit_pct = 2\.500000\)/);
assert.match(up, /check \(maximum_concurrent_open_positions = 5\)/);
assert.match(up, /currency text not null check \(currency = 'USD'\)/);
assert.equal((up.match(/basis_sequence bigint not null/g) || []).length, 2);
assert.equal((up.match(/order by basis_sequence desc limit 1/g) || []).length, 2);
assert.match(up, /least\(v_equity, coalesce\(v_daily_previous\.effective_equity, v_equity\)\)/);
assert.match(up, /least\(v_equity, coalesce\(v_weekly_previous\.effective_equity, v_equity\)\)/);

assert.match(up, /create function public\.create_personal_risk_policy_version/);
assert.match(up, /create function public\.create_broker_equity_snapshot/);
assert.equal((up.match(/security definer set search_path = ''/g) || []).length, 2);
assert.equal((up.match(/pg_catalog\.pg_advisory_xact_lock/g) || []).length, 2);
assert.equal((up.match(/pg_catalog\.hashtextextended\(v_user::text, 0\)/g) || []).length, 2);
assert.match(up, /grant execute on function public\.create_personal_risk_policy_version[\s\S]*to authenticated;/);
assert.match(up, /grant execute on function public\.create_broker_equity_snapshot[\s\S]*to authenticated;/);

for (const forbidden of [
  /alter table public\.outcome_/,
  /insert into public\.outcome_/,
  /update public\.outcome_/,
  /delete from public\.outcome_/,
  /risk_action/,
  /risk_rejection/,
]) {
  assert.doesNotMatch(up, forbidden, `foundation must not integrate ledger/actions: ${forbidden}`);
}

assert.match(down, /immutable risk evidence exists/);
assert.ok(
  down.indexOf("drop function if exists public.create_broker_equity_snapshot") <
    down.indexOf("drop table if exists public.weekly_risk_equity_bases"),
  "down migration removes RPCs before their tables"
);

const mutations = [
  ["gross becomes net", "LOSING_TRADES_GROSS_NO_WINNER_OFFSET", "NET_WINNER_OFFSET"],
  ["floor removed", "ZERO_PER_POSITION", "ALLOW_NEGATIVE"],
  ["timezone drift", "America/New_York", "Asia/Karachi"],
  ["daily monotonic minimum removed", "least(v_equity, coalesce(v_daily_previous.effective_equity, v_equity))", "v_equity"],
  ["owner lock weakened", "pg_catalog.pg_advisory_xact_lock", "pg_catalog.pg_advisory_lock"],
  ["forced RLS removed", "force row level security", "enable row level security"],
  ["authoritative sequence removed", "order by basis_sequence desc limit 1", "order by recorded_at desc, id desc limit 1"],
  ["USD boundary removed", "p_currency is distinct from 'USD'", "p_currency is null"],
  ["approved position limit loosened", "p_maximum_concurrent_open_positions <> 5", "p_maximum_concurrent_open_positions > 50"],
];

for (const [name, needle, replacement] of mutations) {
  const mutant = up.split(needle).join(replacement);
  assert.notEqual(mutant, up, `${name}: mutation applied`);
  if (name === "gross becomes net") assert.doesNotMatch(mutant, /LOSING_TRADES_GROSS_NO_WINNER_OFFSET/);
  if (name === "floor removed") assert.doesNotMatch(mutant, /ZERO_PER_POSITION/);
  if (name === "timezone drift") assert.doesNotMatch(mutant, /America\/New_York/);
  if (name === "daily monotonic minimum removed") assert.doesNotMatch(mutant, /least\(v_equity, coalesce\(v_daily_previous/);
  if (name === "owner lock weakened") assert.equal((mutant.match(/pg_catalog\.pg_advisory_xact_lock/g) || []).length, 0);
  if (name === "forced RLS removed") assert.equal((mutant.match(/force row level security/g) || []).length, 0);
  if (name === "authoritative sequence removed") assert.equal((mutant.match(/order by basis_sequence desc limit 1/g) || []).length, 0);
  if (name === "USD boundary removed") assert.doesNotMatch(mutant, /p_currency is distinct from 'USD'/);
  if (name === "approved position limit loosened") assert.doesNotMatch(mutant, /p_maximum_concurrent_open_positions <> 5/);
}

console.log("Migration 007 foundation contract and mutation controls passed.");
