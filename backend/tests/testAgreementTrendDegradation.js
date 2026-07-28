const assert = require("node:assert/strict");

const { analyzeAgreement } = require("../analysis/agreement/agreementEngine");
const { analyzeTrend } = require("../analysis/trend/trendEngine");

function baseIndicators() {
  return {
    rsi: { success: true, rsi: 55, signal: "Neutral" },
    ema: { success: true, ema20: 100, signal: "Above EMA20" },
    sma: { success: true, sma50: 98, signal: "Above SMA50" },
    macd: { success: true, macd: 1, signalLine: 0.5, signal: "Bullish" },
    bollinger: {
      success: true,
      signal: "Price Near Upper Band"
    },
    adx: { success: true, adx: 30, signal: "Strong Trend" },
    candlestick: {
      success: true,
      pattern: "Bullish Engulfing",
      bias: "Bullish"
    },
    rvol: { success: true, rvol: 1.4 },
    volumeSpike: {
      success: true,
      volumeSpikeDetected: false,
      signal: "No Volume Spike"
    }
  };
}

function run() {
  // ------------------------------------------------------------
  // agreementEngine.js
  // ------------------------------------------------------------

  // 1. All succeed: behavior unchanged from before this fix.
  {
    const result = analyzeAgreement(baseIndicators());

    assert.equal(result.unavailableIndicators.length, 0);
    assert.equal(result.totalIndicators, 9);
    assert.equal(result.direction, "Bullish");
  }

  // 2. RVOL fails: excluded from voting entirely, not counted as
  //    neutral, honestly noted, math based on the rest.
  {
    const indicators = baseIndicators();
    indicators.rvol = {
      success: false,
      error: "Insufficient historical volume data."
    };

    const result = analyzeAgreement(indicators);

    assert.deepEqual(result.unavailableIndicators, ["RVOL"]);
    assert.equal(result.totalIndicators, 8);
    assert.ok(!result.neutral.includes("RVOL"));
    assert.ok(
      result.agreementDetails.some((line) =>
        /RVOL.*unavailable|Relative volume.*unavailable/i.test(line)
      )
    );
  }

  // 3. Missing indicator entirely (not even a failure object):
  //    must not throw.
  {
    const indicators = baseIndicators();
    delete indicators.macd;

    assert.doesNotThrow(() => analyzeAgreement(indicators));

    const result = analyzeAgreement(indicators);
    assert.ok(result.unavailableIndicators.includes("MACD"));
  }

  // 4. Every indicator fails: honest summary, no crash, no
  //    fabricated direction.
  {
    const indicators = {};
    Object.keys(baseIndicators()).forEach((key) => {
      indicators[key] = { success: false, error: "failed" };
    });

    const result = analyzeAgreement(indicators);

    assert.equal(result.totalIndicators, 0);
    assert.equal(result.direction, "Mixed");
    assert.match(result.agreementSummary, /No indicators were available/);
  }

  console.log("agreementEngine.js degradation handling: all assertions passed.");

  // ------------------------------------------------------------
  // trendEngine.js
  // ------------------------------------------------------------

  // 5. No availability argument: unchanged behavior (backward
  //    compatible with any other caller).
  {
    const result = analyzeTrend(
      "Above EMA20",
      "Above SMA50",
      "Bullish",
      "Strong Trend"
    );

    assert.ok(result.details.includes("EMA Bullish"));
    assert.ok(!result.details.includes("EMA Unavailable"));
  }

  // 6. EMA marked unavailable: labeled honestly, not "Neutral".
  {
    const result = analyzeTrend(
      undefined,
      "Above SMA50",
      "Bullish",
      "Strong Trend",
      { ema: false }
    );

    assert.ok(result.details.includes("EMA Unavailable"));
    assert.ok(!result.details.includes("EMA Neutral"));
  }

  console.log("trendEngine.js availability handling: all assertions passed.");
}

try {
  run();
} catch (error) {
  console.error("Agreement/trend degradation test failed:", error);
  process.exitCode = 1;
}
