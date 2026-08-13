"use strict";

/*
 * Evidence Agreement contract — independence-aware family model.
 *
 * The five audit cases that formerly pinned 71 / 45 / 44 / 35 / 42 are preserved
 * as *scenarios*, but their expected outputs are now counts and states rather
 * than a percentage. Each of those numbers was a symptom of a defect this model
 * removes: 71 asserted precision from six correlated indicators; 45 and 42
 * attached a mid-range figure to a deadlock and rose as the deadlock deepened;
 * 44 was produced by an internal "100% agreement" on four indicators; 35 gave a
 * positive figure to evidence with no direction at all.
 *
 * Nothing here calls a provider. Every reading is hand-authored.
 */

const assert = require("node:assert/strict");

const {
  analyzeAgreement,
  EVIDENCE_STATES,
  EVIDENCE_FAMILIES,
  EXPECTED_FAMILIES
} = require("../analysis/agreement/agreementEngine");

// ---------------------------------------------------------------------------
// Hand-authored indicator readings. `null` means the indicator did not succeed.
// ---------------------------------------------------------------------------

const SIGNALS = {
  rsi: { B: "Oversold", R: "Overbought", N: "Neutral" },
  ema: { B: "Above EMA20", R: "Below EMA20", N: "Near EMA20" },
  sma: { B: "Above SMA50", R: "Below SMA50", N: "Near SMA50" },
  macd: { B: "Bullish Momentum", R: "Bearish Momentum", N: "Neutral" },
  bollinger: { B: "Price Near Upper Band", R: "Price Near Lower Band", N: "Middle Band" },
  candlestick: { B: "Bullish", R: "Bearish", N: "Neutral" },
  obv: { B: "Accumulation", R: "Distribution", N: "Neutral" }
};

/*
 * Builds the indicator bag exactly as masterAnalysisService assembles it.
 * `context` controls ADX / RVOL / Volume Spike, which never vote.
 */
function indicators(spec = {}, context = { adx: true, rvol: true, volumeSpike: true }) {
  const bag = {};

  for (const name of ["rsi", "ema", "sma", "macd", "bollinger", "candlestick", "obv"]) {
    const state = spec[name];
    if (!state) {
      bag[name] = { success: false, error: "unavailable in this fixture" };
      continue;
    }
    if (name === "candlestick") {
      bag[name] = { success: true, pattern: "Test pattern", bias: SIGNALS.candlestick[state] };
    } else {
      bag[name] = { success: true, signal: SIGNALS[name][state], rsi: 50 };
    }
  }

  bag.adx = context.adx
    ? { success: true, adx: 25, signal: "Strong Trend" }
    : { success: false };
  bag.rvol = context.rvol ? { success: true, rvol: 1.1 } : { success: false };
  bag.volumeSpike = context.volumeSpike
    ? { success: true, rvol: 1.1, volumeSpikeDetected: false, signal: "No Volume Spike" }
    : { success: false };

  return bag;
}

const ALL_BULLISH = { rsi: "B", ema: "B", sma: "B", macd: "B", bollinger: "B", candlestick: "B", obv: "B" };
const ALL_BEARISH = { rsi: "R", ema: "R", sma: "R", macd: "R", bollinger: "R", candlestick: "R", obv: "R" };
const ALL_NEUTRAL = { rsi: "N", ema: "N", sma: "N", macd: "N", bollinger: "N", candlestick: "N", obv: "N" };

function familyVote(result, id) {
  const family = result.coverage.families.find((entry) => entry.id === id);
  assert.ok(family, `family ${id} must be present in coverage.families`);
  return family.vote;
}

function check(label, result, expected) {
  assert.equal(result.evidenceState, expected.state, `${label}: evidenceState`);
  assert.equal(result.support.direction, expected.direction, `${label}: support.direction`);
  assert.equal(result.support.supportingFamilies, expected.supporting, `${label}: supportingFamilies`);
  assert.equal(result.support.opposingFamilies, expected.opposing, `${label}: opposingFamilies`);
  assert.equal(result.support.neutralFamilies, expected.neutral, `${label}: neutralFamilies`);
  assert.equal(result.coverage.usableFamilies, expected.usable, `${label}: usableFamilies`);
  assert.equal(result.coverage.unavailableFamilies, expected.unavailable, `${label}: unavailableFamilies`);
  assert.equal(result.coverage.expectedFamilies, 4, `${label}: expectedFamilies is always 4`);
}

// ---------------------------------------------------------------------------
// 1. The five former pinned cases, re-expressed as counts and states.
// ---------------------------------------------------------------------------

function testFormerPinnedCases() {
  // A (was 71): complete coverage, three families back the lean, price action neutral.
  const a = analyzeAgreement(indicators({ ...ALL_BULLISH, candlestick: "N" }));
  check("A* (was 71)", a, {
    state: "Moderate agreement", direction: "BULLISH",
    supporting: 3, opposing: 0, neutral: 1, usable: 4, unavailable: 0
  });

  // B (was 45): a true 2-2 family deadlock.
  const b = analyzeAgreement(indicators({
    ema: "B", sma: "B", bollinger: "B",   // trend  -> BULLISH
    rsi: "R", macd: "R",                  // moment -> BEARISH
    candlestick: "B",                     // price  -> BULLISH
    obv: "R"                              // volume -> BEARISH
  }));
  check("B* (was 45)", b, {
    state: "Conflicting evidence", direction: null,
    supporting: 2, opposing: 2, neutral: 0, usable: 4, unavailable: 0
  });

  // C (was 44): two usable families agreeing, two unavailable. Must NOT read as unanimity.
  const c = analyzeAgreement(indicators({
    ema: "B", sma: "B", bollinger: "B", rsi: "B", macd: "B"
  }));
  check("C* (was 44)", c, {
    state: "Limited evidence", direction: "BULLISH",
    supporting: 2, opposing: 0, neutral: 0, usable: 2, unavailable: 2
  });
  assert.match(c.summary, /2 of 4/, "C*: the denominator must stay at 4");
  assert.doesNotMatch(c.summary, /unanimous|100/i, "C*: limited evidence must never read as unanimous");

  // D (was 35): complete coverage, no direction anywhere.
  const d = analyzeAgreement(indicators(ALL_NEUTRAL));
  check("D* (was 35)", d, {
    state: "No directional evidence", direction: null,
    supporting: 0, opposing: 0, neutral: 4, usable: 4, unavailable: 0
  });

  // E (was 42): 1-1 family deadlock with two neutral families.
  const e = analyzeAgreement(indicators({
    ema: "B", sma: "B", bollinger: "B",   // trend  -> BULLISH
    rsi: "R", macd: "R",                  // moment -> BEARISH
    candlestick: "N", obv: "N"            // both neutral
  }));
  check("E* (was 42)", e, {
    state: "Conflicting evidence", direction: null,
    supporting: 1, opposing: 1, neutral: 2, usable: 4, unavailable: 0
  });

  // No former pinned value may survive anywhere in the payload.
  for (const [label, result] of [["A*", a], ["B*", b], ["C*", c], ["D*", d], ["E*", e]]) {
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /"confidence"/, `${label}: no confidence field`);
    assert.doesNotMatch(serialized, /rawAgreementPercent/, `${label}: no rawAgreementPercent`);
    assert.doesNotMatch(serialized, /coveragePercent/, `${label}: no coveragePercent`);
  }
}

// ---------------------------------------------------------------------------
// 2. Missing evidence can never appear unanimous.
// ---------------------------------------------------------------------------

function testMissingEvidenceIsNeverUnanimous() {
  for (const spec of [
    { ema: "B", sma: "B", bollinger: "B", rsi: "B", macd: "B" },          // 2 usable
    { ema: "B", sma: "B", bollinger: "B", rsi: "B", macd: "B", obv: "B" } // 3 usable
  ]) {
    const result = analyzeAgreement(indicators(spec));
    assert.ok(
      result.support.supportingFamilies < EXPECTED_FAMILIES,
      "supporting families cannot equal the expected count while a family is missing"
    );
    assert.equal(result.coverage.expectedFamilies, 4, "denominator must not shrink");
    assert.equal(result.evidenceState, "Limited evidence");
    assert.notEqual(result.evidenceState, "High agreement");
  }
}

// ---------------------------------------------------------------------------
// 3-8. Directional, neutral, deadlock and sufficiency states.
// ---------------------------------------------------------------------------

function testSufficiencyLadder() {
  // 0 usable families.
  const none = analyzeAgreement(indicators({}));
  check("zero usable", none, {
    state: "Evidence unavailable", direction: null,
    supporting: 0, opposing: 0, neutral: 0, usable: 0, unavailable: 4
  });

  // 1 usable family (price action only).
  const one = analyzeAgreement(indicators({ candlestick: "B" }));
  check("one usable", one, {
    state: "Insufficient evidence", direction: null,
    supporting: 0, opposing: 0, neutral: 0, usable: 1, unavailable: 3
  });
  assert.equal(one.direction, "Mixed", "an insufficient assessment must not carry a lean");

  // 2 usable families — the sufficiency boundary; an assessment may form.
  const two = analyzeAgreement(indicators({ candlestick: "B", obv: "B" }));
  check("two usable (boundary)", two, {
    state: "Limited evidence", direction: "BULLISH",
    supporting: 2, opposing: 0, neutral: 0, usable: 2, unavailable: 2
  });

  // 2-2 deadlock at full coverage.
  const deadlock = analyzeAgreement(indicators({
    ema: "B", sma: "B", bollinger: "B", rsi: "R", macd: "R", candlestick: "B", obv: "R"
  }));
  assert.equal(deadlock.evidenceState, "Conflicting evidence");
  assert.equal(deadlock.direction, "Mixed");

  // All neutral.
  assert.equal(analyzeAgreement(indicators(ALL_NEUTRAL)).evidenceState, "No directional evidence");

  // Complete unanimous coverage.
  const high = analyzeAgreement(indicators(ALL_BULLISH));
  check("all bullish", high, {
    state: "High agreement", direction: "BULLISH",
    supporting: 4, opposing: 0, neutral: 0, usable: 4, unavailable: 0
  });
  const low = analyzeAgreement(indicators(ALL_BEARISH));
  check("all bearish", low, {
    state: "High agreement", direction: "BEARISH",
    supporting: 4, opposing: 0, neutral: 0, usable: 4, unavailable: 0
  });
}

// ---------------------------------------------------------------------------
// 9-10. Family availability thresholds.
// ---------------------------------------------------------------------------

function testFamilyAvailabilityThresholds() {
  // Trend position: 3 of 3 usable.
  assert.equal(
    familyVote(analyzeAgreement(indicators({ ema: "B", sma: "B", bollinger: "B" })), "trendPosition"),
    "BULLISH"
  );
  // Trend position: 2 of 3 usable — still usable.
  assert.equal(
    familyVote(analyzeAgreement(indicators({ ema: "B", sma: "B" })), "trendPosition"),
    "BULLISH"
  );
  // Trend position: 1 of 3 usable — below threshold.
  assert.equal(
    familyVote(analyzeAgreement(indicators({ ema: "B" })), "trendPosition"),
    "UNAVAILABLE"
  );

  // Momentum: 2 of 2 usable.
  assert.equal(
    familyVote(analyzeAgreement(indicators({ rsi: "B", macd: "B" })), "momentum"),
    "BULLISH"
  );
  // Momentum: 1 of 2 usable — below threshold, both members are required.
  assert.equal(
    familyVote(analyzeAgreement(indicators({ rsi: "B" })), "momentum"),
    "UNAVAILABLE"
  );
}

// ---------------------------------------------------------------------------
// 11-16. The six specified member configurations.
// ---------------------------------------------------------------------------

function testSpecifiedMemberConfigurations() {
  const cases = [
    ["EMA bullish, SMA bearish, Bollinger neutral",
      { ema: "B", sma: "R", bollinger: "N" }, "trendPosition", "NEUTRAL"],
    ["EMA bullish, SMA bullish, Bollinger bearish",
      { ema: "B", sma: "B", bollinger: "R" }, "trendPosition", "BULLISH"],
    // One directional member MAY establish the family when the remaining usable
    // members are neutral and the availability threshold is met.
    ["EMA bullish, SMA neutral, Bollinger unavailable",
      { ema: "B", sma: "N" }, "trendPosition", "BULLISH"],
    ["RSI bullish, MACD bearish",
      { rsi: "B", macd: "R" }, "momentum", "NEUTRAL"],
    ["RSI bullish, MACD neutral",
      { rsi: "B", macd: "N" }, "momentum", "BULLISH"],
    // ...but NOT when a required member is unavailable.
    ["RSI bullish, MACD unavailable",
      { rsi: "B" }, "momentum", "UNAVAILABLE"]
  ];

  for (const [label, spec, family, expected] of cases) {
    assert.equal(familyVote(analyzeAgreement(indicators(spec)), family), expected, label);
  }
}

// ---------------------------------------------------------------------------
// 17. Every member state stays inspectable.
// ---------------------------------------------------------------------------

function testMemberDisclosure() {
  const result = analyzeAgreement(indicators({ ema: "B", sma: "R", bollinger: "N", rsi: "B", macd: "N" }));
  const trend = result.coverage.families.find((f) => f.id === "trendPosition");

  assert.deepEqual(
    trend.members.map((m) => `${m.name}:${m.vote}`),
    ["EMA:BULLISH", "SMA:BEARISH", "Bollinger Bands:NEUTRAL"],
    "intra-family disagreement must remain inspectable rather than being folded away"
  );

  const volume = result.coverage.families.find((f) => f.id === "volumeFlow");
  assert.deepEqual(volume.members.map((m) => `${m.name}:${m.vote}`), ["OBV:UNAVAILABLE"]);

  for (const family of result.coverage.families) {
    assert.ok(family.label && typeof family.label === "string", "every family carries a display label");
    assert.ok(Array.isArray(family.members) && family.members.length > 0);
  }
}

// ---------------------------------------------------------------------------
// 18-19. OBV votes; ADX, RVOL and Volume Spike never do.
// ---------------------------------------------------------------------------

function testVolumeAndContextRoles() {
  assert.equal(familyVote(analyzeAgreement(indicators({ obv: "B" })), "volumeFlow"), "BULLISH");
  assert.equal(familyVote(analyzeAgreement(indicators({ obv: "R" })), "volumeFlow"), "BEARISH");
  assert.equal(familyVote(analyzeAgreement(indicators({ obv: "N" })), "volumeFlow"), "NEUTRAL");

  // Volume Spike is a deterministic function of RVOL, so it receives no vote of
  // its own; neither it nor RVOL nor ADX may appear as a family member.
  const result = analyzeAgreement(indicators(ALL_BULLISH));
  const members = result.coverage.families.flatMap((f) => f.members.map((m) => m.name));
  for (const excluded of ["ADX", "RVOL", "Relative volume (RVOL)", "Volume Spike"]) {
    assert.ok(!members.includes(excluded), `${excluded} must not hold a family vote`);
  }
  assert.deepEqual(result.context.map((entry) => entry.name).sort(), ["ADX", "RVOL"]);

  // Turning the context indicators off cannot change the directional assessment.
  const withoutContext = analyzeAgreement(
    indicators(ALL_BULLISH, { adx: false, rvol: false, volumeSpike: false })
  );
  assert.equal(withoutContext.evidenceState, result.evidenceState);
  assert.equal(withoutContext.support.supportingFamilies, result.support.supportingFamilies);
}

// ---------------------------------------------------------------------------
// 20. Malformed and unknown readings fail closed.
// ---------------------------------------------------------------------------

function testMalformedInput() {
  for (const bag of [undefined, null, {}, { rsi: null }, { ema: { success: "yes" } }]) {
    const result = analyzeAgreement(bag);
    assert.equal(result.evidenceState, "Evidence unavailable");
    assert.equal(result.support.direction, null);
    assert.equal(result.direction, "Mixed");
    assert.equal(result.coverage.usableFamilies, 0);
  }

  // An unrecognised signal string is neither bullish nor bearish.
  const odd = analyzeAgreement({
    ema: { success: true, signal: "???" },
    sma: { success: true, signal: "???" },
    bollinger: { success: true, signal: "???" }
  });
  assert.equal(familyVote(odd, "trendPosition"), "NEUTRAL");
}

// ---------------------------------------------------------------------------
// 21. Vocabulary closure.
// ---------------------------------------------------------------------------

function testVocabulary() {
  assert.deepEqual(Object.values(EVIDENCE_STATES), [
    "Evidence unavailable",
    "Insufficient evidence",
    "No directional evidence",
    "Conflicting evidence",
    "Limited evidence",
    "Low agreement",
    "Moderate agreement",
    "High agreement"
  ]);
  assert.equal(new Set(Object.values(EVIDENCE_STATES)).size, 8, "no duplicate wire values");
  assert.ok(Object.isFrozen(EVIDENCE_STATES));
  assert.equal(EXPECTED_FAMILIES, 4);
  assert.deepEqual(
    EVIDENCE_FAMILIES.map((f) => f.id),
    ["trendPosition", "momentum", "priceAction", "volumeFlow"]
  );
  assert.deepEqual(
    EVIDENCE_FAMILIES.map((f) => f.minimumUsableMembers),
    [2, 2, 1, 1]
  );
}

// ---------------------------------------------------------------------------
// Sweep: every reachable state is declared, and the counts always reconcile.
// ---------------------------------------------------------------------------

function testSweepInvariants() {
  const declared = new Set(Object.values(EVIDENCE_STATES));
  const options = ["B", "R", "N", null];
  const reached = new Set();
  let swept = 0;

  for (const ema of options) {
    for (const rsi of options) {
      for (const candlestick of options) {
        for (const obv of options) {
          const result = analyzeAgreement(
            indicators({ ema, sma: ema, bollinger: ema, rsi, macd: rsi, candlestick, obv })
          );
          swept += 1;
          reached.add(result.evidenceState);

          assert.ok(declared.has(result.evidenceState), `undeclared state ${result.evidenceState}`);

          const { supportingFamilies, opposingFamilies, neutralFamilies } = result.support;
          const { usableFamilies, unavailableFamilies, expectedFamilies } = result.coverage;
          assert.equal(usableFamilies + unavailableFamilies, expectedFamilies, "coverage must reconcile");
          assert.ok(supportingFamilies + opposingFamilies + neutralFamilies <= usableFamilies);
          assert.ok(supportingFamilies <= expectedFamilies, "support can never exceed the fixed denominator");
          assert.ok(supportingFamilies >= opposingFamilies, "supporting is the dominant side by construction");
          assert.equal(typeof result.summary, "string");
          assert.ok(result.summary.trim().length > 0);
          assert.doesNotMatch(result.summary, /%/, "no percentage may appear in the synthesis");
        }
      }
    }
  }

  assert.ok(reached.size >= 7, `expected nearly every state to be reachable, saw ${reached.size}`);
  return swept;
}

function run() {
  testFormerPinnedCases();
  testMissingEvidenceIsNeverUnanimous();
  testSufficiencyLadder();
  testFamilyAvailabilityThresholds();
  testSpecifiedMemberConfigurations();
  testMemberDisclosure();
  testVolumeAndContextRoles();
  testMalformedInput();
  testVocabulary();
  const swept = testSweepInvariants();

  console.log("Evidence Agreement contract: family model, states and member disclosure verified.");
  console.log(`Evidence Agreement contract: ${swept} censuses produced no undeclared state and no percentage.`);
}

if (require.main === module) run();

module.exports = { run };
