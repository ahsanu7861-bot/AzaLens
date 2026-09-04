"use strict";

/*
  STRUCTURAL (LEXICAL) CONTRACT ONLY.

  This file reads the migration and its down script as TEXT. It proves that
  specific clauses are still present and that the detectors below still fire
  when the text is mutated. It executes no SQL and connects to no database, so
  it is a regression tripwire, NOT behavioural proof of anything.

  The executable proof of the behaviour asserted here lives in
  tests/testOutcomeLedgerRpc.js and tests/testOutcomeLedgerRls.js, which drive a
  live PostgreSQL instance.
*/

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

/*
  `inspect` below deliberately slices each RPC at the first "revoke all on
  function", which is fine for presence checks but useless for ORDER checks
  because both functions are defined before the first revoke. Order checks use
  this exact-boundary slicer instead.
*/
function rpcBody(sql, rpc) {
  const bounds = [
    sql.indexOf("create function public.create_outcome_position"),
    sql.indexOf("create function public.append_outcome_position_event"),
    sql.indexOf("revoke all on function"),
  ];
  if (bounds.some((at) => at < 0)) return "";
  return rpc === "create_outcome_position"
    ? sql.slice(bounds[0], bounds[1])
    : sql.slice(bounds[1], bounds[2]);
}

const CANONICALISATION = {
  create_outcome_position: "v_risk_percentage := p_risk_percentage;",
  append_outcome_position_event:
    "v_price := p_price; v_quantity := p_quantity; v_fees := p_fees; v_taxes := p_taxes;",
};
const RAW_NUMERIC = /p_(?:entry_price|entry_quantity|fees|taxes|price|quantity|intended_invalidation_price|intended_target_price|maximum_planned_loss|risk_percentage)\b/;

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
  if (!sql.includes("check (observed_at is null or observed_at <= original_retrieved_at)")) errors.push("observation may post-date original retrieval");
  if (!sql.includes("extract(epoch from (retrieved_at - observed_at)) <= freshness_threshold_seconds")) errors.push("realtime freshness is not measured from the observation");
  if (/age_seconds <= freshness_threshold_seconds/.test(sql)) errors.push("realtime freshness still uses cache age");
  if (!sql.includes("freshness_threshold_seconds between 1 and 604800")) errors.push("freshness threshold is unbounded");
  if (!/numeric input exceeds ledger precision contract/.test(sql) || !/scale\(f\.amount\) > f\.max_scale/.test(sql)) errors.push("numeric precision is not validated before use");
  if (!/abs\(f\.amount\) >= power\(10::numeric, f\.max_integer_digits\)/.test(sql)) errors.push("numeric range is not validated before insert");
  if (!sql.includes("authority_reference ~ '^[a-z][a-z0-9_-]*:[^[:space:]]'")) errors.push("entitlement evidence reference is not scheme-qualified");
  if (!/entitlement_authority = 'UNKNOWN'/.test(sql) || !/and entitlement_attribution = 'UNRESOLVED'/.test(sql)) errors.push("UNKNOWN authority is not confined to wholly unresolved assessments");
  if (!/Slice 3 is blocked/.test(sql) || !/Risk-limit enforcement is a mandatory/.test(sql)) errors.push("activation deferral undocumented");
  if (/grant\s+(?:insert|update|delete)[^;]*outcome_/i.test(sql)) errors.push("immutable ledger gained direct writes");
  if (/references\s+auth\.users\s*\(id\)/i.test(sql) === false) errors.push("owner foreign key absent");

  // G-1. A coherent but wholly future-dated timeline must be refused against a
  // database-generated insertion instant the caller cannot reach.
  if (!sql.includes("recorded_at timestamptz not null default clock_timestamp()")) {
    errors.push("database-generated insertion instant absent");
  }
  if (!/constraint outcome_snapshot_provenance_not_future check \(/.test(sql)) {
    errors.push("future-dated provenance is not bounded");
  }
  for (const clause of [
    /\bretrieved_at <= recorded_at/,
    /\boriginal_retrieved_at <= recorded_at/,
    /\bentitlement_assessed_at <= recorded_at/,
    /\bobserved_at is null or observed_at <= recorded_at/,
  ]) {
    if (!clause.test(sql)) errors.push(`future bound incomplete: ${clause.source}`);
  }
  if (/recorded_at/.test(rpcBody(sql, "create_outcome_position"))) {
    errors.push("insertion instant is reachable from the RPC");
  }

  // G-2. Both RPCs must validate scale and range, then canonicalise, before any
  // guard, lock, fingerprint or insert - and must never re-read a raw numeric.
  for (const rpc of Object.keys(CANONICALISATION)) {
    const body = rpcBody(sql, rpc);
    const marker = CANONICALISATION[rpc];
    const validator = body.indexOf("select f.field into v_bad_numeric");
    const canonical = body.indexOf(marker);
    if (validator < 0 || canonical < 0) { errors.push(`validation pipeline absent ${rpc}`); continue; }
    if (canonical < validator) errors.push(`canonicalisation precedes numeric validation ${rpc}`);
    for (const [label, needle] of [
      ["guard", "errcode='22023'"],
      ["fingerprint", "extensions.digest"],
      ["insert", "insert into public."],
      ["lock", "for update"],
    ]) {
      const at = body.indexOf(needle);
      if (at >= 0 && at < canonical) errors.push(`${label} precedes numeric validation ${rpc}`);
    }
    if (RAW_NUMERIC.test(body.slice(canonical + marker.length))) {
      errors.push(`raw numeric parameter is read after canonicalisation ${rpc}`);
    }
  }
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
  ["consolidation authority", up.replaceAll("entitlement_authority <> 'UNKNOWN'", "true"), "consolidation lacks explicit authority"],
  ["immutability", `${up}\ngrant update on public.outcome_decision_snapshots to authenticated;`, "immutable ledger gained direct writes"],
  ["observation ordering", up.replace("observed_at is null or observed_at <= original_retrieved_at", "observed_at is null or observed_at <= retrieved_at"), "observation may post-date original retrieval"],
  ["observation freshness", up.replace("extract(epoch from (retrieved_at - observed_at)) <= freshness_threshold_seconds", "age_seconds <= freshness_threshold_seconds"), "realtime freshness is not measured from the observation"],
  ["cache-age freshness relapse", up.replace("extract(epoch from (retrieved_at - observed_at)) <= freshness_threshold_seconds", "age_seconds <= freshness_threshold_seconds"), "realtime freshness still uses cache age"],
  ["bounded threshold", up.replace("freshness_threshold_seconds between 1 and 604800", "freshness_threshold_seconds > 0"), "freshness threshold is unbounded"],
  ["precision validation", up.replaceAll("numeric input exceeds ledger precision contract", "bad number"), "numeric precision is not validated before use"],
  ["range validation", up.replaceAll("abs(f.amount) >= power(10::numeric, f.max_integer_digits)", "false"), "numeric range is not validated before insert"],
  ["evidence scheme", up.replace("authority_reference ~ '^[a-z][a-z0-9_-]*:[^[:space:]]'", "authority_reference <> 'unknown'"), "entitlement evidence reference is not scheme-qualified"],
  ["authority coherence", up.replace("and entitlement_attribution = 'UNRESOLVED'", "and true"), "UNKNOWN authority is not confined to wholly unresolved assessments"],
  ["insertion instant", up.replace("recorded_at timestamptz not null default clock_timestamp(),", ""), "database-generated insertion instant absent"],
  ["future bound", up.replace("    retrieved_at <= recorded_at and\n", ""), "future bound incomplete: \\bretrieved_at <= recorded_at"],
  ["future bound name", up.replace("constraint outcome_snapshot_provenance_not_future check (", "check ("), "future-dated provenance is not bounded"],
  ["caller-supplied instant", up.replace("'authority_reference','limitation_codes')", "'authority_reference','limitation_codes','recorded_at')"), "insertion instant is reachable from the RPC"],
  ["validation order", up.replace(
    "  select f.field into v_bad_numeric\n  from (values\n    ('entry_price'",
    "  if p_entry_price <= 0 then raise exception using errcode='22023', message='invalid broker execution'; end if;\n  select f.field into v_bad_numeric\n  from (values\n    ('entry_price'",
  ), "guard precedes numeric validation create_outcome_position"],
  ["raw numeric guard", up.replace(
    "if v_entry_price is null or v_entry_price <= 0 or v_entry_quantity is null or v_entry_quantity <= 0",
    "if p_entry_price is null or p_entry_price <= 0 or p_entry_quantity is null or p_entry_quantity <= 0",
  ), "raw numeric parameter is read after canonicalisation create_outcome_position"],
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
