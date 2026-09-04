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

// The G-3 assertion is delimited in the migration text so that both this file
// and the executable old-body proof in testOutcomeLedgerRpc.js can excise
// exactly it, and nothing else, to show it is load-bearing.
const G3_OPEN = "-- >>> G-3 non-execution execution-field rejection";
const G3_CLOSE = "-- <<< G-3 non-execution execution-field rejection";

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

  // G-1b. The same database-authoritative bound, applied to the two remaining
  // caller-supplied instants. Each right-hand side must be a database-generated
  // default and must stay unreachable from either RPC.
  if (!sql.includes("captured_at timestamptz not null default clock_timestamp()")) {
    errors.push("database-generated decision instant absent");
  }
  if (!sql.includes("constraint outcome_decision_snapshots_not_future check (analysis_created_at <= captured_at)")) {
    errors.push("future-dated decision is not bounded");
  }
  if (!sql.includes("constraint outcome_position_events_not_future check (broker_effective_at is null or broker_effective_at <= created_at)")) {
    errors.push("future-dated broker execution is not bounded");
  }
  // \b never matches inside analysis_created_at, so this does not false-positive.
  for (const rpc of rpcs) {
    const body = rpcBody(sql, rpc);
    if (/\bcaptured_at\b/.test(body)) errors.push(`decision instant is reachable from the RPC ${rpc}`);
    if (/\bcreated_at\b/.test(body)) errors.push(`event instant is reachable from the RPC ${rpc}`);
  }

  // G-3. Non-execution events reject every execution field, by name, before the
  // fingerprint, the row lock, the sequence allocation and any insert - and
  // after the precision contract, which owns the first word on every number.
  const appendBody = rpcBody(sql, "append_outcome_position_event");
  const opened = appendBody.indexOf(G3_OPEN);
  const closed = appendBody.indexOf(G3_CLOSE);
  if (opened < 0 || closed < opened) {
    errors.push("non-execution execution-field rejection absent");
  } else {
    if (!/execution field not permitted on non-execution event/.test(appendBody)) {
      errors.push("non-execution execution-field rejection absent");
    }
    const canonical = appendBody.indexOf(CANONICALISATION.append_outcome_position_event);
    if (canonical >= 0 && opened < canonical) {
      errors.push("non-execution rejection precedes numeric validation");
    }
    for (const [label, needle] of [
      ["fingerprint", "extensions.digest"],
      ["lock", "for update"],
      ["sequence allocation", "max(e.sequence_no)"],
      ["insert", "insert into public."],
    ]) {
      const at = appendBody.indexOf(needle);
      if (at >= 0 && at < opened) errors.push(`non-execution rejection follows the ${label}`);
    }
    const block = appendBody.slice(opened, closed);
    if (!/p_event_type in \('OWNER_NOTE','HIDDEN_BY_OWNER'\)/.test(block)) {
      errors.push("non-execution rejection is not scoped to the non-execution event types");
    }
    for (const field of ["broker_effective_at", "fees", "price", "quantity", "taxes"]) {
      if (!block.includes(`('${field}',`)) errors.push(`non-execution rejection omits ${field}`);
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
  ["decision instant", up.replace("  captured_at timestamptz not null default clock_timestamp(),\n", ""), "database-generated decision instant absent"],
  ["decision bound", up.replace("constraint outcome_decision_snapshots_not_future check (analysis_created_at <= captured_at),\n", ""), "future-dated decision is not bounded"],
  ["decision bound weakened", up.replace("check (analysis_created_at <= captured_at)", "check (analysis_created_at is not null)"), "future-dated decision is not bounded"],
  ["execution bound", up.replace("constraint outcome_position_events_not_future check (broker_effective_at is null or broker_effective_at <= created_at)", "check (true)"), "future-dated broker execution is not bounded"],
  ["execution bound weakened", up.replace("broker_effective_at is null or broker_effective_at <= created_at", "broker_effective_at is null or broker_effective_at <= clock_timestamp()"), "future-dated broker execution is not bounded"],
  ["caller-supplied decision instant", up.replace("analysis_created_at, thesis_text, invalidation_condition, planned_horizon,", "analysis_created_at, captured_at, thesis_text, invalidation_condition, planned_horizon,"), "decision instant is reachable from the RPC create_outcome_position"],
  ["non-execution rejection", up.slice(0, up.indexOf(G3_OPEN)) + up.slice(up.indexOf(G3_CLOSE) + G3_CLOSE.length), "non-execution execution-field rejection absent"],
  ["non-execution fees", up.replace("      ('fees', v_fees is not null),\n", ""), "non-execution rejection omits fees"],
  ["non-execution taxes", up.replace("      ('taxes', v_taxes is not null)\n", ""), "non-execution rejection omits taxes"],
  ["non-execution scope", up.replace("if p_event_type in ('OWNER_NOTE','HIDDEN_BY_OWNER') then", "if p_event_type in ('OWNER_NOTE') then"), "non-execution rejection is not scoped to the non-execution event types"],
  ["non-execution rejection order", (() => {
    const block = up.slice(up.indexOf(G3_OPEN), up.indexOf(G3_CLOSE) + G3_CLOSE.length);
    const without = up.slice(0, up.indexOf(G3_OPEN)) + up.slice(up.indexOf(G3_CLOSE) + G3_CLOSE.length);
    return without.replace("  return query select v_event,v_seq,v_open,v_pl,v_return,false;", `${block}\n  return query select v_event,v_seq,v_open,v_pl,v_return,false;`);
  })(), "non-execution rejection follows the fingerprint"],
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
