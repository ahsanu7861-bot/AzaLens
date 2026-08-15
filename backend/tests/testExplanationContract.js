"use strict";

/*
 * Explanation contract — agreement wording after the Evidence Agreement change.
 *
 * `analyzeExplanation` used to interpolate `agreement.confidence` into its
 * narrative. That field no longer exists, so without this correction the
 * serialized narrative would read "undefined% confidence". These tests hold the
 * replacement honest: the explanation quotes the canonical family assessment the
 * agreement engine already produced, and never publishes a percentage, a
 * confidence claim, or a broken interpolation.
 *
 * No provider is called. Every reading is hand-authored.
 */

const assert = require("node:assert/strict");

const { analyzeExplanation } = require("../analysis/explanation/explanationEngine");
const { analyzeAgreement } = require("../analysis/agreement/agreementEngine");

const SIGNALS = {
  rsi: { B: "Oversold", R: "Overbought", N: "Neutral" },
  ema: { B: "Above EMA20", R: "Below EMA20", N: "Near EMA20" },
  sma: { B: "Above SMA50", R: "Below SMA50", N: "Near SMA50" },
  macd: { B: "Bullish Momentum", R: "Bearish Momentum", N: "Neutral" },
  bollinger: { B: "Price Near Upper Band", R: "Price Near Lower Band", N: "Middle Band" },
  obv: { B: "Accumulation", R: "Distribution", N: "Neutral" }
};

/*
 * Complete readings. The explanation engine interpolates several unrelated
 * indicator values (ema20, sma50, atr.volatility, candlestick.pattern), so a
 * thin fixture would produce `undefined` for reasons that have nothing to do
 * with Evidence Agreement and would make the no-undefined assertion meaningless.
 */
function indicators(spec = {}) {
  const bag = {};
  const extra = {
    rsi: { rsi: 55 },
    ema: { ema20: 208.4, currentPrice: 210 },
    sma: { sma50: 205.1, currentPrice: 210 },
    macd: { macd: 1.2, signalLine: 0.8, histogram: 0.4 },
    bollinger: { upperBand: 214, middleBand: 209, lowerBand: 204, currentPrice: 210 },
    obv: { obv: 1250000 }
  };
  for (const name of ["rsi", "ema", "sma", "macd", "bollinger", "obv"]) {
    bag[name] = spec[name]
      ? { success: true, signal: SIGNALS[name][spec[name]], ...extra[name] }
      : { success: false };
  }
  bag.candlestick = spec.candlestick
    ? {
        success: true,
        pattern: "Bullish Engulfing",
        bias: { B: "Bullish", R: "Bearish", N: "Neutral" }[spec.candlestick],
        strength: 2
      }
    : { success: false };
  bag.adx = { success: true, adx: 25, signal: "Strong Trend" };
  bag.rvol = { success: true, rvol: 1.1, signal: "Normal Volume" };
  bag.volumeSpike = { success: true, rvol: 1.1, volumeSpikeDetected: false, signal: "No Volume Spike" };
  bag.atr = { success: true, atr: 3.1, signal: "Moderate Volatility" };
  return bag;
}

function explanationFor(spec) {
  const bag = indicators(spec);
  const agreement = { success: true, ...analyzeAgreement(bag) };
  return {
    agreement,
    explanation: analyzeExplanation({
      success: true,
      symbol: "AAPL",
      market: { success: true, data: { price: 210 } },
      indicators: bag,
      trend: { success: true, trend: "Bullish", score: 62 },
      agreement
    })
  };
}

function allText(explanation) {
  return [
    explanation.overallAssessment,
    explanation.narrative,
    ...(explanation.positives || []),
    ...(explanation.cautions || []),
    ...(explanation.observations || [])
  ].join(" ");
}

const SCENARIOS = {
  directional: { ema: "B", sma: "B", bollinger: "B", rsi: "B", macd: "B", candlestick: "B", obv: "B" },
  partial: { ema: "B", sma: "B", bollinger: "B", rsi: "B", macd: "B", candlestick: "N", obv: "B" },
  allNeutral: { ema: "N", sma: "N", bollinger: "N", rsi: "N", macd: "N", candlestick: "N", obv: "N" },
  conflicting: { ema: "B", sma: "B", bollinger: "B", rsi: "R", macd: "R", candlestick: "B", obv: "R" },
  limited: { ema: "B", sma: "B", bollinger: "B", rsi: "B", macd: "B" },
  insufficient: { candlestick: "B" },
  unavailable: {}
};

// ---------------------------------------------------------------------------
// 1. No removed numeric field, and no broken interpolation, may reach output.
// ---------------------------------------------------------------------------

function testNoPercentageOrBrokenInterpolation() {
  for (const [label, spec] of Object.entries(SCENARIOS)) {
    const { explanation } = explanationFor(spec);
    const text = allText(explanation);
    const serialized = JSON.stringify(explanation);

    assert.doesNotMatch(text, /%/, `${label}: no percentage may appear`);
    assert.doesNotMatch(text, /confidence/i, `${label}: no confidence wording`);
    assert.doesNotMatch(serialized, /undefined/i, `${label}: no undefined interpolation`);
    assert.doesNotMatch(serialized, /NaN/, `${label}: no NaN interpolation`);
    assert.doesNotMatch(serialized, /null%/, `${label}: no null percentage`);
    assert.doesNotMatch(
      text,
      /\b(probability|likelihood|odds|chance of)\b/i,
      `${label}: no probability implication`
    );
  }
}

// ---------------------------------------------------------------------------
// 2. The wording is the canonical summary, not a second calculation.
// ---------------------------------------------------------------------------

function testQuotesCanonicalSummary() {
  for (const [label, spec] of Object.entries(SCENARIOS)) {
    const { agreement, explanation } = explanationFor(spec);
    const text = allText(explanation);

    assert.ok(
      text.includes(agreement.summary),
      `${label}: the explanation must quote the agreement engine's own summary`
    );
  }
}

// ---------------------------------------------------------------------------
// 3. The distinct states stay distinct.
// ---------------------------------------------------------------------------

function testStatesRemainDistinct() {
  const assessments = {};
  for (const [label, spec] of Object.entries(SCENARIOS)) {
    const { agreement, explanation } = explanationFor(spec);
    assessments[label] = explanation.overallAssessment;
    assert.ok(explanation.overallAssessment.trim().length > 0, `${label}: an assessment is always produced`);
    assert.equal(typeof agreement.evidenceState, "string");
  }

  // Directional, deadlocked, undirected and unusable evidence must not all read
  // the same way.
  const distinct = new Set([
    assessments.directional,
    assessments.allNeutral,
    assessments.conflicting,
    assessments.unavailable
  ]);
  assert.ok(distinct.size >= 3, "directional, neutral, conflicting and unavailable must not collapse into one sentence");

  assert.notEqual(assessments.directional, assessments.allNeutral);
  assert.notEqual(assessments.directional, assessments.conflicting);
}

// ---------------------------------------------------------------------------
// 4. A withheld or absent agreement produces no directional claim.
// ---------------------------------------------------------------------------

function testWithheldAgreement() {
  for (const agreement of [
    { success: false, withheld: true, reason: "NOT_CONFIRMED", error: "withheld" },
    undefined,
    {},
    null
  ]) {
    const explanation = analyzeExplanation({
      success: true,
      symbol: "AAPL",
      market: { success: true, data: { price: 210 } },
      indicators: indicators({}),
      trend: { success: false },
      agreement
    });

    const text = allText(explanation);
    assert.doesNotMatch(text, /%/, "withheld agreement must not publish a percentage");
    assert.doesNotMatch(JSON.stringify(explanation), /undefined/i, "no undefined interpolation");
    assert.ok(explanation.overallAssessment.trim().length > 0, "an honest assessment is still produced");
  }
}

// ---------------------------------------------------------------------------
// 5. Unrelated explanation fields keep their shape.
// ---------------------------------------------------------------------------

function testUnrelatedFieldsUnchanged() {
  const { explanation } = explanationFor(SCENARIOS.directional);

  assert.deepEqual(
    Object.keys(explanation).sort(),
    ["cautions", "disclaimer", "narrative", "observations", "overallAssessment", "positives", "success", "symbol", "title"].sort()
  );
  assert.equal(explanation.success, true);
  assert.equal(explanation.symbol, "AAPL");
  assert.equal(explanation.title, "AAPL Technical Explanation");
  assert.match(explanation.disclaimer, /informational and educational purposes only/);
  assert.ok(Array.isArray(explanation.positives));
  assert.ok(Array.isArray(explanation.cautions));
  assert.ok(Array.isArray(explanation.observations));
}

function run() {
  testNoPercentageOrBrokenInterpolation();
  testQuotesCanonicalSummary();
  testStatesRemainDistinct();
  testWithheldAgreement();
  testUnrelatedFieldsUnchanged();

  console.log("Explanation contract: no percentage, no broken interpolation, canonical summary quoted.");
}

if (require.main === module) run();

module.exports = { run };
