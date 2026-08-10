"use strict";

/*
 * AzaLens - shared risk trust boundary.
 *
 * The Overview sidebar renders `data.risk.riskLevel` and the guidance panel
 * renders `data.guidance.risk.level`. Both come from one `analyzeRisk` result.
 * Before this boundary existed, an internally contradictory result (a score of 95
 * carrying the level "Low") could be withheld by guidance yet still rendered raw
 * by the sidebar - two public panels disagreeing about the same analysis.
 *
 * masterAnalysisService now validates the result once, immediately after
 * analyzeRisk, so both consumers receive the same already-checked object. These
 * tests prove that at the unit level and, via the real getMasterAnalysis control
 * flow, in the serialized analysis response itself.
 */

const assert = require("node:assert/strict");
const path = require("node:path");

const {
  analyzeRisk,
  classifyRiskLevel,
  isCoherentRiskResult,
  validateRiskResult,
  RISK_LEVELS,
  RISK_SCORE_MIN,
  RISK_SCORE_MAX
} = require("../analysis/risk/riskEngine");

const COHERENT = {
  success: true,
  symbol: "TESTCO",
  riskLevel: "Moderate",
  riskScore: 42,
  volatility: "Moderate",
  atrPercent: 2.4,
  riskSummary: "TESTCO currently has a moderate technical risk profile.",
  riskNotes: []
};

function withRisk(overrides) {
  return { ...COHERENT, ...overrides };
}

// ---------------------------------------------------------------------------
// 1. The canonical classifier is strict about its input.
// ---------------------------------------------------------------------------

function testClassifierIsStrict() {
  // Real thresholds, proven from the engine's own code.
  const boundaries = [
    [0, "Low"],
    [29, "Low"],
    [29.999, "Low"],
    [30, "Moderate"],
    [42, "Moderate"],
    [49, "Moderate"],
    [50, "High"],
    [52, "High"],
    [69, "High"],
    [70, "Very High"],
    [100, "Very High"]
  ];

  for (const [score, level] of boundaries) {
    assert.equal(classifyRiskLevel(score), level, `score ${score}`);
  }

  /*
   * Number() would coerce every one of these to a finite number - null, "",
   * "  " and false all become 0, which is a legitimate score. A coercing
   * classifier would certify null as "Low".
   */
  const coercible = [null, "", "   ", false, true, [], [42], "42", "0"];
  for (const score of coercible) {
    assert.equal(
      classifyRiskLevel(score),
      null,
      `${JSON.stringify(score)} must not be coerced into a score`
    );
  }

  // Non-numeric and non-finite values.
  for (const score of [undefined, {}, NaN, Infinity, -Infinity, "abc"]) {
    assert.equal(classifyRiskLevel(score), null, `${String(score)} must be rejected`);
  }

  // The engine clamps its own score to 0-100 (riskEngine.js), so out-of-range
  // input did not come from the engine and cannot be classified.
  assert.equal(RISK_SCORE_MIN, 0);
  assert.equal(RISK_SCORE_MAX, 100);
  for (const score of [-1, -0.001, 100.001, 101, 1000]) {
    assert.equal(classifyRiskLevel(score), null, `out-of-range ${score} must be rejected`);
  }
}

// ---------------------------------------------------------------------------
// 2. Coherence predicate and the boundary validator.
// ---------------------------------------------------------------------------

function testValidatorWithholdsIncoherentResults() {
  // Valid engine output passes through completely untouched.
  const valid = validateRiskResult(COHERENT);
  assert.equal(valid, COHERENT, "a coherent result must be the identical object");
  assert.deepEqual(valid, COHERENT);

  for (const [riskScore, riskLevel] of [[42, "Moderate"], [52, "High"], [0, "Low"], [100, "Very High"]]) {
    const result = validateRiskResult(withRisk({ riskScore, riskLevel }));
    assert.equal(result.success, true, `${riskScore}/${riskLevel} must pass`);
    assert.equal(result.riskLevel, riskLevel);
    assert.equal(result.riskScore, riskScore);
  }

  // The reported defect: 95 with "Low".
  const rejected = validateRiskResult(withRisk({ riskScore: 95, riskLevel: "Low" }));
  assert.equal(rejected.success, false);
  assert.equal(rejected.riskLevel, undefined, "no level survives");
  assert.equal(rejected.riskScore, undefined, "no score survives");
  assert.match(rejected.error, /internal consistency check/i);
  assert.equal(rejected.symbol, "TESTCO");
  // It is withheld, never "corrected" to the level the score implies.
  assert.doesNotMatch(JSON.stringify(rejected), /Very High|Low|Moderate/);

  // Other contradictory pairs.
  for (const [riskScore, riskLevel] of [
    [95, "Moderate"],
    [10, "Very High"],
    [42, "High"],
    [52, "Moderate"],
    [69, "Very High"],
    [70, "High"],
    [29, "Moderate"],
    [30, "Low"]
  ]) {
    const result = validateRiskResult(withRisk({ riskScore, riskLevel }));
    assert.equal(result.success, false, `${riskScore}/${riskLevel} must be withheld`);
  }

  // Unsupported or malformed levels - including the casing the product never emits.
  for (const riskLevel of [
    undefined, null, "", "   ", 42, {}, [], true,
    "MEDIUM", "Medium", "low", "LOW", "moderate", "Very high", "Extreme", " Moderate "
  ]) {
    const result = validateRiskResult(withRisk({ riskLevel }));
    assert.equal(
      result.success,
      false,
      `level ${JSON.stringify(riskLevel)} must fail closed`
    );
  }

  // Missing, malformed, coercible or out-of-range scores.
  for (const riskScore of [
    undefined, null, "", "   ", false, true, [], {}, NaN, Infinity, -Infinity,
    "42", "abc", -1, 101
  ]) {
    const result = validateRiskResult(withRisk({ riskScore }));
    assert.equal(
      result.success,
      false,
      `score ${JSON.stringify(riskScore)} must fail closed`
    );
  }

  // An already-failed result keeps its own honest reason rather than being relabelled.
  const engineFailure = {
    success: false,
    symbol: "TESTCO",
    error: "A valid current market price is required."
  };
  assert.equal(validateRiskResult(engineFailure), engineFailure);

  // Absent input is malformed, not a pass-through: it yields the unavailable shape.
  for (const absent of [null, undefined]) {
    const result = validateRiskResult(absent);
    assert.equal(result.success, false);
    assert.equal(result.riskLevel, undefined);
    assert.equal(result.symbol, "Unknown");
  }

  // The predicate and the validator agree.
  assert.equal(isCoherentRiskResult(COHERENT), true);
  assert.equal(isCoherentRiskResult(withRisk({ riskScore: 95, riskLevel: "Low" })), false);
  assert.equal(isCoherentRiskResult(engineFailure), false);
}

/*
 * `success` must be a strict boolean. A missing, null, numeric or string flag is
 * malformed, not a verdict. Preserving such an object would let a downstream
 * truthiness check (`if (risk.success)`) treat it as successful and render its
 * raw riskLevel and riskScore - the exact leak this boundary exists to stop.
 */
function testMalformedSuccessFlagsFailClosed() {
  const malformedFlags = [
    ["missing", {}],
    ["null", { success: null }],
    ["undefined", { success: undefined }],
    ["0", { success: 0 }],
    ["1", { success: 1 }],
    ['"true"', { success: "true" }],
    ['"false"', { success: "false" }],
    ['""', { success: "" }],
    ["{}", { success: {} }],
    ["[]", { success: [] }],
    ["NaN", { success: NaN }],
    ["Boolean object", { success: new Boolean(true) }]
  ];

  for (const [label, flag] of malformedFlags) {
    // Carry a fully coherent profile so only the flag is at fault.
    const malformed = { ...COHERENT, ...flag };
    if (label === "missing") delete malformed.success;

    const result = validateRiskResult(malformed);

    assert.equal(result.success, false, `success ${label} must become success:false`);
    assert.equal(typeof result.success, "boolean", `success ${label} must yield a real boolean`);
    assert.equal(result.riskLevel, undefined, `success ${label} must not expose a level`);
    assert.equal(result.riskScore, undefined, `success ${label} must not expose a score`);
    assert.match(result.error, /malformed result/i);
    assert.doesNotMatch(JSON.stringify(result), /Moderate|42/);

    // A truthiness check downstream now sees a falsy flag, as it must.
    assert.equal(Boolean(result.success), false, `success ${label} must be falsy downstream`);
  }

  // Non-object inputs are malformed too, and never returned as-is.
  for (const input of [null, undefined, "", "risk", 0, 42, true, false, NaN, [], [COHERENT]]) {
    const result = validateRiskResult(input);

    assert.equal(typeof result, "object", `${JSON.stringify(input)} must yield an object`);
    assert.notEqual(result, null);
    assert.equal(result.success, false);
    assert.equal(result.riskLevel, undefined);
    assert.equal(result.riskScore, undefined);
    assert.equal(result.symbol, "Unknown");
  }

  // A legitimate engine failure is still preserved byte for byte.
  const engineFailure = {
    success: false,
    symbol: "TESTCO",
    error: "A valid current market price is required."
  };
  assert.equal(validateRiskResult(engineFailure), engineFailure);
  assert.equal(validateRiskResult(engineFailure).error, "A valid current market price is required.");

  // A malformed symbol does not leak into the unavailable result either.
  for (const symbol of [{}, [], 42, null, "", "   "]) {
    assert.equal(validateRiskResult({ success: "true", symbol }).symbol, "Unknown");
  }
  assert.equal(validateRiskResult({ success: "true", symbol: "TESTCO" }).symbol, "TESTCO");

  // And a coherent result is still untouched.
  assert.equal(validateRiskResult(COHERENT), COHERENT);
}

// ---------------------------------------------------------------------------
// 3. Real engine output always satisfies its own validator.
// ---------------------------------------------------------------------------

function testRealEngineOutputIsAlwaysCoherent() {
  const analysis = {
    success: true,
    symbol: "TESTCO",
    market: { success: true, data: { price: 105 } },
    indicators: {
      atr: { success: true, atr: 2.1 },
      adx: { success: true, adx: 28 },
      rvol: { success: true, rvol: 1.2, session: { status: "CLOSED" } }
    },
    trend: { success: true, trend: "Strong Uptrend" },
    agreement: { confidence: 74 }
  };

  const produced = analyzeRisk(analysis);
  assert.equal(produced.success, true);
  assert.ok(RISK_LEVELS.includes(produced.riskLevel));
  assert.equal(
    isCoherentRiskResult(produced),
    true,
    "the engine must never produce a result its own validator rejects"
  );
  assert.equal(validateRiskResult(produced), produced);
}

// ---------------------------------------------------------------------------
// 4. The serialized analysis response, through the real control flow.
// ---------------------------------------------------------------------------

function stubService(relativePath, exportsObject) {
  const resolved = require.resolve(path.resolve(__dirname, "..", relativePath));
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: exportsObject
  };
}

function buildBars(count = 60) {
  const bars = [];
  const start = new Date("2026-05-01T00:00:00Z");

  for (let index = 0; index < count; index += 1) {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + index);
    const price = 100 + Math.sin(index / 5) * 5;

    bars.push({
      date: date.toISOString().slice(0, 10),
      open: price,
      high: price + 1,
      low: price - 1,
      close: price + 0.25,
      volume: 1_000_000 + index * 1000
    });
  }

  return bars;
}

function installAnalysisStubs() {
  const bars = buildBars();

  stubService("services/marketEngine.js", {
    getMarketData: async () => ({
      success: true,
      provider: "Finnhub",
      symbol: "TESTCO",
      data: {
        symbol: "TESTCO",
        company: "Test Co",
        exchange: "NASDAQ",
        currency: "USD",
        price: 105,
        previousClose: 104,
        open: 104.5,
        high: 106,
        low: 104,
        change: 1,
        changePercent: 0.96,
        timestamp: Math.floor(Date.now() / 1000)
      },
      cache: { status: "MISS", hit: false }
    }),
    getHistory: async () => ({
      success: true,
      provider: "TwelveData",
      symbol: "TESTCO",
      bars,
      data: {
        t: bars.map((bar) => bar.date),
        o: bars.map((bar) => bar.open),
        h: bars.map((bar) => bar.high),
        l: bars.map((bar) => bar.low),
        c: bars.map((bar) => bar.close),
        v: bars.map((bar) => bar.volume)
      },
      metadata: { exchange: "NASDAQ", exchangeTimezone: "America/New_York", barCount: bars.length },
      cache: "MISS",
      dataQuality: { status: "Good", warnings: [] }
    })
  });

  const indicator = (extra) => async () => ({
    success: true,
    provider: "TwelveData",
    symbol: "TESTCO",
    ...extra
  });

  stubService("services/rsiService.js", { getRSI: indicator({ rsi: 55, signal: "Neutral" }) });
  stubService("services/emaService.js", {
    getEMA: indicator({ ema20: 104, currentPrice: 105, signal: "Above EMA20" })
  });
  stubService("services/smaService.js", {
    getSMA: indicator({ sma50: 103, currentPrice: 105, signal: "Above SMA50" })
  });
  stubService("services/macdService.js", {
    getMACD: indicator({ macd: 1.2, signalLine: 0.8, histogram: 0.4, signal: "Bullish" })
  });
  stubService("services/bollingerService.js", {
    getBollinger: indicator({
      upperBand: 110, middleBand: 105, lowerBand: 100, currentPrice: 105, signal: "Price Near Upper Band"
    })
  });
  stubService("services/atrService.js", { getATR: indicator({ atr: 2.1, signal: "Moderate" }) });
  stubService("services/adxService.js", {
    getADX: indicator({ adx: 28, plusDI: 20, minusDI: 10, signal: "Strong Trend" })
  });
  stubService("services/obvService.js", { getOBV: indicator({ obv: 500000, signal: "Accumulation" }) });
  stubService("services/rvolService.js", {
    getRVOL: indicator({ rvol: 1.2, signal: "Normal", session: { status: "CLOSED" } })
  });
  stubService("services/volumeSpikeService.js", {
    getVolumeSpike: indicator({ volumeSpikeDetected: false, level: "Normal", signal: "No Volume Spike" })
  });
  stubService("services/candlestickService.js", {
    getCandlestick: indicator({ pattern: "None", bias: "Neutral", strength: 0 })
  });
  stubService("services/shariahComplianceService.js", {
    getShariahCompliance: async () => ({
      success: true,
      symbol: "TESTCO",
      summary: { status: "COMPLIANT", confidence: "HIGH", headline: "TESTCO screening status: COMPLIANT" },
      verification: { lastCheckedAt: new Date().toISOString(), isStale: false }
    })
  });
}

/*
 * Replaces only `analyzeRisk`, keeping the real validator exports intact - so the
 * boundary under test is exactly the production one.
 */
function installRiskEngineStub(riskResult) {
  const realPath = require.resolve(
    path.resolve(__dirname, "..", "analysis/risk/riskEngine.js")
  );
  const real = require(realPath);

  require.cache[realPath] = {
    id: realPath,
    filename: realPath,
    loaded: true,
    exports: { ...real, analyzeRisk: () => riskResult }
  };
}

async function testSerializedResponseWithholdsIncoherentRisk() {
  Object.keys(require.cache).forEach((key) => delete require.cache[key]);
  installAnalysisStubs();
  installRiskEngineStub({
    success: true,
    symbol: "TESTCO",
    riskLevel: "Low",
    riskScore: 95,
    volatility: "Very High",
    atrPercent: 6.2,
    riskSummary: "TESTCO currently has a low technical risk profile.",
    riskNotes: []
  });

  const { getMasterAnalysis } = require("../services/masterAnalysisService");
  const result = await getMasterAnalysis("TESTCO");

  assert.equal(result.success, true, "an incoherent risk profile must not fail the analysis");

  // data.risk - what the Overview sidebar and the Risk workspace read.
  assert.equal(result.data.risk.success, false);
  assert.equal(result.data.risk.riskLevel, undefined, "sidebar cannot render a level");
  assert.equal(result.data.risk.riskScore, undefined, "sidebar cannot render a score");
  assert.match(result.data.risk.error, /internal consistency check/i);

  // data.guidance.risk - what the guidance panel reads.
  assert.equal(result.data.guidance.risk, null, "guidance cannot render a profile");

  // The serialized response exposes neither half of the contradictory pair.
  const serializedRisk = JSON.stringify({
    risk: result.data.risk,
    guidanceRisk: result.data.guidance.risk
  });
  assert.doesNotMatch(serializedRisk, /"riskLevel"/);
  assert.doesNotMatch(serializedRisk, /95/);
  assert.doesNotMatch(serializedRisk, /"Low"/);

  // Both public panels fail closed together: neither has anything to disagree about.
  assert.equal(result.data.risk.riskLevel ?? null, result.data.guidance.risk);
}

async function testSerializedResponseWithholdsMalformedSuccessFlag() {
  Object.keys(require.cache).forEach((key) => delete require.cache[key]);
  installAnalysisStubs();
  // A truthy non-boolean flag carrying a fully readable profile.
  installRiskEngineStub({
    success: "true",
    symbol: "TESTCO",
    riskLevel: "Low",
    riskScore: 95,
    volatility: "Very High",
    riskSummary: "TESTCO currently has a low technical risk profile.",
    riskNotes: []
  });

  const { getMasterAnalysis } = require("../services/masterAnalysisService");
  const result = await getMasterAnalysis("TESTCO");

  assert.equal(result.success, true);
  assert.equal(result.data.risk.success, false);
  assert.equal(typeof result.data.risk.success, "boolean");
  assert.equal(result.data.risk.riskLevel, undefined);
  assert.equal(result.data.risk.riskScore, undefined);
  assert.equal(result.data.guidance.risk, null);

  const serializedRisk = JSON.stringify({
    risk: result.data.risk,
    guidanceRisk: result.data.guidance.risk
  });
  assert.doesNotMatch(serializedRisk, /"riskLevel"/);
  assert.doesNotMatch(serializedRisk, /"riskScore"/);
  assert.doesNotMatch(serializedRisk, /95/);
  assert.doesNotMatch(serializedRisk, /"Low"/);
}

async function testSerializedResponsePreservesValidRisk() {
  Object.keys(require.cache).forEach((key) => delete require.cache[key]);
  installAnalysisStubs();

  const { getMasterAnalysis } = require("../services/masterAnalysisService");
  const result = await getMasterAnalysis("TESTCO");

  assert.equal(result.success, true);
  assert.equal(result.data.risk.success, true, "a genuine engine result must survive the boundary");
  assert.ok(
    RISK_LEVELS.includes(result.data.risk.riskLevel),
    `unexpected level ${result.data.risk.riskLevel}`
  );
  assert.equal(
    classifyRiskLevel(result.data.risk.riskScore),
    result.data.risk.riskLevel,
    "the published pair must agree under the canonical thresholds"
  );

  // When guidance publishes a profile, it is the same canonical level.
  const guidanceRisk = result.data.guidance.risk;
  if (guidanceRisk) {
    assert.equal(guidanceRisk.level, result.data.risk.riskLevel, "both panels show one level");
    assert.equal(guidanceRisk.score, result.data.risk.riskScore);
  }
}

async function run() {
  testClassifierIsStrict();
  testValidatorWithholdsIncoherentResults();
  testMalformedSuccessFlagsFailClosed();
  testRealEngineOutputIsAlwaysCoherent();
  await testSerializedResponseWithholdsIncoherentRisk();
  await testSerializedResponseWithholdsMalformedSuccessFlag();
  await testSerializedResponsePreservesValidRisk();

  console.log(
    "Risk trust boundary tests passed: incoherent profiles are withheld before both consumers."
  );
}

if (require.main === module) {
  run().catch((error) => {
    console.error("Risk boundary test failed:", error);
    process.exitCode = 1;
  });
}

module.exports = { run };
