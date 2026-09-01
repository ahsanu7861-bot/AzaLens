"use strict";
const { createSharedAtomicCoordinator } = require("./twelveDataSharedAtomicCoordinator");
const BASIC_PLAN_ID = "basic_internal";
const COORDINATION_MODES = Object.freeze({ DISABLED: "disabled", SHARED_ATOMIC: "shared_atomic" });
const TWELVE_DATA_CREDIT_WEIGHTS = Object.freeze({ quote: 1, time_series: 1, symbol_search: 1, profile: 10, stocks: 1, logo: 1, profile_bundle: 12 });
const TWELVE_DATA_PLAN_PRESETS = Object.freeze({ basic_internal: Object.freeze({ id: BASIC_PLAN_ID, creditsPerMinute: 8, creditsPerDay: 800, enabled: true, purpose: "private_internal_use" }) });

class TwelveDataCreditBudgetError extends Error {
  constructor(reason, retryAfterMs = null) {
    super("Twelve Data request refused by the shared credit budget.");
    this.name = "TwelveDataCreditBudgetError";
    this.code = "TWELVE_DATA_CREDIT_BUDGET_EXCEEDED";
    this.reason = reason;
    this.retryAfterMs = retryAfterMs;
  }
}

function resolveTwelveDataGovernorRuntime(env = process.env) {
  const mode = String(env.TWELVE_DATA_CREDIT_COORDINATION_MODE || "disabled").trim().toLowerCase();
  const configured = Boolean(String(env.SUPABASE_URL || "").trim() && String(env.SUPABASE_SECRET_KEY || "").trim());
  const enabled = mode === COORDINATION_MODES.SHARED_ATOMIC && configured;
  return Object.freeze({ mode, enabled, reason: enabled ? null : mode === COORDINATION_MODES.SHARED_ATOMIC ? "coordinator_unavailable" : "coordination_disabled", durableLedger: enabled, multiInstanceSafe: enabled });
}

class SharedAtomicTwelveDataGovernor {
  constructor(options = {}) {
    this.coordinator = options.coordinator;
    this.now = options.now || Date.now;
    this.setTimer = options.setTimer || setTimeout;
    this.maxQueueLength = options.maxQueueLength ?? 8;
    this.maxQueueWaitMs = options.maxQueueWaitMs ?? 5_000;
    this.queueDepth = 0;
    this.refusals = 0;
    this.latest = null;
  }
  refusal(reason, retryAfterMs = null) { this.refusals += 1; return new TwelveDataCreditBudgetError(reason, retryAfterMs); }
  async attempt(credits) {
    let result;
    try { result = await this.coordinator.reserve({ planId: BASIC_PLAN_ID, credits }); }
    catch (error) { throw this.refusal(error.reason === "coordination_disabled" ? error.reason : "coordinator_unavailable"); }
    this.latest = result;
    if (!result.accepted) throw this.refusal(result.reason, result.retry_after_ms);
    return Object.freeze({ planId: BASIC_PLAN_ID, credits, reservedAt: result.reserved_at });
  }
  async reserve(credits, options = {}) {
    try { return await this.attempt(credits); }
    catch (error) {
      if (options.mode !== "queue" || error.reason !== "minute_limit_exhausted") throw error;
      this.refusals -= 1;
      if (this.queueDepth >= this.maxQueueLength || !Number.isFinite(error.retryAfterMs) || error.retryAfterMs > this.maxQueueWaitMs) throw this.refusal("queue_timeout");
      this.queueDepth += 1;
      try { await new Promise((resolve) => this.setTimer(resolve, error.retryAfterMs)); return await this.attempt(credits); }
      finally { this.queueDepth -= 1; }
    }
  }
  snapshot() {
    return { minuteCreditsReserved: this.latest?.minute_credits ?? null, dayCreditsReserved: this.latest?.day_credits ?? null, minuteCreditsRemaining: this.latest ? 8 - this.latest.minute_credits : null, dayCreditsRemaining: this.latest ? 800 - this.latest.day_credits : null, queueDepth: this.queueDepth, refusals: this.refusals };
  }
}

let injectedGovernor = null;
function buildActiveGovernor(env = process.env) {
  const runtime = resolveTwelveDataGovernorRuntime(env);
  if (!runtime.enabled) return { runtime, governor: null };
  const coordinator = createSharedAtomicCoordinator({ url: env.SUPABASE_URL, secretKey: env.SUPABASE_SECRET_KEY, timeoutMs: env.TWELVE_DATA_CREDIT_COORDINATOR_TIMEOUT_MS });
  return { runtime, governor: new SharedAtomicTwelveDataGovernor({ coordinator }) };
}
function shouldBypassForDeterministicTests() { return process.env.NODE_ENV === "test" && process.env.TWELVE_DATA_CREDIT_GOVERNOR_TEST_ENFORCE !== "true"; }
async function reserveTwelveDataCredits(endpoint, options = {}) {
  const credits = TWELVE_DATA_CREDIT_WEIGHTS[endpoint];
  if (!credits) throw new Error(`Unknown Twelve Data credit weight: ${endpoint}`);
  if (!injectedGovernor && shouldBypassForDeterministicTests()) return Object.freeze({ planId: BASIC_PLAN_ID, credits, deterministicTestBypass: true });
  const active = injectedGovernor ? { runtime: { enabled: true }, governor: injectedGovernor } : buildActiveGovernor();
  if (!active.runtime.enabled || !active.governor) throw new TwelveDataCreditBudgetError(active.runtime.reason);
  return active.governor.reserve(credits, options);
}
function getTwelveDataCreditSnapshot(env = process.env) {
  const active = injectedGovernor ? { runtime: { mode: "shared_atomic", enabled: true, reason: null, durableLedger: true, multiInstanceSafe: true }, governor: injectedGovernor } : buildActiveGovernor(env);
  return { planId: BASIC_PLAN_ID, limits: { creditsPerMinute: 8, creditsPerDay: 800 }, coordination: active.runtime, accounting: active.governor ? active.governor.snapshot() : { minuteCreditsReserved: null, dayCreditsReserved: null, minuteCreditsRemaining: null, dayCreditsRemaining: null, queueDepth: 0, refusals: 0 } };
}
function setGovernorForTests(governor) { injectedGovernor = governor; }
module.exports = { BASIC_PLAN_ID, COORDINATION_MODES, TWELVE_DATA_CREDIT_WEIGHTS, TWELVE_DATA_PLAN_PRESETS, SharedAtomicTwelveDataGovernor, TwelveDataCreditBudgetError, buildActiveGovernor, getTwelveDataCreditSnapshot, reserveTwelveDataCredits, resolveTwelveDataGovernorRuntime, setGovernorForTests };
