"use strict";

const STATES = Object.freeze({
  REALTIME_CONSOLIDATION_UNVERIFIED: "REALTIME_CONSOLIDATION_UNVERIFIED",
  REALTIME_LIMITED_VENUE: "REALTIME_LIMITED_VENUE",
  EOD_CONSOLIDATED: "EOD_CONSOLIDATED",
  CACHE: "CACHE",
  UNAVAILABLE: "UNAVAILABLE",
});

function quoteProvenance(result, retrievedAt = new Date().toISOString()) {
  const available = result?.success === true;
  const cached = result?.cache?.hit === true;
  const provider = result?.provider || "Unknown";
  const underlyingState = provider === "TwelveData"
    ? STATES.REALTIME_LIMITED_VENUE
    : provider === "Finnhub"
      ? STATES.REALTIME_CONSOLIDATION_UNVERIFIED
      : STATES.UNAVAILABLE;
  const seconds = Number(result?.data?.timestamp);
  return {
    state: available ? (cached ? STATES.CACHE : underlyingState) : STATES.UNAVAILABLE,
    underlyingState: available ? underlyingState : STATES.UNAVAILABLE,
    provider,
    sourceTimestamp: Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null,
    retrievalTimestamp: retrievedAt,
    cache: { state: result?.cache?.status || (available ? "MISS" : "UNAVAILABLE"), ageSeconds: Number.isFinite(result?.cache?.ageSeconds) ? result.cache.ageSeconds : null },
    interval: null,
    displayEntitlement: provider === "TwelveData"
      ? "NON_DISPLAY_NOT_ACTIVATED"
      : "PRIVATE_PERSONAL_OWNER_ONLY",
    brokerVerificationRequired: true,
    limitations: available
      ? provider === "TwelveData"
        ? ["Real-time limited-venue quote; not activated and not entitled for display in Basic mode.", "Verify the execution price in your broker before acting."]
        : ["Real-time provider quote; consolidation and NBBO status are unverified.", "Verify the execution price in your broker before acting."]
      : ["Finnhub quote is unavailable; no stale quote was substituted."],
  };
}

function historyProvenance(result, retrievedAt = new Date().toISOString()) {
  const available = result?.success === true;
  const cached = ["HIT", "COALESCED"].includes(result?.cache);
  return {
    state: available ? (cached ? STATES.CACHE : STATES.EOD_CONSOLIDATED) : STATES.UNAVAILABLE,
    underlyingState: available ? STATES.EOD_CONSOLIDATED : STATES.UNAVAILABLE,
    provider: "TwelveData",
    sourceTimestamp: result?.metadata?.latestDate || result?.dataQuality?.latestHistoricalDate || null,
    retrievalTimestamp: retrievedAt,
    cache: { state: result?.cache || (available ? "MISS" : "UNAVAILABLE"), ageSeconds: null },
    interval: result?.interval || "1day",
    displayEntitlement: "NON_DISPLAY_DERIVED_ANALYTICS_ONLY",
    brokerVerificationRequired: true,
    limitations: available
      ? ["End-of-day consolidated history is backend analytical input only.", "Raw Twelve Data OHLCV is not entitled for frontend display in Basic mode."]
      : ["Twelve Data history is unavailable; no expired cache or alternate provider was substituted."],
  };
}

module.exports = { STATES, historyProvenance, quoteProvenance };
