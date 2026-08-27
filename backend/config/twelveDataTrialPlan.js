"use strict";

const PLAN_VERSION = "b4b-v2";
const PLAN_NAME = "Twelve Data 12-day Unlimited validation";
const VENTURE_CREDITS_PER_MINUTE = 610;

const PROVIDER_ENTITLEMENT = Object.freeze({
  evidence: "written_provider_support",
  confirmedOn: "2026-08-27",
  trial: Object.freeze({ durationDays: 12, accessLevel: "enterprise", privateInternalValidation: true,
    publicDisplay: false }),
  paidPlan: "venture_business",
  authenticatedClientDisplay: true,
  defaultUsEquitiesDisplayAddOnRequired: false,
  restrictions: Object.freeze(["no_raw_data_resale", "no_customer_facing_market_data_api", "no_bulk_downloads"]),
});

/*
  A provisional value may be used for offline modelling, but only a confirmed
  value may authorize live transport. Endpoint weights are data weights; the
  plan supplies the per-minute pool. No account entitlement is inferred here.
*/
const ENDPOINT_WEIGHTS = Object.freeze({
  quote: Object.freeze({ credits: 1, status: "confirmed_public_docs", unit: "per_symbol" }),
  profile: Object.freeze({ credits: 10, status: "confirmed_written_provider_support", unit: "per_symbol" }),
  stocks: Object.freeze({ credits: 1, status: "confirmed_public_docs", unit: "per_request" }),
  logo: Object.freeze({ credits: 1, status: "confirmed_written_provider_support", unit: "per_symbol" }),
  symbol_search: Object.freeze({ credits: 1, status: "confirmed_written_provider_support", unit: "per_request" }),
  time_series: Object.freeze({ credits: 1, status: "confirmed_public_docs", unit: "per_symbol" }),
});

const WEIGHT_SOURCES = Object.freeze([
  Object.freeze({ title: "Twelve Data API Documentation", url: "https://twelvedata.com/docs", checkedOn: "2026-08-26" }),
  Object.freeze({ title: "Twelve Data Credits", url: "https://support.twelvedata.com/en/articles/5615854-credits", checkedOn: "2026-08-26" }),
  Object.freeze({ title: "Written Twelve Data provider support confirmation", reference: "private correspondence",
    checkedOn: "2026-08-27" }),
]);

function plannedDay(day, focus, requestPlan, gate = null) {
  const requestsByEndpoint = {};
  const creditsByEndpoint = {};
  for (const [endpoint, requests] of Object.entries(requestPlan)) {
    if (!Object.hasOwn(ENDPOINT_WEIGHTS, endpoint)) throw new Error(`Unknown planned endpoint: ${endpoint}`);
    if (!Number.isInteger(requests) || requests < 0) throw new Error(`Invalid planned request count: ${endpoint}`);
    if (requests === 0) continue;
    requestsByEndpoint[endpoint] = requests;
    creditsByEndpoint[endpoint] = requests * ENDPOINT_WEIGHTS[endpoint].credits;
  }
  const requestBudget = Object.values(requestsByEndpoint).reduce((sum, value) => sum + value, 0);
  const creditBudget = Object.values(creditsByEndpoint).reduce((sum, value) => sum + value, 0);
  const plan = { day, focus, endpoints: Object.freeze(Object.keys(requestsByEndpoint)),
    requestsByEndpoint: Object.freeze(requestsByEndpoint), creditsByEndpoint: Object.freeze(creditsByEndpoint),
    requestBudget, creditBudget };
  if (gate) plan.gate = gate;
  return Object.freeze(plan);
}

const CACHE_OBSERVATION_PLAN = Object.freeze([
  Object.freeze({ id: "cold-fill", expectedCache: "MISS", expectedUpstreamCalls: 1, purpose: "establish first-request cost" }),
  Object.freeze({ id: "warm-repeat", expectedCache: "HIT", expectedUpstreamCalls: 0, purpose: "prove reuse without provider spend" }),
  Object.freeze({ id: "concurrent-identical", expectedCache: "MISS+COALESCED", expectedUpstreamCalls: 1, purpose: "prove single-flight ownership" }),
  Object.freeze({ id: "ttl-expiry", expectedCache: "MISS", expectedUpstreamCalls: 1, purpose: "prove expiry creates one new fill" }),
  Object.freeze({ id: "provider-transition", expectedCache: "MISS", expectedUpstreamCalls: 1, purpose: "prove provider-qualified cold fill" }),
  Object.freeze({ id: "provider-rollback", expectedCache: "HIT", expectedUpstreamCalls: 0, purpose: "prove original namespace survives" }),
  Object.freeze({ id: "failed-owner-recovery", expectedCache: "ERROR then MISS", expectedUpstreamCalls: 2, purpose: "prove failure clears pending ownership" }),
]);

const DAY_SCHEDULE = Object.freeze([
  plannedDay(1, "entitlement and quota baseline", { quote: 6, time_series: 6 }),
  plannedDay(2, "US quote timing and shape", { quote: 18 }),
  plannedDay(3, "daily and intraday OHLCV shape", { time_series: 18 }),
  plannedDay(4, "symbol search coverage", { symbol_search: 12 }),
  plannedDay(5, "profile bundle access", { profile: 9, stocks: 9, logo: 9 }),
  plannedDay(6, "nine-bucket coverage matrix", { quote: 12, time_series: 12 }),
  plannedDay(7, "normalization and permitted absence review", { quote: 6, profile: 6, time_series: 6 }),
  plannedDay(8, "cache cold/warm and coalescing observations", { quote: 9, time_series: 9 }),
  plannedDay(9, "rate-limit evidence without deliberate exhaustion", { quote: 12 }),
  plannedDay(10, "error and recovery observations", { quote: 6, time_series: 6 }),
  plannedDay(11, "targeted reruns of unresolved findings", {},
    "blocked_until_unresolved_findings_have_an_explicit_reviewed_endpoint_plan"),
  plannedDay(12, "final evidence freeze and no-new-scope review", {}),
]);

const TRIAL_BUDGET = Object.freeze({
  requests: DAY_SCHEDULE.reduce((sum, item) => sum + item.requestBudget, 0),
  credits: DAY_SCHEDULE.reduce((sum, item) => sum + item.creditBudget, 0),
  currency: Object.freeze({ amount: null, status: "blocked_pending_activation_and_billing_terms" }),
});

const ABORT_CRITERIA = Object.freeze([
  "account plan or trial entitlement cannot be identified",
  "an endpoint weight is unconfirmed for the requested live endpoint",
  "request or estimated-credit budget would be exceeded",
  "API key, authorization header, raw payload, or licensed value appears in evidence",
  "an endpoint outside the allowlist is requested",
  "provider provenance is absent or contradicts the invoked endpoint",
  "HTTP 429 repeats after the first observation; no retry is permitted in B4",
  "unexpected billing, overage, subscription, or production activation appears",
  "evidence storage leaves the ignored private directory or loses owner-only permissions",
  "any product UI, production provider default, or external-display surface changes",
]);

const EXIT_CRITERIA = Object.freeze([
  "all approved endpoints have access and response-shape classifications",
  "all nine matrix buckets have a recorded result or explicit documented exclusion",
  "quote, history, search, and profile-bundle request counts reconcile with evidence",
  "cache MISS, HIT, COALESCED, expiry, transition, rollback, and failed-owner recovery are classified",
  "rate-limit behavior is observed without adding retries or exhausting quota deliberately",
  "all evidence passes redaction and provenance validation",
  "every unresolved licensing, timing, coverage, or quality question is listed",
  "no provider switch or production activation occurred",
]);

module.exports = { ABORT_CRITERIA, CACHE_OBSERVATION_PLAN, DAY_SCHEDULE, ENDPOINT_WEIGHTS,
  EXIT_CRITERIA, PLAN_NAME, PLAN_VERSION, PROVIDER_ENTITLEMENT, TRIAL_BUDGET,
  VENTURE_CREDITS_PER_MINUTE, WEIGHT_SOURCES };
