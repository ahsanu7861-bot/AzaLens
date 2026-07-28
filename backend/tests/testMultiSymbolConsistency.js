"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  analyzeRisk,
} = require("../analysis/risk/riskEngine");
const {
  analyzeTrend,
} = require("../analysis/trend/trendEngine");
const {
  buildAnalysisMetadata,
  buildThesisInvalidation,
} = require("../services/analysisTrustService");
const {
  buildFundamentalsSnapshot,
} = require("../services/masterAnalysisService");

const generatedAt = "2026-07-26T12:00:00.000Z";
const fullHistoryBars = 100;
const insufficientHistoryBars = 20;

function makeBars(count, latestClose) {
  return Array.from({ length: count }, (_, index) => ({
    date: new Date(
      Date.UTC(2026, 0, index + 1)
    ).toISOString(),
    open: latestClose - 0.5,
    high: latestClose + 1,
    low: latestClose - 1,
    close: latestClose,
    volume: 1_000_000 + index,
  }));
}

function indicator(signal, success = true) {
  return {
    success,
    signal,
  };
}

function buildTrend(mode) {
  if (mode === "BULLISH_PARTIAL") {
    return analyzeTrend(
      indicator("Price Above EMA"),
      indicator("", false),
      indicator("Bullish Crossover"),
      indicator("", false)
    );
  }

  if (mode === "UNAVAILABLE") {
    return analyzeTrend(
      indicator("Price Above EMA"),
      indicator("", false),
      indicator("", false),
      indicator("Strong Trend")
    );
  }

  if (mode === "BEARISH") {
    return analyzeTrend(
      indicator("Price Below EMA"),
      indicator("Price Below SMA"),
      indicator("Bearish Crossover"),
      indicator("Strong Trend")
    );
  }

  if (mode === "NEUTRAL") {
    return analyzeTrend(
      indicator("Neutral"),
      indicator("Neutral"),
      indicator("Neutral"),
      indicator("Weak Trend")
    );
  }

  return analyzeTrend(
    indicator("Price Above EMA"),
    indicator("Price Above SMA"),
    indicator("Bullish Crossover"),
    indicator("Strong Trend")
  );
}

function buildShariah(mode) {
  if (mode === "UNAVAILABLE") {
    return {
      success: false,
      summary: {
        status: "UNKNOWN",
      },
      provider: {
        name: "Halal Terminal",
      },
      providerError: {
        message: "AAOIFI screening provider timed out.",
      },
    };
  }

  const nonCompliant =
    mode === "NON_COMPLIANT" ||
    mode === "CONFLICT";
  const stale = mode === "STALE";
  const fromCache = mode === "CACHED";
  const status = nonCompliant
    ? "NON_COMPLIANT"
    : "COMPLIANT";

  return {
    success: true,
    summary: {
      status,
    },
    provider: {
      name: "Halal Terminal",
    },
    primaryMethodology: {
      id: "AAOIFI",
      status,
      verified: true,
      basesDisagree: mode === "CONFLICT",
    },
    methodologies: {
      primary: "AAOIFI",
      results: {
        AAOIFI: {
          status,
          verified: true,
        },
        DJIM: {
          status:
            mode === "CONFLICT"
              ? "COMPLIANT"
              : status,
          verified: true,
        },
      },
    },
    verification: {
      lastCheckedAt: stale
        ? "2026-07-01T12:00:00.000Z"
        : generatedAt,
      isStale: stale,
    },
    financialScreen: {
      ratios: {
        debtToAssets: nonCompliant ? 0.34 : 0.2,
      },
    },
    businessActivity: {
      revenueRatios: {
        impermissible: 0.01,
      },
    },
    metadata: {
      providerMetadata: {
        fromCache,
        fetchedAt: generatedAt,
      },
    },
  };
}

function buildScenario(input) {
  const livePriceAvailable =
    input.marketMode !== "FALLBACK" &&
    input.marketMode !== "UNAVAILABLE";
  const historyAvailable =
    input.historyMode !== "UNAVAILABLE";
  const historyBarCount =
    input.historyMode === "INSUFFICIENT"
      ? insufficientHistoryBars
      : historyAvailable
        ? fullHistoryBars
        : 0;
  const historicalCloseAvailable =
    historyAvailable && historyBarCount > 0;
  const profileAvailable =
    livePriceAvailable &&
    input.profileMode !== "UNAVAILABLE";
  const close = input.close ?? 105;
  const rvol = input.rvol ?? 1.2;
  const historyBars = makeBars(historyBarCount, close);

  const market = {
    success: livePriceAvailable,
    provider: "Finnhub",
    symbol: input.symbol,
    data: {
      price: livePriceAvailable ? close : null,
      timestamp: generatedAt,
      currency: "USD",
      company: `${input.symbol} Corporation`,
    },
    companyProfile: profileAvailable
      ? {
          name: `${input.symbol} Corporation`,
          ticker: input.symbol,
          country: "US",
          currency: "USD",
          exchange: "NASDAQ",
          industry: "Test Industry",
          ipoDate: "2000-01-01",
          website: `https://${input.symbol.toLowerCase()}.example`,
          source: "Finnhub Company Profile",
          retrievedAt: generatedAt,
        }
      : null,
    cache: {
      hit: input.marketMode === "CACHED",
      status: input.marketMode === "CACHED" ? "HIT" : "MISS",
    },
    error:
      input.marketMode === "FALLBACK" ||
      input.marketMode === "UNAVAILABLE"
        ? "Finnhub request timed out."
        : null,
    limitations:
      input.profileMode === "UNAVAILABLE"
        ? [
            "Company profile enrichment is unavailable: Finnhub rate limit was reached.",
          ]
        : [],
  };

  const history = {
    success: historyAvailable,
    provider: "TwelveData",
    interval: "1day",
    cache: input.historyMode === "CACHED" ? "HIT" : "MISS",
    bars: historyBars,
    metadata: {
      latestDate: historyBars.at(-1)?.date || null,
    },
    performance: {
      cacheHit: input.historyMode === "CACHED",
    },
    error: historyAvailable
      ? null
      : "Historical OHLCV provider returned no data.",
  };

  const priceContext = {
    livePriceAvailable,
    historicalCloseAvailable,
    livePrice: livePriceAvailable ? close : null,
    latestHistoricalClose: historicalCloseAvailable ? close : null,
    analysisPrice:
      livePriceAvailable || historicalCloseAvailable
        ? close
        : null,
  };
  const fundamentals = buildFundamentalsSnapshot({
    market,
    generatedAt,
  });
  const shariah = buildShariah(input.shariahMode || "COMPLIANT");
  const trend = buildTrend(input.technicalMode || "BULLISH");
  const direction =
    input.technicalMode === "BEARISH"
      ? "BEARISH"
      : input.technicalMode === "NEUTRAL" ||
          input.technicalMode === "UNAVAILABLE"
        ? "NEUTRAL"
        : "BULLISH";
  const agreement = {
    direction,
    confidence: trend.success ? 70 : 0,
  };
  const confluence = {
    nearestSupport:
      direction === "BULLISH"
        ? {
            zone: {
              center: 100,
            },
          }
        : null,
    nearestResistance:
      direction === "BEARISH"
        ? {
            zone: {
              center: 100,
            },
          }
        : null,
  };
  const indicators = {
    ema: {
      currentPrice: priceContext.analysisPrice,
    },
    atr: {
      atr:
        input.riskMode === "UNAVAILABLE" ||
        priceContext.analysisPrice === null
          ? null
          : 2,
    },
    adx: {
      adx: trend.success ? 28 : null,
    },
    rvol: {
      rvol,
    },
    volumeSpike: {
      success: true,
      volumeSpikeDetected: rvol >= 1.5,
    },
  };
  const warnings = [];

  if (input.marketMode === "FALLBACK") {
    warnings.push(
      "Live market data is unavailable. Historical data may be used as a fallback."
    );
  }

  if (input.historyMode === "INSUFFICIENT") {
    warnings.push("Historical data contains fewer than 50 bars.");
  } else if (input.historyMode === "UNAVAILABLE") {
    warnings.push("Historical OHLCV data is unavailable.");
  }

  if (trend.status !== "COMPLETE") {
    warnings.push(
      `Technical trend evidence is ${trend.status.toLowerCase()}.`
    );
  }

  if (input.structureDegraded) {
    warnings.push(
      "Support & Resistance: No confirmed swing levels were detected."
    );
  }

  if (
    input.shariahMode === "UNAVAILABLE" ||
    input.shariahMode === "STALE"
  ) {
    warnings.push("AAOIFI evidence requires review.");
  }

  const dataQuality = {
    status:
      input.historyMode === "UNAVAILABLE"
        ? "Unavailable"
        : warnings.length > 0
          ? "Degraded"
          : "Good",
    warnings,
  };
  const metadata = buildAnalysisMetadata({
    symbol: input.symbol,
    generatedAt,
    market,
    history,
    priceContext,
    fundamentals,
    shariah,
    dataQuality,
  });
  const invalidation = buildThesisInvalidation({
    generatedAt,
    market,
    history,
    priceContext,
    shariah,
    confluence,
    indicators,
    agreement,
  });
  const risk = analyzeRisk({
    success: input.riskMode !== "UNAVAILABLE",
    symbol: input.symbol,
    market,
    indicators,
    trend,
    agreement,
  });

  return {
    overview: {
      state: metadata.state,
      reviewRequired: metadata.reviewRequired,
      evidencePercent: metadata.evidenceCompleteness.percent,
      historyState: metadata.sources.history.state,
    },
    technical: {
      status: trend.status,
      invalidationStatus:
        invalidation.evidence.technical.status,
    },
    fundamentals: {
      status: fundamentals.status,
    },
    risk: {
      status: risk.success ? "AVAILABLE" : "UNAVAILABLE",
    },
    shariah: {
      state: metadata.sources.shariah.state,
      status: shariah.summary.status,
    },
    thesis: {
      status: invalidation.status,
      fundamentalStatus:
        invalidation.evidence.fundamental.status,
    },
  };
}

const matrix = [
  {
    input: { symbol: "AAPL" },
    expected: {
      overview: ["delayed", false, 100, "fresh"],
      technical: ["COMPLETE", "intact"],
      fundamentals: "PARTIAL",
      risk: "AVAILABLE",
      shariah: ["fresh", "COMPLIANT"],
      thesis: ["intact", "intact"],
    },
  },
  {
    input: {
      symbol: "TSLA",
      technicalMode: "BEARISH",
      close: 105,
      rvol: 1.8,
    },
    expected: {
      overview: ["delayed", false, 100, "fresh"],
      technical: ["COMPLETE", "violated"],
      fundamentals: "PARTIAL",
      risk: "AVAILABLE",
      shariah: ["fresh", "COMPLIANT"],
      thesis: ["violated", "intact"],
    },
  },
  {
    input: {
      symbol: "MSFT",
      technicalMode: "NEUTRAL",
    },
    expected: {
      overview: ["delayed", false, 100, "fresh"],
      technical: ["COMPLETE", "unknown"],
      fundamentals: "PARTIAL",
      risk: "AVAILABLE",
      shariah: ["fresh", "COMPLIANT"],
      thesis: ["unknown", "intact"],
    },
  },
  {
    input: {
      symbol: "NVDA",
      technicalMode: "BULLISH_PARTIAL",
    },
    expected: {
      overview: ["delayed", true, 100, "fresh"],
      technical: ["PARTIAL", "intact"],
      fundamentals: "PARTIAL",
      risk: "AVAILABLE",
      shariah: ["fresh", "COMPLIANT"],
      thesis: ["intact", "intact"],
    },
  },
  {
    input: {
      symbol: "AMD",
      technicalMode: "UNAVAILABLE",
      riskMode: "UNAVAILABLE",
    },
    expected: {
      overview: ["delayed", true, 100, "fresh"],
      technical: ["UNAVAILABLE", "unknown"],
      fundamentals: "PARTIAL",
      risk: "UNAVAILABLE",
      shariah: ["fresh", "COMPLIANT"],
      thesis: ["unknown", "intact"],
    },
  },
  {
    input: {
      symbol: "META",
      marketMode: "CACHED",
    },
    expected: {
      overview: ["cached", false, 100, "fresh"],
      technical: ["COMPLETE", "intact"],
      fundamentals: "PARTIAL",
      risk: "AVAILABLE",
      shariah: ["fresh", "COMPLIANT"],
      thesis: ["intact", "intact"],
    },
  },
  {
    input: {
      symbol: "AMZN",
      historyMode: "CACHED",
    },
    expected: {
      overview: ["delayed", false, 100, "cached"],
      technical: ["COMPLETE", "intact"],
      fundamentals: "PARTIAL",
      risk: "AVAILABLE",
      shariah: ["fresh", "COMPLIANT"],
      thesis: ["intact", "intact"],
    },
  },
  {
    input: {
      symbol: "GOOGL",
      marketMode: "FALLBACK",
    },
    expected: {
      overview: ["fallback", true, 100, "fresh"],
      technical: ["COMPLETE", "intact"],
      fundamentals: "UNAVAILABLE",
      risk: "AVAILABLE",
      shariah: ["fresh", "COMPLIANT"],
      thesis: ["intact", "intact"],
    },
  },
  {
    input: {
      symbol: "NFLX",
      profileMode: "UNAVAILABLE",
    },
    expected: {
      overview: ["delayed", false, 100, "fresh"],
      technical: ["COMPLETE", "intact"],
      fundamentals: "UNAVAILABLE",
      risk: "AVAILABLE",
      shariah: ["fresh", "COMPLIANT"],
      thesis: ["intact", "intact"],
    },
  },
  {
    input: {
      symbol: "ORCL",
      historyMode: "INSUFFICIENT",
    },
    expected: {
      overview: ["delayed", true, 67, "partial"],
      technical: ["COMPLETE", "intact"],
      fundamentals: "PARTIAL",
      risk: "AVAILABLE",
      shariah: ["fresh", "COMPLIANT"],
      thesis: ["intact", "intact"],
    },
  },
  {
    input: {
      symbol: "IBM",
      historyMode: "UNAVAILABLE",
      technicalMode: "UNAVAILABLE",
      riskMode: "UNAVAILABLE",
    },
    expected: {
      overview: ["delayed", true, 67, "unavailable"],
      technical: ["UNAVAILABLE", "unknown"],
      fundamentals: "PARTIAL",
      risk: "UNAVAILABLE",
      shariah: ["fresh", "COMPLIANT"],
      thesis: ["unknown", "intact"],
    },
  },
  {
    input: {
      symbol: "NVS",
      shariahMode: "UNAVAILABLE",
    },
    expected: {
      overview: ["delayed", true, 67, "fresh"],
      technical: ["COMPLETE", "intact"],
      fundamentals: "PARTIAL",
      risk: "AVAILABLE",
      shariah: ["unavailable", "UNKNOWN"],
      thesis: ["unknown", "unknown"],
    },
  },
  {
    input: {
      symbol: "INTC",
      shariahMode: "STALE",
    },
    expected: {
      overview: ["delayed", true, 67, "fresh"],
      technical: ["COMPLETE", "intact"],
      fundamentals: "PARTIAL",
      risk: "AVAILABLE",
      shariah: ["stale", "COMPLIANT"],
      thesis: ["unknown", "unknown"],
    },
  },
  {
    input: {
      symbol: "JPM",
      shariahMode: "NON_COMPLIANT",
    },
    expected: {
      overview: ["delayed", false, 100, "fresh"],
      technical: ["COMPLETE", "intact"],
      fundamentals: "PARTIAL",
      risk: "AVAILABLE",
      shariah: ["fresh", "NON_COMPLIANT"],
      thesis: ["violated", "violated"],
    },
  },
  {
    input: {
      symbol: "XOM",
      shariahMode: "CONFLICT",
    },
    expected: {
      overview: ["delayed", false, 100, "fresh"],
      technical: ["COMPLETE", "intact"],
      fundamentals: "PARTIAL",
      risk: "AVAILABLE",
      shariah: ["fresh", "NON_COMPLIANT"],
      thesis: ["violated", "violated"],
    },
  },
  {
    input: {
      symbol: "COST",
      shariahMode: "CACHED",
    },
    expected: {
      overview: ["delayed", false, 100, "fresh"],
      technical: ["COMPLETE", "intact"],
      fundamentals: "PARTIAL",
      risk: "AVAILABLE",
      shariah: ["cached", "COMPLIANT"],
      thesis: ["intact", "intact"],
    },
  },
  {
    input: {
      symbol: "INVALID",
      marketMode: "UNAVAILABLE",
      historyMode: "UNAVAILABLE",
      profileMode: "UNAVAILABLE",
      technicalMode: "UNAVAILABLE",
      riskMode: "UNAVAILABLE",
      shariahMode: "UNAVAILABLE",
    },
    expected: {
      overview: ["unavailable", true, 0, "unavailable"],
      technical: ["UNAVAILABLE", "unknown"],
      fundamentals: "UNAVAILABLE",
      risk: "UNAVAILABLE",
      shariah: ["unavailable", "UNKNOWN"],
      thesis: ["unknown", "unknown"],
    },
  },
  {
    input: {
      symbol: "PFE",
      structureDegraded: true,
    },
    expected: {
      overview: ["delayed", true, 100, "fresh"],
      technical: ["COMPLETE", "intact"],
      fundamentals: "PARTIAL",
      risk: "AVAILABLE",
      shariah: ["fresh", "COMPLIANT"],
      thesis: ["intact", "intact"],
    },
  },
];

assert.equal(matrix.length, 18);
assert.equal(
  new Set(matrix.map(({ input }) => input.symbol)).size,
  matrix.length,
  "Every reliability scenario must use a unique representative symbol."
);

for (const { input, expected } of matrix) {
  const result = buildScenario(input);
  const prefix = `${input.symbol}:`;

  assert.deepEqual(
    [
      result.overview.state,
      result.overview.reviewRequired,
      result.overview.evidencePercent,
      result.overview.historyState,
    ],
    expected.overview,
    `${prefix} overview truth state`
  );
  assert.deepEqual(
    [
      result.technical.status,
      result.technical.invalidationStatus,
    ],
    expected.technical,
    `${prefix} technical evidence state`
  );
  assert.equal(
    result.fundamentals.status,
    expected.fundamentals,
    `${prefix} fundamentals coverage state`
  );
  assert.equal(
    result.risk.status,
    expected.risk,
    `${prefix} risk availability state`
  );
  assert.deepEqual(
    [
      result.shariah.state,
      result.shariah.status,
    ],
    expected.shariah,
    `${prefix} free AAOIFI workspace state`
  );
  assert.deepEqual(
    [
      result.thesis.status,
      result.thesis.fundamentalStatus,
    ],
    expected.thesis,
    `${prefix} thesis invalidation state`
  );
}

const frontendRoot = path.resolve(__dirname, "../../frontend/src");
const workspaceIdsSource = fs.readFileSync(
  path.join(
    frontendRoot,
    "components/analysis/workspaces.ts"
  ),
  "utf8"
);
const analysisPageSource = fs.readFileSync(
  path.join(frontendRoot, "pages/AnalysisPage.tsx"),
  "utf8"
);
const expectedWorkspaceIds = [
  "overview",
  "technical",
  "fundamentals",
  "risk",
  "shariah",
  "thesis",
];

for (const workspaceId of expectedWorkspaceIds) {
  assert.match(
    workspaceIdsSource,
    new RegExp(`["']${workspaceId}["']`),
    `The ${workspaceId} workspace must remain registered.`
  );
}

const shariahWorkspaceStart =
  analysisPageSource.indexOf("    shariah: (");
const thesisWorkspaceStart =
  analysisPageSource.indexOf("    thesis:");

assert.ok(
  shariahWorkspaceStart >= 0 &&
    thesisWorkspaceStart > shariahWorkspaceStart,
  "The Shariah workspace must remain directly addressable."
);
assert.doesNotMatch(
  analysisPageSource.slice(
    shariahWorkspaceStart,
    thesisWorkspaceStart
  ),
  /ProFeatureWrapper/,
  "Free Shariah screening must never be wrapped in a Pro feature gate."
);

console.log(
  `Multi-symbol reliability matrix passed (${matrix.length} scenarios × 6 workspaces; free Shariah access verified).`
);
