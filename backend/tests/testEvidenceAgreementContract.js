const assert = require("node:assert/strict");

const {
  analyzeAgreement,
  EVIDENCE_STATES,
  GRADED_EVIDENCE_STATES,
  EXPECTED_INDICATOR_COUNT
} = require("../analysis/agreement/agreementEngine");

function indicatorSet({ bullish = 0, bearish = 0, neutral = 0 }) {
  const slots = [
    ["rsi", "Oversold", "Overbought", "Neutral"],
    ["ema", "Above EMA20", "Below EMA20", "Near EMA20"],
    ["sma", "Above SMA50", "Below SMA50", "Near SMA50"],
    ["macd", "Bullish", "Bearish", "Neutral"],
    ["bollinger", "Price Near Upper Band", "Price Near Lower Band", "Middle Band"],
    ["candlestick", "Bullish", "Bearish", "Neutral"],
  ];
  const indicators = {
    adx: { success: neutral > 0, adx: 25, signal: "Strong Trend" },
    rvol: { success: neutral > 1, rvol: 1.1 },
    volumeSpike: {
      success: neutral > 2,
      volumeSpikeDetected: false,
      signal: "No Volume Spike",
    },
  };

  let bullishLeft = bullish;
  let bearishLeft = bearish;
  let neutralLeft = Math.max(0, neutral - 3);

  for (const [name, bullishSignal, bearishSignal, neutralSignal] of slots) {
    let signal;
    if (bullishLeft > 0) {
      signal = bullishSignal;
      bullishLeft -= 1;
    } else if (bearishLeft > 0) {
      signal = bearishSignal;
      bearishLeft -= 1;
    } else if (neutralLeft > 0) {
      signal = neutralSignal;
      neutralLeft -= 1;
    } else {
      indicators[name] = { success: false };
      continue;
    }

    indicators[name] = name === "candlestick"
      ? { success: true, pattern: "Test pattern", bias: signal }
      : { success: true, rsi: 50, signal };
  }

  return indicators;
}

const cases = [
  {
    name: "A: complete evidence preserves the established calculation",
    counts: { bullish: 5, bearish: 0, neutral: 4 },
    expected: { confidence: 71, coverage: 100, state: "Moderate agreement" },
  },
  {
    name: "B: complete deadlocked evidence preserves the conflict penalty",
    counts: { bullish: 3, bearish: 3, neutral: 3 },
    expected: { confidence: 45, coverage: 100, state: "Conflicting evidence" },
  },
  {
    name: "C: sparse unanimous evidence is reduced by coverage",
    counts: { bullish: 4, bearish: 0, neutral: 0 },
    expected: { confidence: 44, coverage: 44, state: "Limited evidence" },
  },
  {
    name: "D: all-neutral evidence is not described as low confidence",
    counts: { bullish: 0, bearish: 0, neutral: 9 },
    expected: { confidence: 35, coverage: 100, state: "No directional evidence" },
  },
  {
    name: "E: equal directional votes are described as conflicting",
    counts: { bullish: 2, bearish: 2, neutral: 5 },
    expected: { confidence: 42, coverage: 100, state: "Conflicting evidence" },
  },
];

for (const testCase of cases) {
  const result = analyzeAgreement(indicatorSet(testCase.counts));

  assert.equal(result.confidence, testCase.expected.confidence, testCase.name);
  assert.equal(result.coveragePercent, testCase.expected.coverage, testCase.name);
  assert.equal(result.evidenceState, testCase.expected.state, testCase.name);
  assert.equal(result.availableIndicators, result.totalIndicators, testCase.name);
  assert.equal(result.expectedIndicators, 9, testCase.name);
}

console.log("Evidence Agreement contract: all five audit cases passed.");

/*
 * ============================================================================
 * Wire-vocabulary closure
 *
 * `evidenceState` is a wire value: services/guidanceContractService.js maps it to
 * an internal verdict state, and anything it does not recognise fails closed to
 * Analysis Limited. A silent rename here would therefore not throw - it would
 * quietly strip the directional verdict from every affected analysis. These
 * assertions pin the exact strings so that failure mode cannot ship unnoticed.
 *
 * frontend/src/types/analysis.ts declares the same seven strings independently
 * (no cross-language import exists). Its own test pins them from the frontend
 * side; the two suites must agree by construction, not by coincidence.
 * ============================================================================
 */

const APPROVED_WIRE_STATES = [
  "Evidence unavailable",
  "No directional evidence",
  "Conflicting evidence",
  "Limited evidence",
  "Low agreement",
  "Moderate agreement",
  "High agreement"
];

const declaredStates = Object.values(EVIDENCE_STATES);

assert.deepEqual(
  declaredStates,
  APPROVED_WIRE_STATES,
  "EVIDENCE_STATES must declare exactly the seven approved wire strings, in order"
);

assert.equal(
  new Set(declaredStates).size,
  APPROVED_WIRE_STATES.length,
  "EVIDENCE_STATES must contain no duplicate wire values"
);

assert.ok(
  Object.isFrozen(EVIDENCE_STATES),
  "EVIDENCE_STATES must be frozen so no consumer can mutate the vocabulary"
);

assert.deepEqual(
  [...GRADED_EVIDENCE_STATES],
  ["High agreement", "Moderate agreement", "Low agreement"],
  "GRADED_EVIDENCE_STATES must list exactly the three grading claims"
);

for (const graded of GRADED_EVIDENCE_STATES) {
  assert.ok(
    declaredStates.includes(graded),
    `graded state "${graded}" must be a declared evidence state`
  );
}

assert.equal(
  EXPECTED_INDICATOR_COUNT,
  9,
  "the expected indicator census must remain 9"
);

console.log("Evidence Agreement contract: wire vocabulary pinned.");

/*
 * Every declared state must be reachable from a real census, and no census may
 * produce a state outside the declared vocabulary. Reachability matters because a
 * state nobody can reach is a state nobody tests; the counts below are chosen to
 * land on each branch of the engine's existing classification, not to change it.
 */

const reachability = [
  { name: "no usable indicators", counts: { bullish: 0, bearish: 0, neutral: 0 }, expected: EVIDENCE_STATES.UNAVAILABLE },
  { name: "complete but undirected", counts: { bullish: 0, bearish: 0, neutral: 9 }, expected: EVIDENCE_STATES.NO_DIRECTION },
  { name: "deadlocked directional", counts: { bullish: 3, bearish: 3, neutral: 3 }, expected: EVIDENCE_STATES.CONFLICTING },
  { name: "incomplete coverage", counts: { bullish: 4, bearish: 0, neutral: 0 }, expected: EVIDENCE_STATES.LIMITED },
  { name: "complete, weakly agreed", counts: { bullish: 3, bearish: 2, neutral: 4 }, expected: EVIDENCE_STATES.LOW },
  { name: "complete, moderately agreed", counts: { bullish: 5, bearish: 0, neutral: 4 }, expected: EVIDENCE_STATES.MODERATE },
  { name: "complete, strongly agreed", counts: { bullish: 6, bearish: 0, neutral: 3 }, expected: EVIDENCE_STATES.HIGH }
];

const reached = new Set();

for (const scenario of reachability) {
  const result = analyzeAgreement(indicatorSet(scenario.counts));

  assert.equal(
    result.evidenceState,
    scenario.expected,
    `${scenario.name} must report "${scenario.expected}"`
  );

  reached.add(result.evidenceState);
}

assert.equal(
  reached.size,
  APPROVED_WIRE_STATES.length,
  "every declared evidence state must be reachable from a real census"
);

assert.deepEqual(
  [...reached].sort(),
  [...APPROVED_WIRE_STATES].sort(),
  "the reachable states must be exactly the declared states"
);

/*
 * Exhaustive sweep: no census the engine accepts may produce a state outside the
 * vocabulary. This is the assertion that catches a new branch added without a
 * corresponding declaration.
 */
let sweptCensuses = 0;

for (let bullish = 0; bullish <= 6; bullish += 1) {
  for (let bearish = 0; bearish + bullish <= 6; bearish += 1) {
    for (let neutral = 0; neutral <= 3; neutral += 1) {
      const result = analyzeAgreement(indicatorSet({ bullish, bearish, neutral }));
      sweptCensuses += 1;

      assert.ok(
        declaredStates.includes(result.evidenceState),
        `census ${bullish}/${bearish}/${neutral} produced undeclared state "${result.evidenceState}"`
      );

      assert.equal(
        result.expectedIndicators,
        EXPECTED_INDICATOR_COUNT,
        `census ${bullish}/${bearish}/${neutral} must report the canonical expected count`
      );

      assert.equal(
        result.availableIndicators,
        result.totalIndicators,
        `census ${bullish}/${bearish}/${neutral} must count one evidence set`
      );
    }
  }
}

console.log(
  `Evidence Agreement contract: all seven states reachable; ${sweptCensuses} censuses produced no undeclared state.`
);
