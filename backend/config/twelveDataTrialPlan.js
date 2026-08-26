"use strict";

const PLAN_VERSION = "b4b-v1";
const PLAN_NAME = "Twelve Data 12-day Unlimited validation";
const VENTURE_CREDITS_PER_MINUTE = 610;

/*
  A provisional value may be used for offline modelling, but only a confirmed
  value may authorize live transport. Endpoint weights are data weights; the
  plan supplies the per-minute pool. No account entitlement is inferred here.
*/
const ENDPOINT_WEIGHTS = Object.freeze({
  quote: Object.freeze({ credits: 1, status: "confirmed_public_docs", unit: "per_symbol" }),
  profile: Object.freeze({ credits: 1, status: "confirmed_public_docs", unit: "per_request" }),
  stocks: Object.freeze({ credits: 1, status: "confirmed_public_docs", unit: "per_request" }),
  logo: Object.freeze({ credits: 1, status: "provisional_unconfirmed", unit: "per_request" }),
  symbol_search: Object.freeze({ credits: 1, status: "provisional_unconfirmed", unit: "per_request" }),
  time_series: Object.freeze({ credits: 1, status: "confirmed_public_docs", unit: "per_symbol" }),
});

const WEIGHT_SOURCES = Object.freeze([
  Object.freeze({ title: "Twelve Data API Documentation", url: "https://twelvedata.com/docs", checkedOn: "2026-08-26" }),
  Object.freeze({ title: "Twelve Data Credits", url: "https://support.twelvedata.com/en/articles/5615854-credits", checkedOn: "2026-08-26" }),
]);

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
  Object.freeze({ day: 1, focus: "entitlement and quota baseline", endpoints: ["quote", "time_series"], liveBudget: 12 }),
  Object.freeze({ day: 2, focus: "US quote timing and shape", endpoints: ["quote"], liveBudget: 18 }),
  Object.freeze({ day: 3, focus: "daily and intraday OHLCV shape", endpoints: ["time_series"], liveBudget: 18 }),
  Object.freeze({ day: 4, focus: "symbol search coverage", endpoints: ["symbol_search"], liveBudget: 12, blockedUntilWeightConfirmed: true }),
  Object.freeze({ day: 5, focus: "profile bundle access", endpoints: ["profile", "stocks", "logo"], liveBudget: 27, blockedUntilWeightConfirmed: true }),
  Object.freeze({ day: 6, focus: "nine-bucket coverage matrix", endpoints: ["quote", "time_series"], liveBudget: 24 }),
  Object.freeze({ day: 7, focus: "normalization and permitted absence review", endpoints: ["quote", "profile", "time_series"], liveBudget: 18 }),
  Object.freeze({ day: 8, focus: "cache cold/warm and coalescing observations", endpoints: ["quote", "time_series"], liveBudget: 18 }),
  Object.freeze({ day: 9, focus: "rate-limit evidence without deliberate exhaustion", endpoints: ["quote"], liveBudget: 12 }),
  Object.freeze({ day: 10, focus: "error and recovery observations", endpoints: ["quote", "time_series"], liveBudget: 12 }),
  Object.freeze({ day: 11, focus: "targeted reruns of unresolved findings", endpoints: [], liveBudget: 24 }),
  Object.freeze({ day: 12, focus: "final evidence freeze and no-new-scope review", endpoints: [], liveBudget: 12 }),
]);

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
  EXIT_CRITERIA, PLAN_NAME, PLAN_VERSION, VENTURE_CREDITS_PER_MINUTE, WEIGHT_SOURCES };
