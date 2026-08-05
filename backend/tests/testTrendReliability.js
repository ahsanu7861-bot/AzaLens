"use strict";

const assert = require("node:assert/strict");

require("./testEvidenceAgreementContract");

const {
  analyzeTrend
} = require("../analysis/trend/trendEngine");

function indicator(signal, success = true) {
  return {
    success,
    signal
  };
}

function run() {
  const bullish = analyzeTrend(
    indicator("Price Above EMA"),
    indicator("Price Above SMA"),
    indicator("Bullish Crossover"),
    indicator("Strong Trend")
  );

  assert.equal(bullish.success, true);
  assert.equal(bullish.status, "COMPLETE");
  assert.equal(bullish.trend, "Strong Bullish");
  assert.equal(bullish.score, 95);
  assert.equal(
    bullish.evidence.coveragePercent,
    100
  );

  const bearish = analyzeTrend(
    indicator("Price Below EMA"),
    indicator("Price Below SMA"),
    indicator("Bearish Crossover"),
    indicator("Very Strong Trend")
  );

  assert.equal(bearish.success, true);
  assert.equal(bearish.trend, "Strong Bearish");
  assert.equal(bearish.score, -100);

  const sideways = analyzeTrend(
    indicator("Neutral"),
    indicator("Neutral"),
    indicator("Neutral"),
    indicator("Weak Trend")
  );

  assert.equal(sideways.success, true);
  assert.equal(sideways.trend, "Sideways");
  assert.equal(sideways.score, 0);

  const partial = analyzeTrend(
    indicator("Price Above EMA"),
    indicator("", false),
    indicator("Bullish Crossover"),
    indicator("", false)
  );

  assert.equal(partial.success, true);
  assert.equal(partial.status, "PARTIAL");
  assert.equal(partial.trend, "Bullish");
  assert.equal(partial.score, 55);
  assert.deepEqual(
    partial.evidence.missing,
    ["SMA"]
  );
  assert.match(
    partial.warning,
    /partial evidence/
  );

  const insufficient = analyzeTrend(
    indicator("Price Above EMA"),
    indicator("", false),
    indicator("", false),
    indicator("Strong Trend")
  );

  assert.equal(
    insufficient.success,
    false
  );
  assert.equal(
    insufficient.status,
    "UNAVAILABLE"
  );
  assert.equal(
    insufficient.trend,
    "Unavailable"
  );
  assert.equal(
    insufficient.score,
    null
  );
  assert.match(
    insufficient.warning,
    /At least two directional indicators/
  );

  const noEvidence = analyzeTrend(
    indicator("", false),
    indicator("", false),
    indicator("", false),
    indicator("", false)
  );

  assert.equal(noEvidence.success, false);
  assert.equal(
    noEvidence.trend,
    "Unavailable"
  );
  assert.equal(
    noEvidence.evidence.directionalAvailable,
    0
  );

  console.log(
    "Trend reliability tests passed: sideways requires evidence and missing indicators remain explicit."
  );
}

try {
  run();
} catch (error) {
  console.error(
    "Trend reliability test failed:"
  );
  console.error(error);
  process.exitCode = 1;
}
