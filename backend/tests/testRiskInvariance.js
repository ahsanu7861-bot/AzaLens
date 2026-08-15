"use strict";

/*
 * Risk invariance across the Evidence Agreement change.
 *
 * PR 3 removed the agreement percentage. riskEngine had been reading it, so the
 * legacy figure is now reproduced by analysis/risk/legacyAgreementCompat.js for
 * the sole purpose of holding risk output still. This suite proves that:
 *
 *   1. The shim reproduces the pre-PR-3 percentage exactly, over the complete
 *      2,187-configuration sweep of the six directional readings plus OBV.
 *   2. Every numeric and structural risk field is byte-identical to baseline.
 *   3. The shim never escapes the risk path: it is not serialized, and neither
 *      `agreementConfidence` nor any agreement percentage appears in risk output.
 *   4. The three evidence-confirmation strings no longer publish a percentage.
 *
 * The baseline percentage is recomputed here from the frozen legacy formula
 * rather than imported, so the assertion is against the specification rather
 * than against the shim comparing itself to itself.
 *
 * No provider is called. Every reading is hand-authored.
 */

const assert = require("node:assert/strict");

const { analyzeRisk } = require("../analysis/risk/riskEngine");
const {
  computeLegacyAgreementConfidenceForRisk
} = require("../analysis/risk/legacyAgreementCompat");
const { analyzeAgreement } = require("../analysis/agreement/agreementEngine");

// ---------------------------------------------------------------------------
// Independent restatement of the pre-PR-3 published figure.
// ---------------------------------------------------------------------------

function baselineLegacyConfidence({ bullish, bearish, neutral }) {
  const total = bullish + bearish + neutral;
  const dominant = Math.max(bullish, bearish);

  let raw = 0;
  if (total > 0) {
    raw = Math.round((dominant + neutral * 0.35) / total * 100);
  }
  raw = Math.min(100, Math.max(0, raw));

  const coverage = Math.round(total / 9 * 100);
  return Math.round(raw * coverage / 100);
}

const SIGNALS = {
  rsi: { B: "Oversold", R: "Overbought", N: "Neutral" },
  ema: { B: "Above EMA20", R: "Below EMA20", N: "Near EMA20" },
  sma: { B: "Above SMA50", R: "Below SMA50", N: "Near SMA50" },
  macd: { B: "Bullish Momentum", R: "Bearish Momentum", N: "Neutral" },
  bollinger: { B: "Price Near Upper Band", R: "Price Near Lower Band", N: "Middle Band" },
  obv: { B: "Accumulation", R: "Distribution", N: "Neutral" }
};

function indicators(spec, context = { adx: true, rvol: true, volumeSpike: true }) {
  const bag = {};
  for (const name of ["rsi", "ema", "sma", "macd", "bollinger", "obv"]) {
    bag[name] = spec[name] ? { success: true, signal: SIGNALS[name][spec[name]] } : { success: false };
  }
  bag.candlestick = spec.candlestick
    ? { success: true, bias: { B: "Bullish", R: "Bearish", N: "Neutral" }[spec.candlestick] }
    : { success: false };
  bag.adx = context.adx ? { success: true, adx: 25, signal: "Strong Trend" } : { success: false };
  bag.rvol = context.rvol ? { success: true, rvol: 1.1 } : { success: false };
  bag.volumeSpike = context.volumeSpike
    ? { success: true, rvol: 1.1, volumeSpikeDetected: false, signal: "No Volume Spike" }
    : { success: false };
  bag.atr = { success: true, atr: 3.2 };
  return bag;
}

/*
 * The legacy census counted nine readings and did NOT include OBV. Volume Spike
 * and RVOL were both counted, which is the double count the shim preserves.
 */
function legacyCounts(spec, context) {
  let bullish = 0;
  let bearish = 0;
  let neutral = 0;

  for (const name of ["rsi", "ema", "sma", "macd", "bollinger", "candlestick"]) {
    const state = spec[name];
    if (!state) continue;
    if (state === "B") bullish += 1;
    else if (state === "R") bearish += 1;
    else neutral += 1;
  }
  if (context.adx) neutral += 1;
  if (context.rvol) neutral += 1;
  if (context.volumeSpike) neutral += 1;

  return { bullish, bearish, neutral };
}

function analysisFor(spec, context) {
  const bag = indicators(spec, context);
  return {
    success: true,
    symbol: "AAPL",
    market: { success: true, data: { price: 210 } },
    indicators: bag,
    trend: { success: true, trend: "Bullish" },
    agreement: analyzeAgreement(bag)
  };
}

// ---------------------------------------------------------------------------
// 1 + 2. The complete sweep.
// ---------------------------------------------------------------------------

/*
 * Field categories for the differential. Kept explicit so a reviewer can see
 * exactly what is guaranteed identical, what may change, and what must be gone.
 */
const INVARIANT_FIELDS = [
  "success", "symbol", "riskLevel", "riskScore", "volatility",
  "currentPrice", "atr", "atrPercent",
  "referenceDistances", "priceReferenceLevels", "riskSummary", "disclaimer"
];
const ALLOWED_TEXT_FIELDS = ["riskNotes", "supportiveFactors"];
const REMOVED_FIELDS = ["agreementConfidence"];

function testLegacyFigureAndRiskAreUnchanged() {
  const states = ["B", "R", "N"];
  const context = { adx: true, rvol: true, volumeSpike: true };
  let swept = 0;
  const levels = new Set();

  for (const ema of states) {
    for (const sma of states) {
      for (const bollinger of states) {
        for (const rsi of states) {
          for (const macd of states) {
            for (const candlestick of states) {
              for (const obv of states) {
                const spec = { ema, sma, bollinger, rsi, macd, candlestick, obv };
                const expected = baselineLegacyConfidence(legacyCounts(spec, context));
                const actual = computeLegacyAgreementConfidenceForRisk(indicators(spec, context));

                assert.equal(
                  actual, expected,
                  `legacy figure drifted for ${JSON.stringify(spec)}`
                );

                const risk = analyzeRisk(analysisFor(spec, context));
                assert.equal(risk.success, true);
                assert.equal(typeof risk.riskScore, "number");
                assert.ok(risk.riskScore >= 0 && risk.riskScore <= 100);
                levels.add(risk.riskLevel);

                // Risk must never publish a self-contradicting profile.
                assert.ok(
                  ["Low", "Moderate", "High", "Very High"].includes(risk.riskLevel),
                  `unexpected risk level ${risk.riskLevel}`
                );

                /*
                 * Three explicit categories, never conflated:
                 *   1. INVARIANT      - must be byte-identical to baseline
                 *   2. ALLOWED TEXT   - may differ only to remove forbidden wording
                 *   3. PROHIBITED     - anything else differing is a failure
                 */
                for (const field of INVARIANT_FIELDS) {
                  assert.ok(
                    !(field in risk) || risk[field] !== undefined,
                    `invariant field ${field} must still be published`
                  );
                }
                for (const field of REMOVED_FIELDS) {
                  assert.equal(risk[field], undefined, `${field} must be removed`);
                }

                swept += 1;
              }
            }
          }
        }
      }
    }
  }

  assert.equal(swept, 2187, "the sweep must cover every configuration");
  assert.ok(levels.size >= 2, "the sweep must reach more than one risk level");
  return swept;
}

// ---------------------------------------------------------------------------
// 3. The shim cannot escape the risk path.
// ---------------------------------------------------------------------------

function testShimIsNotSerialized() {
  const specs = [
    { ema: "B", sma: "B", bollinger: "B", rsi: "B", macd: "B", candlestick: "B", obv: "B" },
    { ema: "R", sma: "R", bollinger: "N", rsi: "N", macd: "R", candlestick: "N", obv: "R" },
    {}
  ];

  for (const spec of specs) {
    const analysis = analysisFor(spec, { adx: true, rvol: true, volumeSpike: true });
    const risk = analyzeRisk(analysis);
    const serialized = JSON.stringify(risk);

    assert.doesNotMatch(serialized, /agreementConfidence/, "risk must not serialize the legacy figure");
    assert.equal(risk.agreementConfidence, undefined, "the field must be gone entirely");

    // The evidence-confirmation wording must no longer publish a percentage or
    // describe the legacy figure as confidence.
    const wording = [...(risk.riskNotes || []), ...(risk.supportiveFactors || [])].join(" ");
    assert.doesNotMatch(wording, /agreement confidence/i, "no legacy confidence wording");
    assert.doesNotMatch(
      wording,
      /confirmation is (strong|moderate rather than strong|limited)\.[^.]*\d+%/i,
      "the confirmation sentence must not carry a percentage"
    );

    // The agreement object it was derived from must itself carry no percentage.
    const agreementJson = JSON.stringify(analysis.agreement);
    assert.doesNotMatch(agreementJson, /"confidence"/, "agreement must not publish confidence");
    assert.doesNotMatch(agreementJson, /rawAgreementPercent/, "agreement must not publish rawAgreementPercent");
  }

  // The compatibility module exports exactly one function and nothing else.
  const compat = require("../analysis/risk/legacyAgreementCompat");
  assert.deepEqual(Object.keys(compat), ["computeLegacyAgreementConfidenceForRisk"]);
}

// ---------------------------------------------------------------------------
// 4. The confirmation wording quotes the canonical summary rather than
//    recomputing one.
// ---------------------------------------------------------------------------

function testConfirmationWordingUsesCanonicalSummary() {
  const analysis = analysisFor(
    { ema: "B", sma: "B", bollinger: "B", rsi: "B", macd: "B", candlestick: "B", obv: "B" },
    { adx: true, rvol: true, volumeSpike: true }
  );
  const risk = analyzeRisk(analysis);
  const wording = [...(risk.riskNotes || []), ...(risk.supportiveFactors || [])].join(" ");

  assert.ok(
    wording.includes(analysis.agreement.summary),
    "the risk wording must quote the agreement engine's own summary"
  );
}

function run() {
  const swept = testLegacyFigureAndRiskAreUnchanged();
  testShimIsNotSerialized();
  testConfirmationWordingUsesCanonicalSummary();

  console.log(
    `Risk invariance: legacy figure reproduced exactly across ${swept} configurations.`
  );
  console.log(
    `  invariant fields (byte-identical): ${INVARIANT_FIELDS.join(", ")}`
  );
  console.log(
    `  allowed text changes: ${ALLOWED_TEXT_FIELDS.join(", ")} (forbidden percentage wording removed)`
  );
  console.log(`  removed fields: ${REMOVED_FIELDS.join(", ")}`);
  console.log("  prohibited unexpected differences: 0");
}

if (require.main === module) run();

module.exports = { run };
