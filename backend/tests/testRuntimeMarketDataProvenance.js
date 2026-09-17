"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  DELIVERY_STATES,
  OUTPUT_KEYS,
  SOURCE_OBSERVATIONS,
  buildProvenance,
  fingerprintProvenance,
  historyProvenance,
  quoteProvenance,
} = require("../contracts/marketDataProvenance");

const NOW = "2026-09-18T00:00:20.000Z";
const ORIGINAL = "2026-09-18T00:00:10.000Z";
const OBSERVED = "2026-09-18T00:00:09.000Z";

function fixture(overrides = {}) {
  const delivery = overrides.delivery_state || "MISS";
  const retrieved = overrides.retrieved_at || NOW;
  const original = overrides.original_retrieved_at || (delivery === "MISS" ? retrieved : ORIGINAL);
  const source = overrides.source_observation || "REALTIME";
  return {
    capability: "QUOTE",
    provider: "Provider Alpha",
    source_observation: source,
    venue_scope: source === "UNAVAILABLE" ? "UNKNOWN" : "CONSOLIDATION_UNVERIFIED",
    interval: null,
    observed_at: source === "UNAVAILABLE" ? null : OBSERVED,
    delivery_state: delivery,
    retrieved_at: retrieved,
    original_retrieved_at: original,
    freshness_threshold_seconds: 20,
    usable: source !== "UNAVAILABLE",
    entitlement_display: "UNRESOLVED",
    entitlement_analysis: "UNRESOLVED",
    entitlement_storage: "UNRESOLVED",
    entitlement_attribution: "UNRESOLVED",
    entitlement_authority: "UNKNOWN",
    entitlement_assessed_at: original,
    authority_reference: "unknown",
    ...overrides,
  };
}

function accept(overrides = {}) {
  return buildProvenance(fixture(overrides), { recordedAt: NOW });
}

function reject(label, mutate, pattern = /Invalid market-data provenance/) {
  const input = fixture();
  mutate(input);
  assert.throws(() => buildProvenance(input, { recordedAt: NOW }), pattern, label);
}

// Every source state is independent from delivery. No source vocabulary contains CACHE.
for (const source of SOURCE_OBSERVATIONS) {
  const unavailable = source === "UNAVAILABLE";
  const value = accept({
    source_observation: source,
    venue_scope: unavailable ? "UNKNOWN" : source === "EOD" ? "UNKNOWN" : "CONSOLIDATION_UNVERIFIED",
    observed_at: unavailable ? null : OBSERVED,
    usable: !unavailable,
  });
  assert.equal(value.source_observation, source);
}
assert.ok(!SOURCE_OBSERVATIONS.includes("CACHE"));

// Every delivery state. Expiry is effective unavailability, exactly as migration 004 requires.
for (const delivery of DELIVERY_STATES) {
  const expired = delivery === "EXPIRED_REJECTED";
  const value = accept({
    delivery_state: delivery,
    original_retrieved_at: delivery === "MISS" ? NOW : ORIGINAL,
    source_observation: expired ? "UNAVAILABLE" : "DELAYED",
    venue_scope: expired ? "UNKNOWN" : "CONSOLIDATION_UNVERIFIED",
    observed_at: expired ? null : OBSERVED,
    usable: !expired,
  });
  assert.equal(value.delivery_state, delivery);
  assert.equal(value.source_observation, expired ? "UNAVAILABLE" : "DELAYED");
}

// Provider and capability neutrality: identifiers are facts, not policy bindings.
for (const provider of ["Provider Alpha", "Provider_Beta", "Feed-3"]) {
  assert.equal(accept({ provider }).provider, provider);
  const history = buildProvenance({
    ...fixture({ provider, source_observation: "EOD", venue_scope: "UNKNOWN" }),
    capability: "HISTORY",
    interval: "1day",
  }, { recordedAt: NOW });
  assert.equal(history.provider, provider);
  assert.equal(history.capability, "HISTORY");
}

const quote = quoteProvenance({
  success: true,
  provider: "Arbitrary Quote Feed",
  data: { timestamp: Date.parse("2026-09-18T00:00:19.000Z") / 1000 },
  cache: { status: "MISS", ageSeconds: 0, ttlSeconds: 20 },
}, NOW);
assert.equal(quote.source_observation, "REALTIME");
assert.equal(quote.provider, "Arbitrary Quote Feed");
assert.ok(quote.limitation_codes.includes("BROKER_VERIFICATION_REQUIRED"));

const cachedQuote = buildProvenance(fixture({
  delivery_state: "HIT",
  original_retrieved_at: ORIGINAL,
}), { recordedAt: NOW });
assert.equal(cachedQuote.source_observation, "REALTIME");
assert.equal(cachedQuote.delivery_state, "HIT");
assert.equal(cachedQuote.age_seconds, 10);

const delayed = accept({ source_observation: "DELAYED" });
assert.equal(delayed.source_observation, "DELAYED");
assert.equal(delayed.delivery_state, "MISS");
const eod = buildProvenance({ ...fixture({ source_observation: "EOD", venue_scope: "UNKNOWN" }), capability: "HISTORY", interval: "1day" }, { recordedAt: NOW });
assert.equal(eod.source_observation, "EOD");
assert.equal(eod.venue_scope, "UNKNOWN");
const closed = accept({ source_observation: "MARKET_CLOSED" });
assert.ok(closed.limitation_codes.includes("MARKET_CLOSED"));

const historyA = historyProvenance({ success: true, provider: "History One", cache: "MISS", interval: "1day", metadata: { latestDate: "2026-09-17" } }, NOW);
const historyB = historyProvenance({ success: true, provider: "History Two", cache: "MISS", interval: "1day", metadata: { latestDate: "2026-09-17" } }, NOW);
assert.equal(historyA.provider, "History One");
assert.equal(historyB.provider, "History Two");
assert.equal(historyA.source_observation, "EOD");
assert.equal(historyA.venue_scope, "UNKNOWN");

// Founder semantic decision: governing instrument unknown, every dimension unresolved.
for (const key of ["entitlement_display", "entitlement_analysis", "entitlement_storage", "entitlement_attribution"]) assert.equal(quote[key], "UNRESOLVED");
assert.equal(quote.entitlement_authority, "UNKNOWN");
assert.equal(quote.authority_reference, "unknown");
assert.ok(quote.limitation_codes.includes("ENTITLEMENT_UNRESOLVED"));

// Canonical output and fingerprint do not depend on caller limitation ordering.
const canonical = accept();
const reversed = buildProvenance({ ...fixture(), limitation_codes: [...canonical.limitation_codes].reverse() }, { recordedAt: NOW });
assert.deepEqual(reversed, canonical);
assert.deepEqual(Object.keys(canonical), OUTPUT_KEYS);
assert.equal(fingerprintProvenance(canonical, { recordedAt: NOW }), fingerprintProvenance(reversed, { recordedAt: NOW }));

// Mutation controls: each historical regression independently fails closed.
reject("stale realtime MISS", (v) => { v.observed_at = "2026-09-17T23:59:00.000Z"; }, /freshness/);
reject("source age replaced by cache age", (v) => { v.observed_at = "2026-09-17T23:59:00.000Z"; v.age_seconds = 0; }, /freshness/);
reject("cache overwrites source", (v) => { v.source_observation = "CACHE"; });
reject("legacy EOD", (v) => { v.source_observation = "EOD_CONSOLIDATED"; });
reject("legacy entitlement", (v) => { v.entitlement_display = "PRIVATE_PERSONAL_OWNER_ONLY"; });
reject("affirmative entitlement", (v) => { v.entitlement_display = "PERMITTED_PRIVATE"; });
reject("named reference on UNKNOWN", (v) => { v.authority_reference = "terms:known"; });
reject("named authority under unresolved policy", (v) => { v.entitlement_authority = "PUBLISHED_TERMS"; v.authority_reference = "terms:known"; });
reject("future timestamp", (v) => { v.retrieved_at = "2026-09-18T00:00:21.000Z"; v.original_retrieved_at = v.retrieved_at; v.entitlement_assessed_at = v.retrieved_at; }, /future-dated/);
reject("assessment after retrieval", (v) => { v.entitlement_assessed_at = "2026-09-18T00:00:20.001Z"; }, /follows retrieved/);
reject("timestamp ordering", (v) => { v.observed_at = "2026-09-18T00:00:20.001Z"; }, /follows original/);
reject("unknown key", (v) => { v.payload = { close: 101 }; }, /unknown key/);
reject("raw field", (v) => { v.close = 101; }, /unknown key/);
reject("missing broker code", (v) => { v.limitation_codes = ["CONSOLIDATION_UNVERIFIED", "ENTITLEMENT_UNRESOLVED"]; }, /exact derived set/);
reject("missing entitlement code", (v) => { v.limitation_codes = ["BROKER_VERIFICATION_REQUIRED", "CONSOLIDATION_UNVERIFIED"]; }, /exact derived set/);
reject("extra code", (v) => { v.limitation_codes = ["BROKER_VERIFICATION_REQUIRED", "CONSOLIDATION_UNVERIFIED", "ENTITLEMENT_UNRESOLVED", "SOURCE_UNAVAILABLE"]; }, /exact derived set/);
reject("duplicate code", (v) => { v.limitation_codes = ["BROKER_VERIFICATION_REQUIRED", "BROKER_VERIFICATION_REQUIRED", "CONSOLIDATION_UNVERIFIED", "ENTITLEMENT_UNRESOLVED"]; }, /duplicate/);
reject("verified consolidation without authority", (v) => { v.venue_scope = "CONSOLIDATED_VERIFIED"; }, /qualifying runtime authority/);
reject("wrong exact cache age", (v) => { Object.assign(v, { delivery_state: "HIT", original_retrieved_at: ORIGINAL, age_seconds: 9 }); }, /exactly derived/);

// Runtime-to-storage compatibility: the production output has precisely the RPC
// allowlist keys and round-trips through the shared exact validator unchanged.
assert.deepEqual(buildProvenance(quote, { recordedAt: NOW }), quote);
const migration = fs.readFileSync(path.join(__dirname, "../../supabase/migrations/20260903120000_004_personal_outcome_ledger.sql"), "utf8");
for (const key of OUTPUT_KEYS) assert.match(migration, new RegExp(`['\\b]${key}['\\b]`), `migration 004 must recognize ${key}`);
assert.match(migration, /limitation_codes = array_remove\(array\[/);
assert.match(migration, /jsonb_agg\(code order by code\)/);

// No provider transport, Supabase client, ledger RPC, or write exists in the production module.
const source = fs.readFileSync(path.join(__dirname, "../contracts/marketDataProvenance.js"), "utf8");
assert.doesNotMatch(source, /axios|fetch\s*\(|supabase|create_outcome_position|outcome_snapshot_provenance|\.insert\s*\(/i);
assert.doesNotMatch(source, /EOD_CONSOLIDATED|PRIVATE_PERSONAL_OWNER_ONLY/);
assert.doesNotMatch(source, /Finnhub|TwelveData/);

console.log("Runtime three-axis provenance, migration-004 compatibility, mutation and zero-transport contracts passed.");
