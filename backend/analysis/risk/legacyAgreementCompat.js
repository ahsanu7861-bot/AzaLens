"use strict";

/*
 * ============================================================================
 * FROZEN RISK-EVIDENCE COMPATIBILITY CONTRACT — PRIVATE, TEMPORARY, UNVALIDATED
 *
 * WHAT THIS IS
 *   A frozen arithmetic reproduction of a figure that no longer exists anywhere
 *   else in the system, kept for one reason: to hold published risk output
 *   exactly where it was while the Evidence Agreement model changed. It selects
 *   a risk-score bucket and does nothing else.
 *
 * WHAT THIS IS NOT
 *   Not a confidence measure. Not Evidence Agreement. Not an accuracy measure.
 *   Not a probability. Not evidence strength. Not an empirically validated risk
 *   measurement. It is frozen compatibility behaviour and must never be
 *   described, named, serialized or rendered as any of those things.
 *
 * WHY IT CANNOT AGREE WITH THE FAMILY CONTRACT
 *   It ignores OBV entirely, credits directionless readings at 0.35 each, counts
 *   RVOL and Volume Spike as two observations when they derive from one, and
 *   multiplies in a coverage ratio. Deeper directional deadlock therefore raises
 *   its value. These are known incoherences, preserved deliberately, not defects
 *   to be repaired here — repairing them would move published risk levels.
 *
 * HARD CONSTRAINTS
 *   - Exactly one production consumer: the evidence bucket inside analyzeRisk().
 *   - Never serialized; never placed on `data.agreement`, `data.risk`,
 *     `guidance` or `explanation`.
 *   - Never exposed in frontend types and never rendered.
 *   - Never allowed to grade user-visible wording (see PR 18a).
 *   - Never allowed to influence the family-count contract.
 *
 * OWNERSHIP
 *   This module is the single owner of BOTH the frozen formula and the frozen
 *   threshold/penalty schedule. `riskEngine.js` consumes the schedule through
 *   `selectFrozenRiskEvidencePenalty` and does not restate 75/60 or 0/5/15.
 *
 * STATUS: approved 2026-08-17 as governed compatibility behaviour, with zero
 *   runtime-output change. Approval governs the debt; it does not validate the
 *   numbers. Every threshold and penalty below remains explicitly unvalidated:
 *   this repository holds no representative historical dataset and no outcome
 *   ledger against which any of them could be calibrated.
 *
 * MANDATORY REVIEW — at the earliest of:
 *   1. an outcome ledger reaching an approved usable sample,
 *   2. the Evidence Agreement model changing,
 *   3. any change to consumer, formula, threshold or penalty,
 *   4. any change to serialization, public API exposure or frontend use -
 *      recorded as three distinct triggers, not one combined condition,
 *   5. 2027-02-17.
 *   Empirical replacement remains open. See FROZEN_RISK_EVIDENCE_COMPAT_CONTRACT
 *   below, which is machine-readable and asserted by
 *   backend/tests/testRiskEvidenceCompatContract.js.
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
 * The frozen figure. Arithmetic preserved exactly:
 *   raw      = round((dominant + 0.35 x neutral) / total x 100), clamped 0..100
 *   coverage = round(total / 9 x 100)
 *   result   = round(raw x coverage / 100)
 *
 * Deliberately NOT named for confidence, agreement, accuracy, probability or
 * strength: it measures none of them. It is a compatibility value.
 */
function computeFrozenRiskEvidenceCompatValue(rawIndicators) {
  const indicators =
    rawIndicators && typeof rawIndicators === "object" ? rawIndicators : {};

  const { bullish, bearish, neutral } = classifyLegacy(indicators);
  const totalIndicators = bullish + bearish + neutral;
  const dominantCount = Math.max(bullish, bearish);

  let rawShare = 0;

  if (totalIndicators > 0) {
    rawShare = Math.round(
      (dominantCount + neutral * 0.35) / totalIndicators * 100
    );
  }

  rawShare = Math.min(100, Math.max(0, rawShare));

  const coveragePercent = Math.round(
    totalIndicators / LEGACY_EXPECTED_INDICATOR_COUNT * 100
  );

  return Math.round(rawShare * coveragePercent / 100);
}

/*
 * The frozen threshold/penalty schedule, owned here and nowhere else.
 *
 * riskEngine.js consumes this function rather than restating the boundaries, so
 * there is exactly one place in production where 75, 60, 0, 5 and 15 appear.
 * The boundaries are inclusive-at-or-above, exactly as before.
 */
const FROZEN_UPPER_BOUNDARY = 75;
const FROZEN_LOWER_BOUNDARY = 60;
const FROZEN_PENALTY_NONE = 0;
const FROZEN_PENALTY_PARTIAL = 5;
const FROZEN_PENALTY_FULL = 15;

function selectFrozenRiskEvidencePenalty(rawIndicators) {
  const value = computeFrozenRiskEvidenceCompatValue(rawIndicators);

  if (value >= FROZEN_UPPER_BOUNDARY) return FROZEN_PENALTY_NONE;
  if (value >= FROZEN_LOWER_BOUNDARY) return FROZEN_PENALTY_PARTIAL;

  return FROZEN_PENALTY_FULL;
}

/*
 * Machine-readable governance record. Deeply frozen so a later edit cannot
 * quietly relax the review date or drop a trigger: the contract test asserts
 * both the values and their immutability.
 *
 * This object is internal governance material. It is never serialized, never
 * placed on a response, and never read by any consumer other than the tests.
 */
const FROZEN_RISK_EVIDENCE_COMPAT_CONTRACT = Object.freeze({
  status: "frozen-compatibility",
  visibility: "private-internal",
  empiricallyValidated: false,
  approvedOn: "2026-08-17",
  mandatoryReviewBy: "2027-02-17",
  formulaOwner: "backend/analysis/risk/legacyAgreementCompat.js",
  scheduleOwner: "backend/analysis/risk/legacyAgreementCompat.js",
  permittedConsumers: Object.freeze([
    "backend/analysis/risk/riskEngine.js:analyzeRisk:evidence-bucket"
  ]),
  boundaries: Object.freeze({
    upper: FROZEN_UPPER_BOUNDARY,
    lower: FROZEN_LOWER_BOUNDARY
  }),
  penalties: Object.freeze({
    none: FROZEN_PENALTY_NONE,
    partial: FROZEN_PENALTY_PARTIAL,
    full: FROZEN_PENALTY_FULL
  }),
  prohibited: Object.freeze([
    "serialization",
    "public-api-exposure",
    "frontend-use",
    "guidance-use",
    "explanation-use",
    "user-visible-wording"
  ]),
  /*
   * The ten approved review triggers, each recorded separately so no approved
   * condition is hidden inside a combined string. Guidance and explanation use
   * are covered by `consumer-change` and remain separately prohibited above.
   */
  reviewTriggers: Object.freeze([
    "outcome-ledger-approved-usable-sample",
    "evidence-agreement-model-change",
    "consumer-change",
    "formula-change",
    "threshold-change",
    "penalty-change",
    "serialization-change",
    "public-api-exposure-change",
    "frontend-use-change",
    "review-date-2027-02-17"
  ]),
  replacementRemainsOpen: true
});

module.exports = {
  computeFrozenRiskEvidenceCompatValue,
  selectFrozenRiskEvidencePenalty,
  FROZEN_RISK_EVIDENCE_COMPAT_CONTRACT
};
