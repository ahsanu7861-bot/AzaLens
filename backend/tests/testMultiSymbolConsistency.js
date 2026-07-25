const assert = require("assert");

const {
  buildAnalysisMetadata,
  buildThesisInvalidation,
} = require("../services/analysisTrustService");

const generatedAt = "2026-07-26T12:00:00.000Z";

function shariahFixture(status = "COMPLIANT") {
  if (status === "UNKNOWN") {
    return {
      success: false,
      summary: { status: "UNKNOWN" },
      provider: { name: "Halal Terminal" },
      providerError: { message: "Screening unavailable." },
    };
  }

  return {
    success: true,
    summary: { status },
    provider: { name: "Halal Terminal" },
    verification: { lastCheckedAt: generatedAt },
    financialScreen: {
      ratios: { debtToAssets: status === "NON_COMPLIANT" ? 0.34 : 0.2 },
    },
    businessActivity: {
      revenueRatios: { impermissible: 0.01 },
    },
    metadata: {
      providerMetadata: { fromCache: false, fetchedAt: generatedAt },
    },
  };
}

function scenario({
  symbol,
  direction,
  close,
  rvol,
  shariahStatus = "COMPLIANT",
  livePriceAvailable = true,
  historicalCloseAvailable = true,
}) {
  const bullish = direction === "BULLISH";
  const bearish = direction === "BEARISH";
  const shariah = shariahFixture(shariahStatus);
  const market = {
    success: livePriceAvailable,
    provider: "Finnhub",
    data: { timestamp: generatedAt, currency: "USD" },
    cache: { hit: false, status: "MISS" },
  };
  const history = {
    success: historicalCloseAvailable,
    provider: "TwelveData",
    interval: "1day",
    bars: historicalCloseAvailable ? [{ close }] : [],
    metadata: { latestDate: generatedAt },
  };
  const priceContext = {
    livePriceAvailable,
    historicalCloseAvailable,
    analysisPrice: livePriceAvailable || historicalCloseAvailable ? close : null,
    latestHistoricalClose: historicalCloseAvailable ? close : null,
  };
  const confluence = {
    nearestSupport: bullish ? { zone: { center: 100 } } : null,
    nearestResistance: bearish ? { zone: { center: 100 } } : null,
  };
  const indicators = { rvol: { rvol } };
  const agreement = { direction };

  return {
    symbol,
    metadata: buildAnalysisMetadata({
      symbol,
      generatedAt,
      market,
      history,
      priceContext,
      shariah,
      dataQuality: { warnings: [] },
    }),
    invalidation: buildThesisInvalidation({
      generatedAt,
      market,
      history,
      priceContext,
      shariah,
      confluence,
      indicators,
      agreement,
    }),
  };
}

const matrix = [
  {
    input: {
      symbol: "AAPL",
      direction: "BULLISH",
      close: 105,
      rvol: 1.2,
    },
    expected: { review: false, technical: "intact", overall: "intact" },
  },
  {
    input: {
      symbol: "TSLA",
      direction: "BEARISH",
      close: 105,
      rvol: 1.8,
    },
    expected: { review: false, technical: "violated", overall: "violated" },
  },
  {
    input: {
      symbol: "MSFT",
      direction: "NEUTRAL",
      close: 100,
      rvol: 1,
    },
    expected: { review: false, technical: "unknown", overall: "unknown" },
  },
  {
    input: {
      symbol: "NVDA",
      direction: "BULLISH",
      close: 105,
      rvol: 1.2,
      shariahStatus: "UNKNOWN",
    },
    expected: { review: true, technical: "intact", overall: "unknown" },
  },
  {
    input: {
      symbol: "AMD",
      direction: "BULLISH",
      close: 105,
      rvol: 1.2,
      livePriceAvailable: false,
    },
    expected: { review: true, market: "fallback", overall: "intact" },
  },
  {
    input: {
      symbol: "INVALID",
      direction: "NEUTRAL",
      close: null,
      rvol: null,
      shariahStatus: "UNKNOWN",
      livePriceAvailable: false,
      historicalCloseAvailable: false,
    },
    expected: {
      review: true,
      market: "unavailable",
      technical: "unknown",
      overall: "unknown",
    },
  },
];

for (const { input, expected } of matrix) {
  const result = scenario(input);

  assert.strictEqual(
    result.metadata.reviewRequired,
    expected.review,
    `${input.symbol}: header review state must match evidence limitations`
  );
  assert.strictEqual(
    result.invalidation.status,
    expected.overall,
    `${input.symbol}: overall invalidation status`
  );

  if (expected.market) {
    assert.strictEqual(
      result.metadata.state,
      expected.market,
      `${input.symbol}: market freshness state`
    );
  }

  if (expected.technical) {
    assert.strictEqual(
      result.invalidation.evidence.technical.status,
      expected.technical,
      `${input.symbol}: technical invalidation status`
    );
  }
}

console.log(
  `Multi-symbol consistency matrix passed (${matrix.length} scenarios).`
);
