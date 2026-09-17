"use strict";

const { createHash } = require("node:crypto");

const CAPABILITIES = Object.freeze(["QUOTE", "HISTORY"]);
const SOURCE_OBSERVATIONS = Object.freeze(["REALTIME", "DELAYED", "EOD", "MARKET_CLOSED", "UNAVAILABLE"]);
const VENUE_SCOPES = Object.freeze(["LIMITED_VENUE", "COMPOSITE_INDICATIVE", "CONSOLIDATED_VERIFIED", "CONSOLIDATION_UNVERIFIED", "NOT_APPLICABLE", "UNKNOWN"]);
const DELIVERY_STATES = Object.freeze(["MISS", "HIT", "COALESCED", "EXPIRED_REJECTED"]);
const LIMITATION_CODES = Object.freeze(["ATTRIBUTION_REQUIRED", "BROKER_VERIFICATION_REQUIRED", "COMPOSITE_INDICATIVE", "CONSOLIDATION_UNVERIFIED", "DISPLAY_PROHIBITED", "ENTITLEMENT_UNRESOLVED", "EXPIRED_REJECTED", "LIMITED_VENUE", "MARKET_CLOSED", "NON_RECONSTRUCTIVE_ANALYTICS_ONLY", "RAW_STORAGE_PROHIBITED", "SOURCE_UNAVAILABLE"]);
const OUTPUT_KEYS = Object.freeze(["capability", "provider", "source_observation", "venue_scope", "interval", "observed_at", "delivery_state", "retrieved_at", "original_retrieved_at", "age_seconds", "freshness_threshold_seconds", "usable", "entitlement_display", "entitlement_analysis", "entitlement_storage", "entitlement_attribution", "entitlement_authority", "entitlement_assessed_at", "authority_reference", "limitation_codes"]);
const KEY_SET = new Set(OUTPUT_KEYS);

function fail(message) { throw new TypeError(`Invalid market-data provenance: ${message}`); }
function member(value, allowed, field) { if (!allowed.includes(value)) fail(`${field} is not migration-004 compatible`); return value; }
function time(value, field, nullable = false) {
  if (value == null && nullable) return null;
  const ms = typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(ms)) fail(`${field} must be an ISO timestamp`);
  return { ms, iso: new Date(ms).toISOString() };
}

function observationTime(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return new Date(value < 1e12 ? value * 1000 : value).toISOString();
  }
  return time(value, "observed_at").iso;
}

function deriveLimitationCodes(v) {
  const codes = [];
  if (v.entitlement_attribution === "REQUIRED") codes.push("ATTRIBUTION_REQUIRED");
  if (v.capability === "QUOTE" && v.source_observation !== "UNAVAILABLE") codes.push("BROKER_VERIFICATION_REQUIRED");
  if (v.venue_scope === "COMPOSITE_INDICATIVE") codes.push("COMPOSITE_INDICATIVE");
  if (v.venue_scope === "CONSOLIDATION_UNVERIFIED") codes.push("CONSOLIDATION_UNVERIFIED");
  if (v.entitlement_display === "PROHIBITED") codes.push("DISPLAY_PROHIBITED");
  if ([v.entitlement_display, v.entitlement_analysis, v.entitlement_storage, v.entitlement_attribution].includes("UNRESOLVED")) codes.push("ENTITLEMENT_UNRESOLVED");
  if (v.delivery_state === "EXPIRED_REJECTED") codes.push("EXPIRED_REJECTED");
  if (v.venue_scope === "LIMITED_VENUE") codes.push("LIMITED_VENUE");
  if (v.source_observation === "MARKET_CLOSED") codes.push("MARKET_CLOSED");
  if (v.entitlement_analysis === "PERMITTED_NON_RECONSTRUCTIVE") codes.push("NON_RECONSTRUCTIVE_ANALYTICS_ONLY");
  if (["PERMITTED_DERIVED_ONLY", "PROHIBITED"].includes(v.entitlement_storage)) codes.push("RAW_STORAGE_PROHIBITED");
  if (v.source_observation === "UNAVAILABLE") codes.push("SOURCE_UNAVAILABLE");
  return codes.sort();
}

function exactCodes(supplied, expected) {
  if (supplied == null) return expected;
  if (!Array.isArray(supplied)) fail("limitation_codes must be an array");
  if (supplied.some((x) => typeof x !== "string" || !LIMITATION_CODES.includes(x))) fail("limitation_codes contains an unknown value");
  if (new Set(supplied).size !== supplied.length) fail("limitation_codes contains a duplicate");
  const canonical = [...supplied].sort();
  if (canonical.length !== expected.length || canonical.some((x, i) => x !== expected[i])) fail("limitation_codes is not the exact derived set");
  return canonical;
}

function buildProvenance(input, { recordedAt = new Date().toISOString() } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("input must be an object");
  const unknown = Object.keys(input).filter((key) => !KEY_SET.has(key)).sort();
  if (unknown.length) fail(`unknown key ${unknown[0]}`);
  const capability = member(input.capability, CAPABILITIES, "capability");
  const source = member(input.source_observation, SOURCE_OBSERVATIONS, "source_observation");
  const venue = member(input.venue_scope, VENUE_SCOPES, "venue_scope");
  const delivery = member(input.delivery_state, DELIVERY_STATES, "delivery_state");
  if (typeof input.provider !== "string" || !/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,79}$/.test(input.provider)) fail("provider is not a factual identifier");
  const interval = input.interval == null ? null : input.interval;
  if ((capability === "QUOTE" && interval !== null) || (capability === "HISTORY" && (typeof interval !== "string" || !/^[A-Za-z0-9]{1,24}$/.test(interval)))) fail("interval does not match capability");
  const observed = time(input.observed_at, "observed_at", true);
  const original = time(input.original_retrieved_at, "original_retrieved_at");
  const retrieved = time(input.retrieved_at, "retrieved_at");
  const assessed = time(input.entitlement_assessed_at, "entitlement_assessed_at");
  const recorded = time(recordedAt, "recorded_at");
  if (original.ms > retrieved.ms) fail("original_retrieved_at follows retrieved_at");
  if (observed && observed.ms > original.ms) fail("observed_at follows original_retrieved_at");
  if (assessed.ms > retrieved.ms) fail("entitlement_assessed_at follows retrieved_at");
  for (const [field, value] of [["observed_at", observed], ["original_retrieved_at", original], ["retrieved_at", retrieved], ["entitlement_assessed_at", assessed]]) if (value && value.ms > recorded.ms) fail(`${field} is future-dated`);
  const age = Math.floor((retrieved.ms - original.ms) / 1000);
  if (input.age_seconds != null && input.age_seconds !== age) fail("age_seconds is not exactly derived");
  const threshold = input.freshness_threshold_seconds;
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 604800) fail("freshness threshold is outside migration-004 bounds");
  if (typeof input.usable !== "boolean") fail("usable must be boolean");
  if (delivery === "MISS" && (age !== 0 || original.iso !== retrieved.iso)) fail("MISS must have zero cache age");
  if (["HIT", "COALESCED"].includes(delivery) && !input.usable) fail(`${delivery} must be usable`);
  if (delivery === "EXPIRED_REJECTED" && (input.usable || source !== "UNAVAILABLE")) fail("EXPIRED_REJECTED must be unusable and unavailable");
  if (source === "UNAVAILABLE") {
    if (input.usable || observed || !["NOT_APPLICABLE", "UNKNOWN"].includes(venue)) fail("UNAVAILABLE source fields are inconsistent");
  } else if (!input.usable || !observed) fail("available source requires observed_at and usable=true");
  if (source === "REALTIME" && (retrieved.ms - observed.ms) / 1000 > threshold) fail("REALTIME observation exceeds freshness threshold");
  if (venue === "CONSOLIDATED_VERIFIED") fail("CONSOLIDATED_VERIFIED lacks qualifying runtime authority");
  for (const field of ["entitlement_display", "entitlement_analysis", "entitlement_storage", "entitlement_attribution"]) if (input[field] !== "UNRESOLVED") fail("runtime entitlement dimensions must remain UNRESOLVED");
  if (input.entitlement_authority !== "UNKNOWN" || input.authority_reference !== "unknown") fail("unresolved runtime policy requires UNKNOWN authority and reference unknown");
  const value = { capability, provider: input.provider, source_observation: source, venue_scope: venue, interval, observed_at: observed?.iso || null, delivery_state: delivery, retrieved_at: retrieved.iso, original_retrieved_at: original.iso, age_seconds: age, freshness_threshold_seconds: threshold, usable: input.usable, entitlement_display: "UNRESOLVED", entitlement_analysis: "UNRESOLVED", entitlement_storage: "UNRESOLVED", entitlement_attribution: "UNRESOLVED", entitlement_authority: "UNKNOWN", entitlement_assessed_at: assessed.iso, authority_reference: "unknown" };
  value.limitation_codes = exactCodes(input.limitation_codes, deriveLimitationCodes(value));
  return Object.freeze(value);
}

function fingerprintProvenance(value, options) { return createHash("sha256").update(JSON.stringify(buildProvenance(value, options))).digest("hex"); }
function unresolved(at) { return { entitlement_display: "UNRESOLVED", entitlement_analysis: "UNRESOLVED", entitlement_storage: "UNRESOLVED", entitlement_attribution: "UNRESOLVED", entitlement_authority: "UNKNOWN", entitlement_assessed_at: at, authority_reference: "unknown" }; }
function delivery(cache) { const value = String(cache?.status || cache || "MISS").toUpperCase(); return DELIVERY_STATES.includes(value) ? value : "MISS"; }
function retrieval(state, rawAge, at) { const r = time(at, "retrieved_at"); const age = ["HIT", "COALESCED"].includes(state) ? Math.max(0, Math.floor(Number(rawAge) || 0)) : 0; return { retrieved: r.iso, original: new Date(r.ms - age * 1000).toISOString(), age }; }

function quoteProvenance(result, retrievedAt = new Date().toISOString()) {
  const available = result?.success === true;
  const state = delivery(result?.cache);
  const times = retrieval(state, result?.cache?.ageSeconds, retrievedAt);
  const seconds = Number(result?.data?.timestamp);
  const observed = Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
  const threshold = Math.max(1, Math.min(604800, Math.floor(Number(result?.cache?.ttlSeconds) || 20)));
  let source = "UNAVAILABLE";
  if (available && result?.sourceObservation) source = result.sourceObservation;
  else if (available && result?.providerMetadata?.isMarketOpen === false) source = "MARKET_CLOSED";
  else if (available && observed && (Date.parse(times.retrieved) - Date.parse(observed)) / 1000 <= threshold) source = "REALTIME";
  else if (available) source = "DELAYED";
  const usable = available && state !== "EXPIRED_REJECTED";
  return buildProvenance({ capability: "QUOTE", provider: result?.provider || "Unknown", source_observation: state === "EXPIRED_REJECTED" ? "UNAVAILABLE" : source, venue_scope: usable ? (result?.venueScope || "CONSOLIDATION_UNVERIFIED") : "UNKNOWN", interval: null, observed_at: usable ? observed : null, delivery_state: state, retrieved_at: times.retrieved, original_retrieved_at: times.original, age_seconds: times.age, freshness_threshold_seconds: threshold, usable, ...unresolved(times.retrieved) }, { recordedAt: times.retrieved });
}

function historyProvenance(result, retrievedAt = new Date().toISOString()) {
  const available = result?.success === true;
  const state = delivery(result?.cache);
  const times = retrieval(state, result?.cacheAgeSeconds, retrievedAt);
  const usable = available && state !== "EXPIRED_REJECTED";
  const rawObserved = result?.metadata?.latestDate || result?.dataQuality?.latestHistoricalDate || null;
  const observed = rawObserved ? observationTime(rawObserved) : null;
  return buildProvenance({ capability: "HISTORY", provider: result?.provider || "Unknown", source_observation: state === "EXPIRED_REJECTED" ? "UNAVAILABLE" : (result?.sourceObservation || (available ? "EOD" : "UNAVAILABLE")), venue_scope: usable ? (result?.venueScope || "UNKNOWN") : "UNKNOWN", interval: result?.interval || "1day", observed_at: usable ? observed : null, delivery_state: state, retrieved_at: times.retrieved, original_retrieved_at: times.original, age_seconds: times.age, freshness_threshold_seconds: 86400, usable, ...unresolved(times.retrieved) }, { recordedAt: times.retrieved });
}

module.exports = { CAPABILITIES, DELIVERY_STATES, LIMITATION_CODES, OUTPUT_KEYS, SOURCE_OBSERVATIONS, VENUE_SCOPES, buildProvenance, deriveLimitationCodes, fingerprintProvenance, historyProvenance, quoteProvenance };
