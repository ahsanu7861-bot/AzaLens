"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const NAME = "20260903120000_004_personal_outcome_ledger.sql";
const up = fs.readFileSync(path.join(ROOT, "supabase/migrations", NAME), "utf8");
const down = fs.readFileSync(path.join(ROOT, "db/down-migrations", NAME), "utf8");

const tables = [
  "personal_risk_limit_versions",
  "outcome_decision_snapshots",
  "outcome_snapshot_provenance",
  "outcome_positions",
  "outcome_position_events",
];
const rpcs = [
  "create_personal_risk_limit_version",
  "create_outcome_position",
  "append_outcome_position_event",
];

function inspect(sql) {
  const errors = [];
  for (const table of tables) {
    if (!sql.includes(`create table public.${table}`)) errors.push(`missing table ${table}`);
    if (!sql.includes(`alter table public.${table} enable row level security`)) errors.push(`RLS not enabled ${table}`);
    if (!sql.includes(`alter table public.${table} force row level security`)) errors.push(`RLS not forced ${table}`);
    if (!sql.includes(`revoke all on public.${table} from public, anon, authenticated, service_role`)) errors.push(`incomplete revoke ${table}`);
    if (!sql.includes(`create policy ${table}_select_own`) && !sql.includes(`create policy ${table.replace("personal_", "personal_")}_select_own`)) {
      const expected = table === "personal_risk_limit_versions" ? "personal_risk_limit_versions_select_own" : `${table}_select_own`;
      if (!sql.includes(`create policy ${expected}`)) errors.push(`missing owner policy ${table}`);
    }
  }
  for (const rpc of rpcs) {
    const start = sql.indexOf(`create function public.${rpc}`);
    if (start < 0) { errors.push(`missing RPC ${rpc}`); continue; }
    const end = sql.indexOf("revoke all on function", start);
    const body = sql.slice(start, end < 0 ? sql.length : end);
    if (!body.includes("security definer set search_path = ''")) errors.push(`unhardened RPC ${rpc}`);
    if (!body.includes("auth.uid()")) errors.push(`RPC does not derive auth.uid ${rpc}`);
    if (/p_user(?:_id)?\b/i.test(body)) errors.push(`caller-owned user id ${rpc}`);
  }
  if (!/for update;/.test(sql)) errors.push("position row is not locked");
  if (!/client_idempotency_key/.test(sql) || !/idempotency conflict/.test(sql)) errors.push("idempotency absent");
  if (!/exit quantity exceeds open quantity/.test(sql)) errors.push("exit quantity guard absent");
  if (!/outcome_text_is_storage_safe/.test(sql) || !/provenance is not storable/.test(sql)) errors.push("storage boundary absent");
  if (/grant\s+(?:insert|update|delete)[^;]*outcome_/i.test(sql)) errors.push("immutable ledger gained direct writes");
  if (/references\s+auth\.users\s*\(id\)/i.test(sql) === false) errors.push("owner foreign key absent");
  return errors;
}

assert.deepEqual(inspect(up), []);
for (const table of [...tables].reverse()) assert.ok(down.includes(`drop table if exists public.${table}`));
for (const rpc of rpcs) assert.ok(down.includes(`drop function if exists public.${rpc}`));
assert.match(down, /NEVER RUN AUTOMATICALLY/);

const mutations = [
  ["row locking", up.replace(" for update;", ";"), "position row is not locked"],
  ["auth.uid", up.replaceAll("auth.uid()", "null::uuid"), "does not derive auth.uid"],
  ["idempotency", up.replaceAll("idempotency conflict", "duplicate"), "idempotency absent"],
  ["exit protection", up.replace("exit quantity exceeds open quantity", "invalid exit"), "exit quantity guard absent"],
  ["storage boundary", up.replaceAll("outcome_text_is_storage_safe", "text_is_ok").replaceAll("provenance is not storable", "bad provenance"), "storage boundary absent"],
  ["immutability", `${up}\ngrant update on public.outcome_decision_snapshots to authenticated;`, "immutable ledger gained direct writes"],
];
for (const [name, mutated, expected] of mutations) {
  assert.ok(inspect(mutated).some((error) => error.includes(expected)), `${name} mutation must be detected`);
}

assert.doesNotMatch(up, /\b(open|high|low|close|volume)\s+numeric/i);
assert.match(up, /numeric\(24,8\)/);
assert.match(up, /posture = 'LONG_CASH_EQUITY'/);
console.log("Outcome ledger migration and mutation contracts passed.");
