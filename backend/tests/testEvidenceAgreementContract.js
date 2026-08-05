const assert = require("node:assert/strict");

const { analyzeAgreement } = require("../analysis/agreement/agreementEngine");

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
