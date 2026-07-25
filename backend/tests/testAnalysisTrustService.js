const assert = require("assert");

const {
  buildAnalysisMetadata,
  buildThesisInvalidation,
} = require("../services/analysisTrustService");

const generatedAt = "2026-07-25T12:00:00.000Z";

function baseInput() {
  return {
    symbol: "AAPL",
    generatedAt,
    market: {
      success: true,
      provider: "Finnhub",
      data: {
        currency: "USD",
        price: 225,
        timestamp: 1784979900,
      },
      cache: {
        status: "MISS",
        hit: false,
      },
    },
    history: {
      success: true,
      provider: "TwelveData",
      interval: "1day",
      cache: "MISS",
      bars: [
        {
          close: 224,
        },
      ],
      metadata: {
        latestDate: "2026-07-24",
      },
      performance: {
        cacheHit: false,
      },
    },
    priceContext: {
      livePriceAvailable: true,
      historicalCloseAvailable: true,
      latestHistoricalClose: 224,
      analysisPrice: 225,
    },
    agreement: {
      direction: "Bullish",
    },
    confluence: {
      nearestSupport: {
        zone: {
          center: 218.5,
        },
      },
    },
    indicators: {
      rvol: {
        rvol: 1.2,
      },
    },
    shariah: {
      success: true,
      summary: {
        status: "COMPLIANT",
      },
      provider: {
        name: "Halal Terminal",
      },
      financialScreen: {
        ratios: {
          debtToAssets: 0.2,
        },
      },
      businessActivity: {
        revenueRatios: {
          impermissible: 0.01,
        },
      },
      verification: {
        lastCheckedAt: generatedAt,
        isStale: false,
      },
      metadata: {
        providerMetadata: {
          fromCache: false,
        },
      },
    },
    dataQuality: {
      warnings: [],
    },
  };
}

{
  const input = baseInput();
  const metadata = buildAnalysisMetadata(input);

  assert.strictEqual(metadata.contractVersion, "1.0.0");
  assert.strictEqual(metadata.state, "delayed");
  assert.strictEqual(metadata.delayMinutes, 15);
  assert.strictEqual(metadata.reviewRequired, false);
  assert.strictEqual(metadata.sources.shariah.state, "fresh");
  assert.strictEqual(metadata.evidenceCompleteness.percent, 100);
}

{
  const input = baseInput();
  const invalidation = buildThesisInvalidation(input);

  assert.strictEqual(invalidation.status, "intact");
  assert.strictEqual(invalidation.evidence.technical.status, "intact");
  assert.strictEqual(invalidation.evidence.fundamental.status, "intact");
}

{
  const input = baseInput();
  input.history.bars[0].close = 210;
  input.priceContext.latestHistoricalClose = 210;
  input.indicators.rvol.rvol = 1.8;

  const invalidation = buildThesisInvalidation(input);

  assert.strictEqual(invalidation.status, "violated");
  assert.strictEqual(invalidation.evidence.technical.status, "violated");
}

{
  const input = baseInput();
  input.symbol = "TSLA";
  input.agreement.direction = "Bearish";
  input.confluence = {
    nearestResistance: {
      zone: {
        center: 240,
      },
    },
  };
  input.history.bars[0].close = 245;
  input.priceContext.latestHistoricalClose = 245;
  input.indicators.rvol.rvol = 1.7;

  const invalidation = buildThesisInvalidation(input);

  assert.strictEqual(invalidation.status, "violated");
  assert.strictEqual(invalidation.evidence.technical.status, "violated");
}

{
  const input = baseInput();
  input.history.bars[0].close = 210;
  input.priceContext.latestHistoricalClose = 210;
  input.indicators.rvol.rvol = null;

  const invalidation = buildThesisInvalidation(input);

  assert.strictEqual(invalidation.status, "unknown");
  assert.strictEqual(invalidation.evidence.technical.status, "unknown");
}

{
  const input = baseInput();
  input.shariah = {
    success: false,
    summary: {
      status: "UNKNOWN",
    },
    provider: {
      name: "Halal Terminal",
    },
    providerError: {
      message: "Provider timed out.",
    },
  };

  const metadata = buildAnalysisMetadata(input);
  const invalidation = buildThesisInvalidation(input);

  assert.strictEqual(metadata.sources.shariah.state, "unavailable");
  assert.strictEqual(metadata.sources.shariah.reviewRequired, true);
  assert.deepStrictEqual(metadata.providerErrors, ["Provider timed out."]);
  assert.strictEqual(invalidation.status, "unknown");
  assert.strictEqual(
    invalidation.evidence.fundamental.status,
    "unknown"
  );
}

{
  const input = baseInput();
  input.market.success = false;
  input.priceContext.livePriceAvailable = false;
  input.priceContext.historicalCloseAvailable = true;

  const metadata = buildAnalysisMetadata(input);

  assert.strictEqual(metadata.state, "fallback");
  assert.strictEqual(metadata.reviewRequired, true);
}

console.log("Analysis trust service tests passed.");
