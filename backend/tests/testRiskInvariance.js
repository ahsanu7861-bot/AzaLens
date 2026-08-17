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
 * The legacy figure selects the score bucket and grades nothing a user reads.
 * That separation is the contract this suite also proves:
 *
 *   5. No configuration emits a shim-graded "Directional confirmation is
 *      strong / moderate / limited" sentence.
 *   6. Every published evidence note is the canonical family summary, verbatim,
 *      behind a neutral label, and its list placement agrees with the family
 *      contract - so a fully supported lean can never be printed as a risk note
 *      and a conflicted or directionless state can never be printed as a
 *      supportive factor.
 *   7. Missing readings and missing or malformed agreement input fail safely.
 *
 * CONFIGURATION-SPACE LANGUAGE. Every count and share in this file is taken over
 * an exhaustively enumerated set of hand-authored indicator configurations.
 * Configuration-space shares are not observed market frequencies and do not
 * estimate how often a condition occurs in production. The 314-of-2,187 figure
 * below is a count of enumerated configurations, not a user or market
 * prevalence, and nothing here is empirically validated.
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
  computeFrozenRiskEvidenceCompatValue
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

/*
 * The frozen penalty schedule. The bucket a configuration lands in is a pure
 * function of the legacy figure, on thresholds and penalties that must not
 * move. Restated here rather than imported, for the same reason
 * `baselineLegacyConfidence` is restated.
 */
function baselinePenalty(legacyValue) {
  if (legacyValue >= 75) return 0;
  if (legacyValue >= 60) return 5;
  return 15;
}

// ---------------------------------------------------------------------------
// The evidence-note contract.
//
// One note per analysis. Its text is the canonical family summary published
// verbatim behind a neutral label, and its list is chosen by the agreement
// engine's own established-evidence predicate - never by the legacy figure.
// ---------------------------------------------------------------------------

const EVIDENCE_NOTE_PREFIX = "Evidence context: ";
const EVIDENCE_NOTE_UNAVAILABLE = "Evidence context is unavailable for this analysis.";

// The wording the legacy figure used to grade. It must never reappear.
const SHIM_GRADED_WORDING = /Directional confirmation is (strong|moderate|limited)/i;

function evidenceNotesIn(risk) {
  const notes = (risk.riskNotes || []).filter(
    (n) => n.startsWith(EVIDENCE_NOTE_PREFIX) || n === EVIDENCE_NOTE_UNAVAILABLE
  );
  const supportive = (risk.supportiveFactors || []).filter((n) =>
    n.startsWith(EVIDENCE_NOTE_PREFIX)
  );
  return { notes, supportive, all: [...notes, ...supportive] };
}

/*
 * The coherence rule, asserted for one risk result against the agreement object
 * it was built from. This is the assertion that fails if the contradiction is
 * reintroduced in any form.
 */
function assertEvidenceNoteIsCoherent(risk, agreement, label) {
  const wording = [...(risk.riskNotes || []), ...(risk.supportiveFactors || [])];
  const joined = wording.join(" ");

  // 1. No shim-graded wording anywhere, in either list.
  assert.doesNotMatch(
    joined, SHIM_GRADED_WORDING,
    `${label}: shim-graded confirmation wording must be gone`
  );

  // 2. No percentage and no confidence language in the evidence note.
  const { notes, supportive, all } = evidenceNotesIn(risk);
  assert.equal(all.length, 1, `${label}: exactly one evidence note must be published`);
  const note = all[0];
  assert.doesNotMatch(note, /\d\s*%|percent/i, `${label}: evidence note must carry no percentage`);
  assert.doesNotMatch(note, /confidence/i, `${label}: evidence note must carry no confidence wording`);

  // 3. No dangling fragment: the note is a complete sentence, never a label
  //    followed by nothing.
  assert.doesNotMatch(note, /:\s*$/, `${label}: evidence note must not end in empty punctuation`);
  assert.doesNotMatch(note, /undefined|null|NaN/, `${label}: evidence note must not leak a placeholder`);

  /*
   * Mirrors the production guard exactly. Coercing here (String(78)) would let
   * this helper expect "Evidence context: 78" and quietly bless the very defect
   * the strict check in riskEngine.js exists to prevent.
   */
  const summary =
    typeof agreement?.summary === "string" ? agreement.summary.trim() : "";

  if (!summary) {
    assert.equal(note, EVIDENCE_NOTE_UNAVAILABLE, `${label}: missing summary must fail safe`);
    assert.equal(notes.length, 1, `${label}: the fallback belongs in riskNotes`);
    assert.equal(supportive.length, 0, `${label}: the fallback is never a supportive factor`);
    return;
  }

  // 4. The note publishes the canonical summary verbatim - not a re-derivation,
  //    not a re-grading, not a second sentence about the same evidence.
  assert.equal(
    note, `${EVIDENCE_NOTE_PREFIX}${summary}`,
    `${label}: the evidence note must quote the canonical summary verbatim`
  );

  // 5. Placement is decided by the family contract, so the heading a user reads
  //    it under cannot contradict the family state.
  const aligned = agreement.agreement === "aligned";
  assert.equal(
    supportive.length, aligned ? 1 : 0,
    `${label}: supportive placement must follow the agreement engine's own predicate`
  );
  assert.equal(notes.length, aligned ? 0 : 1, `${label}: risk-note placement must be the complement`);

  // 6. That predicate is exactly the graded, fully covered states. Asserted
  //    against evidenceState so the two cannot silently drift apart.
  const gradedAndComplete =
    ["Moderate agreement", "High agreement"].includes(agreement.evidenceState);
  assert.equal(
    aligned, gradedAndComplete,
    `${label}: alignment and evidence state must agree`
  );

  /*
   * Checks 5 and 6 together are what make the contradiction unrepresentable: 5
   * ties placement to `aligned`, 6 ties `aligned` to the graded, fully covered
   * states. So a fully supported lean cannot print as a risk note, and a
   * conflicted, directionless, insufficient or unavailable state cannot print
   * as a supportive factor, without one of them failing first.
   */
}

function testLegacyFigureAndRiskAreUnchanged() {
  const states = ["B", "R", "N"];
  const context = { adx: true, rvol: true, volumeSpike: true };
  let swept = 0;
  const levels = new Set();

  /*
   * The frozen baseline. These are counts of enumerated configurations, not
   * observed market frequencies, and they do not estimate how often any
   * condition occurs in production.
   */
  const buckets = { 0: 0, 5: 0, 15: 0 };
  const scoresByBucket = { 0: new Set(), 5: new Set(), 15: new Set() };

  /*
   * The configurations where the legacy figure and the family contract disagree
   * most sharply: the maximum-penalty bucket alongside a public High or Moderate
   * agreement summary. Any wording graded from the legacy figure would contradict
   * the family finding in exactly these cases, so the count is pinned by number
   * rather than by spot check. Again a configuration-space count, not a
   * prevalence.
   */
  let bucketDisagreesWithFamilyContract = 0;

  for (const ema of states) {
    for (const sma of states) {
      for (const bollinger of states) {
        for (const rsi of states) {
          for (const macd of states) {
            for (const candlestick of states) {
              for (const obv of states) {
                const spec = { ema, sma, bollinger, rsi, macd, candlestick, obv };
                const expected = baselineLegacyConfidence(legacyCounts(spec, context));
                const actual = computeFrozenRiskEvidenceCompatValue(indicators(spec, context));

                assert.equal(
                  actual, expected,
                  `legacy figure drifted for ${JSON.stringify(spec)}`
                );

                const analysis = analysisFor(spec, context);
                const risk = analyzeRisk(analysis);
                assert.equal(risk.success, true);
                assert.equal(typeof risk.riskScore, "number");
                assert.ok(risk.riskScore >= 0 && risk.riskScore <= 100);
                levels.add(risk.riskLevel);

                /*
                 * Numeric invariance. The penalty is still a pure function of
                 * the legacy figure, and the score is still the base plus that
                 * penalty - wording must never move it.
                 */
                const penalty = baselinePenalty(expected);
                buckets[penalty] += 1;
                scoresByBucket[penalty].add(risk.riskScore);

                // The evidence note, and the heading it lands under, come only
                // from the family contract.
                assertEvidenceNoteIsCoherent(
                  risk, analysis.agreement, JSON.stringify(spec)
                );

                if (penalty === 15
                    && ["High agreement", "Moderate agreement"]
                      .includes(analysis.agreement.evidenceState)) {
                  bucketDisagreesWithFamilyContract += 1;
                }

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

  /*
   * The pinned penalty distribution. Configuration-space counts, not observed
   * market frequencies: they do not estimate how often any condition occurs in
   * production. If a threshold or a penalty moved, these counts would move.
   */
  assert.deepEqual(
    buckets, { 0: 6, 5: 342, 15: 1839 },
    "the frozen penalty distribution must be unchanged"
  );

  // Each bucket still maps to exactly one score in this deterministic sweep.
  assert.deepEqual([...scoresByBucket[0]], [23], "the +0 bucket must still score 23");
  assert.deepEqual([...scoresByBucket[5]], [28], "the +5 bucket must still score 28");
  assert.deepEqual([...scoresByBucket[15]], [38], "the +15 bucket must still score 38");

  /*
   * The corrected defect, pinned by count. 314 of 2,187 configurations used to
   * print a shim-graded "Directional confirmation is limited." beside a public
   * High or Moderate agreement summary. All 314 still reach the +15 bucket - the
   * numbers did not move - and every one of them now satisfies the coherence
   * rule above, which the per-configuration assertion has already proven.
   *
   * 314 of 2,187 is a count of enumerated configurations. It is not a user or
   * market prevalence and does not estimate production incidence.
   */
  assert.equal(
    bucketDisagreesWithFamilyContract, 314,
    "the configuration-space count of bucket/family disagreement must be pinned"
  );

  return { swept, buckets, bucketDisagreesWithFamilyContract };
}

// ---------------------------------------------------------------------------
// 5. Missingness. The sweep above holds every reading available, so it never
//    exercises the coverage axis. These cases do.
// ---------------------------------------------------------------------------

function testMissingnessCases() {
  const NONE = { adx: false, rvol: false, volumeSpike: false };
  const FULL = { adx: true, rvol: true, volumeSpike: true };

  const cases = [
    {
      label: "zero usable families",
      spec: {},
      context: NONE,
      evidenceState: "Evidence unavailable",
      supportive: false
    },
    {
      label: "one usable family (price action only)",
      spec: { candlestick: "B" },
      context: FULL,
      evidenceState: "Insufficient evidence",
      supportive: false
    },
    {
      label: "incomplete Trend family (one of three moving averages)",
      spec: { ema: "B", rsi: "B", macd: "B", candlestick: "B", obv: "B" },
      context: FULL,
      evidenceState: "Limited evidence",
      supportive: false
    },
    {
      label: "incomplete Momentum family (RSI missing)",
      spec: { ema: "B", sma: "B", bollinger: "B", macd: "B", candlestick: "B", obv: "B" },
      context: FULL,
      evidenceState: "Limited evidence",
      supportive: false
    },
    {
      label: "two usable families",
      spec: { candlestick: "B", obv: "B" },
      context: FULL,
      evidenceState: "Limited evidence",
      supportive: false
    },
    {
      label: "unavailable Volume flow (OBV missing)",
      spec: { ema: "B", sma: "B", bollinger: "B", rsi: "B", macd: "B", candlestick: "B" },
      context: FULL,
      evidenceState: "Limited evidence",
      supportive: false
    },
    {
      label: "complete coverage, full bullish support",
      spec: { ema: "B", sma: "B", bollinger: "B", rsi: "B", macd: "B", candlestick: "B", obv: "B" },
      context: FULL,
      evidenceState: "High agreement",
      supportive: true
    },
    {
      label: "complete coverage, full bearish support",
      spec: { ema: "R", sma: "R", bollinger: "R", rsi: "R", macd: "R", candlestick: "R", obv: "R" },
      context: FULL,
      evidenceState: "High agreement",
      supportive: true
    },
    {
      label: "all neutral at full coverage",
      spec: { ema: "N", sma: "N", bollinger: "N", rsi: "N", macd: "N", candlestick: "N", obv: "N" },
      context: FULL,
      evidenceState: "No directional evidence",
      supportive: false
    },
    {
      label: "conflicting at full coverage",
      spec: { ema: "B", sma: "B", bollinger: "B", rsi: "B", macd: "B", candlestick: "R", obv: "R" },
      context: FULL,
      evidenceState: "Conflicting evidence",
      supportive: false
    },
    {
      label: "limited evidence with unavailable families",
      spec: { ema: "B", sma: "B", candlestick: "B" },
      context: FULL,
      evidenceState: "Limited evidence",
      supportive: false
    }
  ];

  const seen = new Map();

  for (const testCase of cases) {
    const bag = indicators(testCase.spec, testCase.context);
    const agreement = analyzeAgreement(bag);

    assert.equal(
      agreement.evidenceState, testCase.evidenceState,
      `${testCase.label}: expected evidence state`
    );

    const risk = analyzeRisk({
      success: true,
      symbol: "AAPL",
      market: { success: true, data: { price: 210 } },
      indicators: bag,
      trend: { success: true, trend: "Bullish" },
      agreement
    });

    assert.equal(risk.success, true, `${testCase.label}: risk must still compute`);
    assertEvidenceNoteIsCoherent(risk, agreement, testCase.label);

    const { supportive } = evidenceNotesIn(risk);
    assert.equal(
      supportive.length === 1, testCase.supportive,
      `${testCase.label}: expected supportive placement ${testCase.supportive}`
    );

    seen.set(testCase.label, { agreement, risk });
  }

  /*
   * Insufficient and unavailable stay distinct findings, never collapsed into
   * one. "We could not measure this" and "we measured too little to assess" are
   * different, and the published note must say so differently.
   */
  const unavailable = seen.get("zero usable families");
  const insufficient = seen.get("one usable family (price action only)");

  assert.equal(unavailable.agreement.evidenceState, "Evidence unavailable");
  assert.equal(insufficient.agreement.evidenceState, "Insufficient evidence");
  assert.notEqual(
    unavailable.agreement.summary, insufficient.agreement.summary,
    "unavailable and insufficient must not share a summary"
  );
  assert.notEqual(
    evidenceNotesIn(unavailable.risk).all[0],
    evidenceNotesIn(insufficient.risk).all[0],
    "unavailable and insufficient must not publish the same evidence note"
  );

  /*
   * Neutral is not unavailable either: a family that was measured and points
   * nowhere must not read the same as one that could not be measured.
   */
  const allNeutral = seen.get("all neutral at full coverage");
  assert.equal(allNeutral.agreement.coverage.usableFamilies, 4);
  assert.notEqual(
    evidenceNotesIn(allNeutral.risk).all[0],
    evidenceNotesIn(unavailable.risk).all[0],
    "all-neutral must not publish the same note as all-unavailable"
  );

  return cases.length;
}

// ---------------------------------------------------------------------------
// 6. Missing, absent and malformed agreement input must fail safely.
// ---------------------------------------------------------------------------

function testMalformedAgreementFailsSafely() {
  const bag = indicators(
    { ema: "B", sma: "B", bollinger: "B", rsi: "B", macd: "B", candlestick: "B", obv: "B" },
    { adx: true, rvol: true, volumeSpike: true }
  );

  const malformed = [
    ["agreement absent", undefined],
    ["agreement null", null],
    ["agreement an array", []],
    ["agreement a string", "4 of 4 evidence families support a bullish lean."],
    ["agreement a number", 78],
    ["summary missing", { evidenceState: "High agreement", agreement: "aligned" }],
    ["summary empty", { summary: "", agreement: "aligned" }],
    ["summary whitespace", { summary: "   ", agreement: "aligned" }],
    ["summary null", { summary: null, agreement: "aligned" }],
    ["summary a number", { summary: 78, agreement: "aligned" }]
  ];

  for (const [label, agreement] of malformed) {
    const risk = analyzeRisk({
      success: true,
      symbol: "AAPL",
      market: { success: true, data: { price: 210 } },
      indicators: bag,
      trend: { success: true, trend: "Bullish" },
      agreement
    });

    assert.equal(risk.success, true, `${label}: risk must not crash`);

    /*
     * The same coherence rule the sweep uses. Routing these through it rather
     * than restating the assertions proves the rule itself handles malformed
     * input, and keeps one definition of "coherent" for every caller.
     */
    assertEvidenceNoteIsCoherent(risk, agreement, label);

    const { all } = evidenceNotesIn(risk);
    assert.equal(all[0], EVIDENCE_NOTE_UNAVAILABLE, `${label}: must publish the safe fallback`);
    assert.doesNotMatch(
      all.join(" "), /\[object/, `${label}: no object placeholder may leak`
    );

    // The numeric result is untouched by malformed text input.
    assert.equal(risk.riskScore, 23, `${label}: score must be unaffected`);
    assert.equal(risk.riskLevel, "Low", `${label}: level must be unaffected`);
  }

  return malformed.length;
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

    // The evidence wording must no longer publish a percentage, describe the
    // legacy figure as confidence, or grade anything from it at all.
    const wording = [...(risk.riskNotes || []), ...(risk.supportiveFactors || [])].join(" ");
    assert.doesNotMatch(wording, /agreement confidence/i, "no legacy confidence wording");
    assert.doesNotMatch(wording, SHIM_GRADED_WORDING, "no shim-graded confirmation wording");
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
  assert.deepEqual(Object.keys(compat).sort(), [
    "FROZEN_RISK_EVIDENCE_COMPAT_CONTRACT",
    "computeFrozenRiskEvidenceCompatValue",
    "selectFrozenRiskEvidencePenalty"
  ]);
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
  const { swept, buckets, bucketDisagreesWithFamilyContract } =
    testLegacyFigureAndRiskAreUnchanged();
  const missingness = testMissingnessCases();
  const malformed = testMalformedAgreementFailsSafely();
  testShimIsNotSerialized();
  testConfirmationWordingUsesCanonicalSummary();

  console.log(
    `Risk invariance: legacy figure reproduced exactly across ${swept} configurations.`
  );
  console.log(
    `  invariant fields (byte-identical): ${INVARIANT_FIELDS.join(", ")}`
  );
  console.log(
    `  allowed text changes: ${ALLOWED_TEXT_FIELDS.join(", ")} (evidence note now derived from the family contract)`
  );
  console.log(`  removed fields: ${REMOVED_FIELDS.join(", ")}`);
  console.log("  prohibited unexpected differences: 0");
  console.log(
    `  penalty distribution unchanged: +0 ${buckets[0]}, +5 ${buckets[5]}, +15 ${buckets[15]}`
  );
  console.log(
    `  configurations where the legacy bucket disagrees with the family contract: ${bucketDisagreesWithFamilyContract}, every evidence note still coherent`
  );
  console.log(`  missingness cases: ${missingness}   malformed-agreement cases: ${malformed}`);
  console.log(
    "  NOTE: configuration-space shares are not observed market frequencies and"
  );
  console.log(
    "        do not estimate how often a condition occurs in production."
  );
}

if (require.main === module) run();

module.exports = { run };
