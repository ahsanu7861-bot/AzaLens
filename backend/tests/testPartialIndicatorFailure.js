const assert = require("node:assert/strict");
const path = require("path");

// ============================================================
// AzaLens - Partial Indicator Failure Regression Test
//
// Proves item 1.7's fix end-to-end through the REAL
// getMasterAnalysis() control flow - not just a unit test of the
// compliance gate in isolation. Stubs the network-dependent modules
// via require.cache (no mocking library needed) so one indicator
// (RVOL) fails while the rest succeed, then runs the actual
// production pipeline (structure, confluence, trend, agreement,
// explanation, risk, and the compliance gate) against that data.
//
// This is the test the founder specifically asked to see pass
// before this fix is committed: a degraded analysis on a
// NON_COMPLIANT stock must still withhold the verdict exactly like
// a fully-successful one does - graceful degradation must not open
// a hole in the Shariah compliance gate.
// ============================================================

function stub(relativeToServices, exportsObject) {
  const resolved = path.resolve(
    __dirname,
    "..",
    "services",
    relativeToServices
  );

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

function installStubs() {
  const bars = buildBars();

  stub("marketEngine.js", {
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
      metadata: {
        exchange: "NASDAQ",
        exchangeTimezone: "America/New_York",
        barCount: bars.length
      },
      cache: "MISS",
      dataQuality: { status: "Good", warnings: [] }
    })
  });

  const successfulIndicator = (extra) => async () => ({
    success: true,
    provider: "TwelveData",
    symbol: "TESTCO",
    ...extra
  });

  stub(
    "rsiService.js",
    { getRSI: successfulIndicator({ rsi: 55, signal: "Neutral" }) }
  );

  stub(
    "emaService.js",
    {
      getEMA: successfulIndicator({
        ema20: 104,
        currentPrice: 105,
        signal: "Above EMA20"
      })
    }
  );

  stub(
    "smaService.js",
    {
      getSMA: successfulIndicator({
        sma50: 103,
        currentPrice: 105,
        signal: "Above SMA50"
      })
    }
  );

  stub(
    "macdService.js",
    {
      getMACD: successfulIndicator({
        macd: 1.2,
        signalLine: 0.8,
        histogram: 0.4,
        signal: "Bullish"
      })
    }
  );

  stub(
    "bollingerService.js",
    {
      getBollinger: successfulIndicator({
        upperBand: 110,
        middleBand: 105,
        lowerBand: 100,
        currentPrice: 105,
        signal: "Price Near Upper Band"
      })
    }
  );

  stub(
    "atrService.js",
    { getATR: successfulIndicator({ atr: 2.1, signal: "Moderate" }) }
  );

  stub(
    "adxService.js",
    {
      getADX: successfulIndicator({
        adx: 28,
        plusDI: 20,
        minusDI: 10,
        signal: "Strong Trend"
      })
    }
  );

  stub(
    "obvService.js",
    { getOBV: successfulIndicator({ obv: 500000, signal: "Accumulation" }) }
  );

  // The one indicator that fails - exactly the scenario from the
  // bug report (a thinly-traded ticker with under 31 volume bars).
  stub("rvolService.js", {
    getRVOL: async () => ({
      success: false,
      provider: "TwelveData",
      symbol: "TESTCO",
      error:
        "Insufficient historical volume data to calculate 30-day RVOL."
    })
  });

  stub("volumeSpikeService.js", {
    getVolumeSpike: successfulIndicator({
      volumeSpikeDetected: false,
      level: "Normal",
      signal: "No Volume Spike"
    })
  });

  stub("candlestickService.js", {
    getCandlestick: successfulIndicator({
      pattern: "None",
      bias: "Neutral",
      strength: 0
    })
  });
}

function installShariahStub(status) {
  stub("shariahComplianceService.js", {
    getShariahCompliance: async () => ({
      success: status !== "SCREENING_FAILED",
      symbol: "TESTCO",
      summary: {
        status,
        confidence: status === "COMPLIANT" ? "HIGH" : "MEDIUM",
        headline: `TESTCO screening status: ${status}`
      },
      verification: { lastCheckedAt: new Date().toISOString(), isStale: false }
    })
  });
}

async function run() {
  // ----------------------------------------------------------
  // Scenario 1: degraded (RVOL failed) + NON_COMPLIANT.
  // The exact case the founder asked to see verified: the verdict
  // must still be withheld.
  // ----------------------------------------------------------
  {
    Object.keys(require.cache).forEach((key) => delete require.cache[key]);
    installStubs();
    installShariahStub("NON_COMPLIANT");

    const { getMasterAnalysis } = require("../services/masterAnalysisService");
    const result = await getMasterAnalysis("TESTCO");

    assert.equal(
      result.success,
      true,
      "a single failed indicator must not fail the whole analysis"
    );

    assert.equal(
      result.dataQuality.status,
      "Degraded",
      "dataQuality must reflect the partial failure"
    );

    assert.equal(result.data.indicators.rvol.success, false);
    assert.equal(result.data.indicators.ema.success, true);
    assert.equal(result.data.indicators.macd.success, true);

    assert.equal(
      result.data.complianceGate.unlocked,
      false,
      "NON_COMPLIANT must withhold regardless of degradation"
    );

    assert.equal(result.data.agreement.withheld, true);
    assert.equal(result.data.agreement.direction, undefined);
    assert.equal(result.data.trend.withheld, true);
    assert.equal(result.data.explanation.withheld, true);

    console.log(
      "Scenario 1 passed: degraded + NON_COMPLIANT still withholds the verdict."
    );
  }

  // ----------------------------------------------------------
  // Scenario 2: degraded (RVOL failed) + CONFIRMED COMPLIANT.
  // Positive control - proves the withholding above is really
  // driven by compliance status, not by degradation itself, and
  // that the working indicators still produce a real verdict.
  // ----------------------------------------------------------
  {
    Object.keys(require.cache).forEach((key) => delete require.cache[key]);
    installStubs();
    installShariahStub("COMPLIANT");

    const { getMasterAnalysis } = require("../services/masterAnalysisService");
    const result = await getMasterAnalysis("TESTCO");

    assert.equal(result.success, true);
    assert.equal(result.dataQuality.status, "Degraded");
    assert.equal(result.data.indicators.rvol.success, false);

    assert.equal(result.data.complianceGate.unlocked, true);
    assert.equal(result.data.agreement.withheld, undefined);
    assert.equal(typeof result.data.agreement.direction, "string");
    assert.equal(typeof result.data.agreement.confidence, "number");
    assert.ok(
      result.data.agreement.unavailableIndicators.includes("RVOL"),
      "agreement must record which indicator was excluded"
    );
    assert.ok(
      !result.data.agreement.bullish.includes("RVOL") &&
        !result.data.agreement.bearish.includes("RVOL") &&
        !result.data.agreement.neutral.includes("RVOL"),
      "a failed indicator must not be silently counted as neutral"
    );

    console.log(
      "Scenario 2 passed: degraded + CONFIRMED COMPLIANT still unlocks a real, partial-evidence verdict."
    );
  }

  // ----------------------------------------------------------
  // Scenario 3: every indicator fails - genuinely nothing useful
  // to show. This must still fail, honestly.
  // ----------------------------------------------------------
  {
    Object.keys(require.cache).forEach((key) => delete require.cache[key]);
    installStubs();
    installShariahStub("COMPLIANT");

    const failingIndicator = async () => ({
      success: false,
      provider: "TwelveData",
      symbol: "TESTCO",
      error: "Unable to calculate."
    });

    stub("rsiService.js", { getRSI: failingIndicator });
    stub("emaService.js", { getEMA: failingIndicator });
    stub("smaService.js", { getSMA: failingIndicator });
    stub("macdService.js", { getMACD: failingIndicator });
    stub("bollingerService.js", { getBollinger: failingIndicator });
    stub("atrService.js", { getATR: failingIndicator });
    stub("adxService.js", { getADX: failingIndicator });
    stub("obvService.js", { getOBV: failingIndicator });
    stub("volumeSpikeService.js", { getVolumeSpike: failingIndicator });
    stub("candlestickService.js", { getCandlestick: failingIndicator });

    const { getMasterAnalysis } = require("../services/masterAnalysisService");
    const result = await getMasterAnalysis("TESTCO");

    assert.equal(
      result.success,
      false,
      "zero working indicators must fail honestly"
    );

    assert.doesNotMatch(
      result.error,
      /backend is running/i,
      "the error must not blame the backend when it's actually a data gap"
    );

    console.log(
      "Scenario 3 passed: total indicator failure still fails, with an honest message."
    );
  }
}

run()
  .then(() => {
    console.log(
      "Partial indicator failure regression: all scenarios passed."
    );
  })
  .catch((error) => {
    console.error("Partial indicator failure test failed:", error);
    process.exitCode = 1;
  });
