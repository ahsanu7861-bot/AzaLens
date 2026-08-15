"use strict";

/*
 * ============================================================================
 * TEMPORARY RISK COMPATIBILITY SHIM — NOT A PUBLIC METRIC
 *
 * PR 3 replaced the Evidence Agreement percentage with an independence-aware
 * family count. `riskEngine.js` had been reading that percentage and bucketing
 * it into the risk score, so removing the field outright would have silently
 * moved every published risk level.
 *
 * This module reproduces the *legacy* percentage, byte-for-byte, from the nine
 * legacy indicator readings, for the sole purpose of holding risk output
 * unchanged while the evidence contract changes. It is a frozen copy of code
 * that no longer exists anywhere else.
 *
 * HARD CONSTRAINTS
 *   - Consumed only by the legacy risk bucket inside analyzeRisk().
 *   - Never serialized, never placed on `data.agreement` or `data.risk`.
 *   - Never exposed in frontend types and never rendered.
 *   - Never described to a user as confidence, agreement, or a score.
 *   - Never allowed to influence the family-count contract.
 *
 * REMOVAL CONDITION
 *   This shim exists only to preserve risk behaviour while Evidence Agreement
 *   changes. It may remain only until a dedicated risk-evidence contract is
 *   approved with documented semantics, pinned scenarios and differential
 *   analysis. That follow-up must replace the shim or explicitly authorise its
 *   continued use. No further evidence-model expansion may proceed while this
 *   compatibility debt remains unresolved. Recorded in WHAT_TO_DO_NEXT.md.
 * ============================================================================
 */

// The legacy census expected nine readings. OBV was not among them.
const LEGACY_EXPECTED_INDICATOR_COUNT = 9;

/*
 * Frozen reproduction of the pre-PR-3 classification. The comparisons are copied
 * exactly, including Bollinger's strict equality (the replacement engine uses
 * substring matching, which is a deliberate improvement and must NOT leak in
 * here or the reproduction would stop being exact).
 */
function classifyLegacy(indicators) {
  let bullish = 0;
  let bearish = 0;
  let neutral = 0;

  const rsi = indicators.rsi;
  if (rsi?.success === true) {
    if (rsi.signal === "Oversold") bullish += 1;
    else if (rsi.signal === "Overbought") bearish += 1;
    else neutral += 1;
  }

  const ema = indicators.ema;
  if (ema?.success === true) {
    if (String(ema.signal ?? "").includes("Above EMA")) bullish += 1;
    else if (String(ema.signal ?? "").includes("Below EMA")) bearish += 1;
    else neutral += 1;
  }

  const sma = indicators.sma;
  if (sma?.success === true) {
    if (String(sma.signal ?? "").includes("Above SMA")) bullish += 1;
    else if (String(sma.signal ?? "").includes("Below SMA")) bearish += 1;
    else neutral += 1;
  }

  const macd = indicators.macd;
  if (macd?.success === true) {
    if (String(macd.signal ?? "").includes("Bullish")) bullish += 1;
    else if (String(macd.signal ?? "").includes("Bearish")) bearish += 1;
    else neutral += 1;
  }

  const bollinger = indicators.bollinger;
  if (bollinger?.success === true) {
    if (
      bollinger.signal === "Above Upper Band" ||
      bollinger.signal === "Price Near Upper Band"
    ) {
      bullish += 1;
    } else if (
      bollinger.signal === "Below Lower Band" ||
      bollinger.signal === "Price Near Lower Band"
    ) {
      bearish += 1;
    } else {
      neutral += 1;
    }
  }

  // ADX measured trend strength, so it always counted as neutral.
  if (indicators.adx?.success === true) neutral += 1;

  const candlestick = indicators.candlestick;
  if (candlestick?.success === true) {
    if (candlestick.bias === "Bullish") bullish += 1;
    else if (candlestick.bias === "Bearish") bearish += 1;
    else neutral += 1;
  }

  // RVOL and Volume Spike both counted as neutral, and both counted separately —
  // the double count this shim deliberately preserves.
  if (indicators.rvol?.success === true) neutral += 1;
  if (indicators.volumeSpike?.success === true) neutral += 1;

  return { bullish, bearish, neutral };
}

/*
 * The legacy published figure:
 *   raw      = round((dominant + 0.35 x neutral) / total x 100), clamped 0..100
 *   coverage = round(total / 9 x 100)
 *   result   = round(raw x coverage / 100)
 */
function computeLegacyAgreementConfidenceForRisk(rawIndicators) {
  const indicators =
    rawIndicators && typeof rawIndicators === "object" ? rawIndicators : {};

  const { bullish, bearish, neutral } = classifyLegacy(indicators);
  const totalIndicators = bullish + bearish + neutral;
  const dominantCount = Math.max(bullish, bearish);

  let rawAgreementPercent = 0;

  if (totalIndicators > 0) {
    rawAgreementPercent = Math.round(
      (dominantCount + neutral * 0.35) / totalIndicators * 100
    );
  }

  rawAgreementPercent = Math.min(100, Math.max(0, rawAgreementPercent));

  const coveragePercent = Math.round(
    totalIndicators / LEGACY_EXPECTED_INDICATOR_COUNT * 100
  );

  return Math.round(rawAgreementPercent * coveragePercent / 100);
}

module.exports = {
  computeLegacyAgreementConfidenceForRisk
};
