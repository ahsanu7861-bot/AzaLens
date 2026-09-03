"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const NAME = "20260903120000_004_personal_outcome_ledger.sql";
const up = fs.readFileSync(path.join(ROOT, "supabase/migrations", NAME), "utf8");
const down = fs.readFileSync(path.join(ROOT, "db/down-migrations", NAME), "utf8");

const tables = [
  "outcome_decision_snapshots",
  "outcome_snapshot_provenance",
  "outcome_positions",
  "outcome_position_events",
];
const rpcs = [
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
    if (!sql.includes(`create policy ${table}_select_own`)) errors.push(`missing owner policy ${table}`);
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
  if (!/limitation_codes/.test(sql) || !/provenance is not storable/.test(sql)) errors.push("storage boundary absent");
  if (/md5\s*\(|concat_ws\s*\(/i.test(sql) || !/extensions\.digest/.test(sql) || !/'sha256'/.test(sql)) errors.push("canonical SHA-256 fingerprint absent");
  if (!/result_open_quantity/.test(sql) || !/return query select v_existing\.id,v_existing\.sequence_no,v_existing\.result_open_quantity/.test(sql)) errors.push("stable replay result absent");
  if (/supersedes_event_id/.test(sql)) errors.push("incomplete correction support present");
  if (!/Correction and supersession events are deliberately unsupported/.test(sql)) errors.push("correction deferral undocumented");
  for (const axis of ["source_observation", "venue_scope", "delivery_state", "entitlement_display", "entitlement_analysis", "entitlement_storage", "entitlement_attribution", "entitlement_authority"]) {
    if (!sql.includes(axis)) errors.push(`three-axis field absent ${axis}`);
  }
  if (!/limitation_codes = array_remove\(array\[/.test(sql)) errors.push("exact limitation-code derivation absent");
  if (!/v_canonical_provenance/.test(sql) || !/jsonb_agg\(code order by code\)/.test(sql)) errors.push("canonical limitation storage absent");
  if (/personal_risk_limit_versions|create_personal_risk_limit_version|risk_limit_version_id/.test(sql)) errors.push("premature risk-limit surface present");
  if (/EOD_CONSOLIDATED|PRIVATE_PERSONAL_OWNER_ONLY/.test(sql)) errors.push("collapsed provider-locked vocabulary present");
  if (/provider\s+in\s*\(/i.test(sql)) errors.push("provider identity is allowlisted");
  if (!/EXPIRED_REJECTED/.test(sql) || !/not usable and source_observation = 'UNAVAILABLE'/.test(sql)) errors.push("expired data can be usable");
  if (!/CONSOLIDATED_VERIFIED/.test(sql) || !/entitlement_authority <> 'UNKNOWN'/.test(sql)) errors.push("consolidation lacks explicit authority");
  if (!/Slice 3 is blocked/.test(sql) || !/Risk-limit enforcement is a mandatory/.test(sql)) errors.push("activation deferral undocumented");
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
  ["storage boundary", up.replaceAll("limitation_codes", "free_text_limitations").replaceAll("provenance is not storable", "bad provenance"), "storage boundary absent"],
  ["fingerprint", up.replaceAll("extensions.digest", "md5").replaceAll("'sha256'", "'md5'"), "canonical SHA-256 fingerprint absent"],
  ["stable replay", up.replaceAll("v_existing.result_open_quantity", "v_open"), "stable replay result absent"],
  ["exact limitation sets", up.replace("limitation_codes = array_remove(array[", "true and array["), "exact limitation-code derivation absent"],
  ["canonical limitation storage", up.replaceAll("jsonb_agg(code order by code)", "jsonb_agg(code)"), "canonical limitation storage absent"],
  ["expired refusal", up.replace("not usable and source_observation = 'UNAVAILABLE'", "usable"), "expired data can be usable"],
  ["consolidation authority", up.replace("entitlement_authority <> 'UNKNOWN'", "true"), "consolidation lacks explicit authority"],
  ["immutability", `${up}\ngrant update on public.outcome_decision_snapshots to authenticated;`, "immutable ledger gained direct writes"],
];
for (const [name, mutated, expected] of mutations) {
  assert.ok(inspect(mutated).some((error) => error.includes(expected)), `${name} mutation must be detected`);
}

assert.doesNotMatch(up, /\b(open|high|low|close|volume)\s+numeric/i);
assert.match(up, /numeric\(24,8\)/);
assert.match(up, /posture = 'LONG_CASH_EQUITY'/);
assert.doesNotMatch(up, /personal_risk_limit_versions|create_personal_risk_limit_version|risk_limit_version_id/);
assert.doesNotMatch(down, /personal_risk_limit_versions|create_personal_risk_limit_version/);
console.log("Outcome ledger migration and mutation contracts passed.");
