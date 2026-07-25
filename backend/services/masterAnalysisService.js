const crypto = require("crypto");

const {
  getMarketData,
  getHistory
} = require("./marketEngine");

const { getRSI } = require("./rsiService");
const { getEMA } = require("./emaService");
const { getSMA } = require("./smaService");
const { getMACD } = require("./macdService");
const { getBollinger } = require("./bollingerService");
const { getATR } = require("./atrService");
const { getADX } = require("./adxService");
const { getOBV } = require("./obvService");
const { getRVOL } = require("./rvolService");
const { getVolumeSpike } = require("./volumeSpikeService");
const { getCandlestick } = require("./candlestickService");

const {
  getShariahCompliance
} = require(
  "./shariahComplianceService"
);

const {
  buildAnalysisMetadata,
  buildThesisInvalidation
} = require(
  "./analysisTrustService"
);

const {
  analyzeSupportResistance
} = require(
  "../analysis/structure/supportResistanceEngine"
);

const {
  analyzeFibonacci
} = require(
  "../analysis/structure/fibonacciEngine"
);

const {
  analyzeConfluence
} = require(
  "../analysis/confluence/confluenceEngine"
);

const {
  analyzeTrend
} = require(
  "../analysis/trend/trendEngine"
);

const {
  analyzeAgreement
} = require(
  "../analysis/agreement/agreementEngine"
);

const {
  analyzeExplanation
} = require(
  "../analysis/explanation/explanationEngine"
);

const {
  analyzeRisk
} = require(
  "../analysis/risk/riskEngine"
);

// ==================================================
// API Configuration
// ==================================================

const API_VERSION =
  process.env.API_VERSION ||
  "1.0.0";

// ==================================================
// Symbol Validation
// ==================================================

function normalizeSymbol(symbol) {
  return String(symbol || "")
    .trim()
    .toUpperCase();
}

// ==================================================
// Numeric Helpers
// ==================================================

function toFiniteNumber(
  value,
  fallback = null
) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

// ==================================================
// Request ID
// ==================================================

function createRequestId() {
  if (
    typeof crypto.randomUUID ===
    "function"
  ) {
    return crypto.randomUUID();
  }

  return crypto
    .randomBytes(16)
    .toString("hex");
}

// ==================================================
// Shared History Summary
// ==================================================

function buildSharedHistorySummary(
  history,
  normalizedSymbol
) {
  const bars =
    Array.isArray(history?.bars)
      ? history.bars
      : [];

  const closePrices =
    Array.isArray(history?.data?.c)
      ? history.data.c
      : [];

  let latestHistoricalClose = null;

  if (bars.length > 0) {
    latestHistoricalClose =
      Number(
        bars[
          bars.length - 1
        ]?.close
      );
  } else if (
    closePrices.length > 0
  ) {
    latestHistoricalClose =
      Number(
        closePrices[
          closePrices.length - 1
        ]
      );
  }

  return {
    success: true,

    provider:
      history?.provider ||
      "TwelveData",

    symbol:
      normalizedSymbol,

    cache:
      history?.cache ||
      null,

    barCount:
      bars.length > 0
        ? bars.length
        : closePrices.length,

    latestHistoricalClose:
      Number.isFinite(
        latestHistoricalClose
      )
        ? latestHistoricalClose
        : null,

    dataQuality:
      history?.dataQuality ||
      null,

    performance:
      history?.performance ||
      null
  };
}

// ==================================================
// Price Context
// ==================================================

function buildPriceContext(
  market,
  sharedHistory
) {
  const livePrice =
    Number(
      market?.data?.price
    );

  const historicalClose =
    Number(
      sharedHistory
        ?.latestHistoricalClose
    );

  const livePriceAvailable =
    Number.isFinite(livePrice);

  const historicalCloseAvailable =
    Number.isFinite(
      historicalClose
    );

  return {
    livePrice:
      livePriceAvailable
        ? livePrice
        : null,

    latestHistoricalClose:
      historicalCloseAvailable
        ? historicalClose
        : null,

    livePriceAvailable,

    historicalCloseAvailable,

    pricesMatch:
      livePriceAvailable &&
      historicalCloseAvailable
        ? livePrice ===
          historicalClose
        : null,

    analysisPrice:
      livePriceAvailable
        ? livePrice
        : historicalCloseAvailable
          ? historicalClose
          : null,

    analysisPriceSource:
      livePriceAvailable
        ? "Live Market Price"
        : historicalCloseAvailable
          ? "Latest Historical Close"
          : null,

    note:
      "Live price may differ from the latest completed daily historical close during an active market session."
  };
}

// ==================================================
// Truthful Fundamentals Coverage
// ==================================================

function buildFundamentalsSnapshot({
  market,
  generatedAt
}) {
  const profile =
    market?.companyProfile &&
    typeof market.companyProfile ===
      "object"
      ? market.companyProfile
      : null;

  const profileAvailable =
    market?.success === true &&
    profile !== null;

  return {
    success: profileAvailable,

    status:
      profileAvailable
        ? "PARTIAL"
        : "UNAVAILABLE",

    provider:
      profileAvailable
        ? profile.source ||
          "Finnhub Company Profile"
        : null,

    asOf:
      profileAvailable
        ? profile.retrievedAt ||
          generatedAt
        : null,

    companyProfile:
      profileAvailable
        ? {
            name:
              profile.name ||
              market?.data?.company ||
              null,
            ticker:
              profile.ticker ||
              market?.symbol ||
              null,
            country:
              profile.country || null,
            currency:
              profile.currency ||
              market?.data?.currency ||
              null,
            exchange:
              profile.exchange ||
              market?.data?.exchange ||
              null,
            industry:
              profile.industry || null,
            ipoDate:
              profile.ipoDate || null,
            website:
              profile.website || null,
            logo:
              profile.logo || null
          }
        : null,

    coverage: {
      companyProfile:
        profileAvailable
          ? "AVAILABLE"
          : "UNAVAILABLE",
      financialStatements:
        "UNAVAILABLE",
      valuationAndPeers:
        "UNAVAILABLE",
      earningsAndEstimates:
        "UNAVAILABLE",
      filingsAndOwnership:
        "UNAVAILABLE"
    },

    unavailableSections: [
      "financialStatements",
      "valuationAndPeers",
      "earningsAndEstimates",
      "filingsAndOwnership"
    ],

    limitations: [
      ...(
        Array.isArray(
          market?.limitations
        )
          ? market.limitations
          : []
      ),
      "Verified financial statements, valuation multiples, earnings estimates, filings, and ownership data are not connected yet."
    ]
  };
}

// ==================================================
// Shared-OHLCV Status
// ==================================================

function buildRefactorStatus() {
  return {
    sharedOHLCVEnabled: true,

    sharedOHLCVComplete: true,

    sharedOHLCVConsumers: [
      "RSI",
      "EMA",
      "SMA",
      "MACD",
      "Bollinger Bands",
      "ATR",
      "ADX",
      "OBV",
      "RVOL",
      "Volume Spike",
      "Candlestick",
      "Support & Resistance",
      "Fibonacci",
      "Confluence"
    ],

    pendingSharedOHLCVConsumers: []
  };
}

// ==================================================
// Structure Warning Helper
// ==================================================

function addStructureWarnings({
  warnings,
  name,
  result
}) {
  if (!result) {
    warnings.push(
      `${name}: No result was returned.`
    );

    return;
  }

  if (
    result.success !== true
  ) {
    warnings.push(
      `${name}: ${
        result.error ||
        "Analysis failed."
      }`
    );
  }

  if (
    Array.isArray(
      result.warnings
    )
  ) {
    result.warnings.forEach(
      (warning) => {
        warnings.push(
          `${name}: ${warning}`
        );
      }
    );
  }
}

// ==================================================
// Data Quality
// ==================================================

function buildDataQuality({
  market,
  history,
  indicators,
  failedIndicators = [],
  supportResistance = null,
  fibonacci = null,
  shariah = null
}) {
  const warnings = [];

  const liveDataAvailable =
    market?.success === true &&
    Number.isFinite(
      Number(
        market?.data?.price
      )
    );

  const historicalDataAvailable =
    history?.success === true &&
    (
      Array.isArray(
        history?.bars
      ) ||
      Array.isArray(
        history?.data?.c
      )
    );

  const historicalBars =
    Array.isArray(
      history?.bars
    )
      ? history.bars.length
      : Array.isArray(
          history?.data?.c
        )
        ? history.data.c.length
        : 0;

  const indicatorEntries =
    indicators &&
    typeof indicators ===
      "object"
      ? Object.values(
          indicators
        )
      : [];

  const successfulIndicators =
    indicatorEntries.filter(
      (indicator) =>
        indicator?.success ===
        true
    ).length;

  const totalIndicators =
    indicatorEntries.length;

  if (!liveDataAvailable) {
    warnings.push(
      "Live market data is unavailable. Historical data may be used as a fallback."
    );
  }

  if (!historicalDataAvailable) {
    warnings.push(
      "Historical OHLCV data is unavailable."
    );
  }

  if (
    historicalBars > 0 &&
    historicalBars < 50
  ) {
    warnings.push(
      "Historical data contains fewer than 50 bars."
    );
  }

  if (
    Array.isArray(
      history?.dataQuality
        ?.warnings
    )
  ) {
    warnings.push(
      ...history.dataQuality
        .warnings
    );
  }

  failedIndicators.forEach(
    (failure) => {
      warnings.push(
        `${failure.indicator}: ${failure.error}`
      );
    }
  );

  addStructureWarnings({
    warnings,
    name:
      "Support & Resistance",
    result:
      supportResistance
  });

  addStructureWarnings({
    warnings,
    name:
      "Fibonacci",
    result:
      fibonacci
  });

  const shariahAvailable =
    shariah?.success === true;

  const shariahStatus =
    shariah?.summary?.status ||
    "UNKNOWN";

  if (!shariahAvailable) {
    warnings.push(
      `Shariah Compliance: ${
        shariah?.providerError?.message ||
        shariah?.summary?.explanation ||
        "Screening is unavailable."
      }`
    );
  } else if (
    shariahStatus === "UNKNOWN"
  ) {
    warnings.push(
      "Shariah Compliance: The provider returned an UNKNOWN screening status."
    );
  }

  const supportResistanceAvailable =
    supportResistance?.success ===
    true;

  const fibonacciAvailable =
    fibonacci?.success === true;

  let status = "Good";

  if (
    !historicalDataAvailable ||
    successfulIndicators === 0
  ) {
    status = "Unavailable";
  } else if (
    warnings.length > 0 ||
    successfulIndicators <
      totalIndicators ||
    !supportResistanceAvailable ||
    !fibonacciAvailable ||
    !shariahAvailable ||
    shariahStatus === "UNKNOWN"
  ) {
    status = "Degraded";
  }

  return {
    status,

    liveDataAvailable,

    historicalDataAvailable,

    historicalBars,

    latestHistoricalDate:
      history?.dataQuality
        ?.latestHistoricalDate ||
      null,

    oldestHistoricalDate:
      history?.dataQuality
        ?.oldestHistoricalDate ||
      null,

    indicators: {
      successful:
        successfulIndicators,

      failed:
        failedIndicators.length,

      total:
        totalIndicators
    },

    structure: {
      supportResistanceAvailable,

      fibonacciAvailable,

      successful:
        [
          supportResistanceAvailable,
          fibonacciAvailable
        ].filter(Boolean).length,

      failed:
        [
          supportResistanceAvailable,
          fibonacciAvailable
        ].filter(
          (available) =>
            !available
        ).length,

      total: 2,

      supportZones:
        Array.isArray(
          supportResistance
            ?.support
        )
          ? supportResistance
              .support.length
          : 0,

      resistanceZones:
        Array.isArray(
          supportResistance
            ?.resistance
        )
          ? supportResistance
              .resistance.length
          : 0,

      fibonacciLevels:
        Array.isArray(
          fibonacci?.levels
        )
          ? fibonacci.levels.length
          : 0
    },

    shariah: {
      available:
        shariahAvailable,

      status:
        shariahStatus,

      confidence:
        shariah?.summary
          ?.confidence ||
        "UNKNOWN",

      provider:
        shariah?.provider?.name ||
        null,

      lastCheckedAt:
        shariah?.verification
          ?.lastCheckedAt ||
        null,

      fromCache:
        shariah?.metadata
          ?.providerMetadata
          ?.fromCache === true
    },

    providers: {
      live:
        market?.provider ||
        "Finnhub",

      historical:
        history?.provider ||
        "TwelveData",

      structure:
        "AzaLens",

      shariah:
        shariah?.provider?.name ||
        "Halal Terminal"
    },

    cache: {
      status:
        history?.cache ||
        null,

      hit:
        history?.performance
          ?.cacheHit === true
    },

    warnings:
      [...new Set(warnings)]
  };
}

// ==================================================
// Response Meta
// ==================================================

function buildMeta({
  requestId,
  symbol,
  generatedAt
}) {
  return {
    requestId,

    symbol,

    generatedAt,

    environment:
      process.env.NODE_ENV ||
      "development"
  };
}

// ==================================================
// Error Response
// ==================================================

function buildErrorResponse({
  requestId,
  symbol,
  generatedAt,
  error,
  details = null,
  dataQuality = null,
  performance = null,
  data = null
}) {
  return {
    success: false,

    apiVersion:
      API_VERSION,

    meta:
      buildMeta({
        requestId,
        symbol,
        generatedAt
      }),

    error,

    details,

    dataQuality:
      dataQuality || {
        status:
          "Unavailable",

        warnings: [
          error
        ]
      },

    performance:
      performance || {},

    data:
      data || null
  };
}

// ==================================================
// Performance Bottleneck
// ==================================================

function findPerformanceBottleneck({
  marketMs,
  historyMs,
  indicatorMs,
  structureMs,
  analysisMs,
  shariahMs
}) {
  const stages = [
    {
      name:
        "Live Market Data",

      durationMs:
        toFiniteNumber(
          marketMs,
          0
        )
    },
    {
      name:
        "Historical Data",

      durationMs:
        toFiniteNumber(
          historyMs,
          0
        )
    },
    {
      name:
        "Indicators",

      durationMs:
        toFiniteNumber(
          indicatorMs,
          0
        )
    },
    {
      name:
        "Market Structure",

      durationMs:
        toFiniteNumber(
          structureMs,
          0
        )
    },
    {
      name:
        "Higher-Level Analysis",

      durationMs:
        toFiniteNumber(
          analysisMs,
          0
        )
    },
    {
      name:
        "Shariah Compliance",

      durationMs:
        toFiniteNumber(
          shariahMs,
          0
        )
    }
  ];

  stages.sort(
    (first, second) =>
      second.durationMs -
      first.durationMs
  );

  return stages[0]?.name || null;
}

// ==================================================
// Safe Structure Engine Runner
// ==================================================

function runStructureEngine({
  requestId,
  name,
  symbol,
  analysisFunction,
  input
}) {
  const startedAt =
    Date.now();

  try {
    const result =
      analysisFunction(input);

    return {
      result,

      durationMs:
        Date.now() -
        startedAt
    };
  } catch (error) {
    console.error(
      `[${requestId}] ${name} Error:`,
      error
    );

    return {
      result: {
        success: false,

        provider:
          "AzaLens",

        symbol,

        error:
          `Unable to complete ${name.toLowerCase()} analysis.`,

        details:
          error.message,

        dataSource:
          "Shared OHLCV",

        performance: {
          durationMs:
            Date.now() -
            startedAt
        }
      },

      durationMs:
        Date.now() -
        startedAt
    };
  }
}

// ==================================================
// Safe Shariah Compliance Runner
// ==================================================

async function runShariahCompliance({
  requestId,
  symbol
}) {
  const startedAt = Date.now();

  try {
    const result =
      await getShariahCompliance(
        symbol
      );

    return {
      result,

      durationMs:
        Date.now() -
        startedAt
    };
  } catch (error) {
    console.error(
      `[${requestId}] Shariah Compliance Error:`,
      error
    );

    return {
      result: {
        success: false,

        symbol,

        module: {
          id:
            "shariah_compliance",

          name:
            "Shariah Compliance",

          version:
            "0.5.0"
        },

        summary: {
          headline:
            `Shariah compliance could not be verified for ${symbol}.`,

          status:
            "UNKNOWN",

          confidence:
            "UNKNOWN",

          explanation:
            error.message ||
            "The Shariah screening service failed.",

          purificationRatePercent:
            null,

          purificationRateFormatted:
            null,

          methodologyId:
            "AAOIFI",

          methodologyName:
            "AAOIFI"
        },

        company: null,

        primaryMethodology: {
          id:
            "AAOIFI",

          name:
            "AAOIFI",

          status:
            "UNKNOWN",

          isCompliant:
            null,

          verified:
            null,

          disposition:
            null,

          basis:
            null,

          alternateBasis:
            null,

          basesDisagree:
            null,

          reason:
            null
        },

        methodologies: {
          primary:
            "AAOIFI",

          results: {
            AAOIFI: {
              id:
                "AAOIFI",

              name:
                "AAOIFI",

              status:
                "UNKNOWN",

              isCompliant:
                null,

              verified:
                null,

              disposition:
                null,

              basis:
                null,

              alternateBasis:
                null,

              basesDisagree:
                null,

              reason:
                null
            }
          }
        },

        businessActivity: {
          status: "UNKNOWN",
          passed: null,
          reason: null,
          segments: [],
          revenueRatios: null
        },

        financialScreen: {
          status: "UNKNOWN",
          passed: null,
          ratios: {},
          financials: null
        },

        verification: null,

        disclaimers: [
          {
            id:
              "AzaLens-shariah",

            severity:
              "religious",

            text:
              "AzaLens reports automated screening data and does not issue a fatwa or scholarly attestation.",

            url: null
          }
        ],

        provider: {
          id:
            "halal_terminal",

          name:
            "Halal Terminal"
        },

        providerError: {
          code:
            "SHARIAH_SERVICE_ERROR",

          message:
            error.message ||
            "The Shariah screening service failed."
        },

        metadata: {
          generatedAt:
            new Date()
              .toISOString(),

          providerMetadata:
            null
        }
      },

      durationMs:
        Date.now() -
        startedAt
    };
  }
}

// ==================================================
// Master Analysis Service
// ==================================================

async function getMasterAnalysis(
  symbol
) {
  const normalizedSymbol =
    normalizeSymbol(symbol);

  const requestId =
    createRequestId();

  const generatedAt =
    new Date().toISOString();

  const startedAt =
    Date.now();

  if (!normalizedSymbol) {
    return buildErrorResponse({
      requestId,

      symbol:
        normalizedSymbol,

      generatedAt,

      error:
        "A valid ticker symbol is required.",

      performance: {
        totalMs:
          Date.now() -
          startedAt
      }
    });
  }

  try {
    // ==============================================
    // Shariah Compliance (Parallel Background Task)
    // ==============================================

    const shariahRunPromise =
      runShariahCompliance({
        requestId,
        symbol:
          normalizedSymbol
      });

    // ==============================================
    // Live Market Data
    // ==============================================

    const marketStartedAt =
      Date.now();

    const market =
      await getMarketData(
        normalizedSymbol
      );

    const marketDurationMs =
      Date.now() -
      marketStartedAt;

    // ==============================================
    // Shared Historical OHLCV
    // ==============================================

    const historyStartedAt =
      Date.now();

    const history =
      await getHistory(
        normalizedSymbol
      );

    const historyDurationMs =
      Date.now() -
      historyStartedAt;

    if (
      !history ||
      history.success !== true
    ) {
      const shariahRun =
        await shariahRunPromise;

      const shariah =
        shariahRun.result;

      const performance = {
        totalMs:
          Date.now() -
          startedAt,

        marketMs:
          marketDurationMs,

        historyMs:
          historyDurationMs,

        indicatorMs: 0,

        structureMs: 0,

        supportResistanceMs: 0,

        fibonacciMs: 0,

        confluenceMs: 0,

        analysisMs: 0,

        shariahMs:
          shariahRun.durationMs,

        cacheHit: false
      };

      return buildErrorResponse({
        requestId,

        symbol:
          normalizedSymbol,

        generatedAt,

        error:
          "Unable to fetch shared historical OHLCV data.",

        details:
          history?.error ||
          null,

        performance,

        data: {
          market,

          history,

          shariah,

          refactorStatus:
            buildRefactorStatus()
        }
      });
    }

    const sharedHistory =
      buildSharedHistorySummary(
        history,
        normalizedSymbol
      );

    const priceContext =
      buildPriceContext(
        market,
        sharedHistory
      );

    const fundamentals =
      buildFundamentalsSnapshot({
        market,
        generatedAt
      });

    // ==============================================
    // Indicator Calculations
    // ==============================================

    const indicatorsStartedAt =
      Date.now();

    const rsi =
      await getRSI(
        normalizedSymbol,
        history
      );

    const ema =
      await getEMA(
        normalizedSymbol,
        history
      );

    const sma =
      await getSMA(
        normalizedSymbol,
        history
      );

    const macd =
      await getMACD(
        normalizedSymbol,
        history
      );

    const bollinger =
      await getBollinger(
        normalizedSymbol,
        history
      );

    const atr =
      await getATR(
        normalizedSymbol,
        history
      );

    const adx =
      await getADX(
        normalizedSymbol,
        history
      );

    const obv =
      await getOBV(
        normalizedSymbol,
        history
      );

    const rvol =
      await getRVOL(
        normalizedSymbol,
        history
      );

    const volumeSpike =
      await getVolumeSpike(
        normalizedSymbol,
        history
      );

    const candlestick =
      await getCandlestick(
        normalizedSymbol,
        history
      );

    const indicatorDurationMs =
      Date.now() -
      indicatorsStartedAt;

    const indicators = {
      rsi,
      ema,
      sma,
      macd,
      bollinger,
      atr,
      adx,
      obv,
      rvol,
      volumeSpike,
      candlestick
    };

    // ==============================================
    // Failed Indicators
    // ==============================================

    const failedIndicators =
      Object.entries(indicators)
        .filter(
          ([, result]) =>
            !result ||
            result.success !==
              true
        )
        .map(
          ([name, result]) => ({
            indicator:
              name,

            error:
              result?.error ||
              "Indicator calculation failed."
          })
        );

    if (
      failedIndicators.length >
      0
    ) {
      const shariahRun =
        await shariahRunPromise;

      const shariah =
        shariahRun.result;

      const performance = {
        totalMs:
          Date.now() -
          startedAt,

        marketMs:
          marketDurationMs,

        historyMs:
          historyDurationMs,

        indicatorMs:
          indicatorDurationMs,

        structureMs: 0,

        supportResistanceMs: 0,

        fibonacciMs: 0,

        confluenceMs: 0,

        analysisMs: 0,

        shariahMs:
          shariahRun.durationMs,

        cacheHit:
          history?.performance
            ?.cacheHit === true
      };

      return buildErrorResponse({
        requestId,

        symbol:
          normalizedSymbol,

        generatedAt,

        error:
          "Unable to complete all indicator calculations.",

        details:
          failedIndicators,

        dataQuality:
          buildDataQuality({
            market,
            history,
            indicators,
            failedIndicators,
            supportResistance:
              null,
            fibonacci:
              null,
            shariah
          }),

        performance,

        data: {
          market,

          priceContext,

          sharedHistory,

          indicators,

          shariah,

          refactorStatus:
            buildRefactorStatus()
        }
      });
    }

    // ==============================================
    // Market Structure Analysis
    // ==============================================

    const structureStartedAt =
      Date.now();

    const sharedBars =
      Array.isArray(
        history?.bars
      )
        ? history.bars
        : [];

    const supportResistanceRun =
      runStructureEngine({
        requestId,

        name:
          "Support & Resistance",

        symbol:
          normalizedSymbol,

        analysisFunction:
          analyzeSupportResistance,

        input: {
          symbol:
            normalizedSymbol,

          bars:
            sharedBars,

          currentPrice:
            priceContext
              .analysisPrice,

          options: {
            pivotWindow: 5,

            mergeThresholdPercent:
              1,

            maximumZonesPerSide:
              5,

            minimumBars:
              20,

            minimumTouches:
              1
          }
        }
      });

    const supportResistance =
      supportResistanceRun.result;

    const fibonacciRun =
      runStructureEngine({
        requestId,

        name:
          "Fibonacci",

        symbol:
          normalizedSymbol,

        analysisFunction:
          analyzeFibonacci,

        input: {
          symbol:
            normalizedSymbol,

          history,

          bars:
            sharedBars,

          currentPrice:
            priceContext
              .analysisPrice,

          options: {
            pivotWindow: 5,

            lookbackBars: 100,

            minimumBars: 20,

            proximityThresholdPercent:
              1
          }
        }
      });

    const fibonacci =
      fibonacciRun.result;

    const structureDurationMs =
      Date.now() -
      structureStartedAt;

    const marketStructure = {
      success:
        supportResistance
          ?.success === true &&
        fibonacci
          ?.success === true,

      partialSuccess:
        supportResistance
          ?.success === true ||
        fibonacci
          ?.success === true,

      symbol:
        normalizedSymbol,

      provider:
        "AzaLens",

      supportResistance,

      fibonacci,

      performance: {
        totalMs:
          structureDurationMs,

        supportResistanceMs:
          supportResistanceRun
            .durationMs,

        fibonacciMs:
          fibonacciRun
            .durationMs
      }
    };

    // ==============================================
    // Confluence Analysis
    // ==============================================

    const confluenceRun =
      runStructureEngine({
        requestId,

        name:
          "Confluence",

        symbol:
          normalizedSymbol,

        analysisFunction:
          analyzeConfluence,

        input: {
          symbol:
            normalizedSymbol,

          currentPrice:
            priceContext
              .analysisPrice,

          marketStructure,

          indicators,

          options: {
            clusterThresholdPercent:
              1,

            maximumZones:
              10,

            minimumConfluenceScore:
              15,

            proximityThresholdPercent:
              2
          }
        }
      });

    const confluence =
      confluenceRun.result;

    // ==============================================
    // Shariah Compliance Result
    // ==============================================

    const shariahRun =
      await shariahRunPromise;

    const shariah =
      shariahRun.result;

    const dataQuality =
      buildDataQuality({
        market,
        history,
        indicators,
        failedIndicators,
        supportResistance,
        fibonacci,
        shariah
      });

    // ==============================================
    // Higher-Level Analysis
    // ==============================================

    const analysisStartedAt =
      Date.now();

    const trendResult =
      analyzeTrend(
        ema.signal,
        sma.signal,
        macd.signal,
        adx.signal
      );

    const trend = {
      success: true,

      provider:
        ema.provider ||
        "TwelveData",

      symbol:
        normalizedSymbol,

      ...trendResult
    };

    const agreementResult =
      analyzeAgreement(
        indicators
      );

    const agreement = {
      success: true,

      provider:
        ema.provider ||
        "TwelveData",

      symbol:
        normalizedSymbol,

      ...agreementResult
    };

    const internalAnalysis = {
      success: true,

      symbol:
        normalizedSymbol,

      provider:
        "AzaLens",

      generatedAt,

      market,

      priceContext,

      sharedHistory,

      indicators,

      marketStructure,

      supportResistance,

      fibonacci,

      confluence,

      trend,

      agreement,

      shariah
    };

    const explanation =
      analyzeExplanation(
        internalAnalysis
      );

    const risk =
      analyzeRisk(
        internalAnalysis
      );

    const metadata =
      buildAnalysisMetadata({
        symbol:
          normalizedSymbol,

        generatedAt,

        market,

        history,

        priceContext,

        fundamentals,

        shariah,

        dataQuality
      });

    const thesisInvalidation =
      buildThesisInvalidation({
        generatedAt,

        market,

        priceContext,

        history,

        agreement,

        confluence,

        indicators,

        shariah
      });

    const analysisDurationMs =
      Date.now() -
      analysisStartedAt;

    // ==============================================
    // Performance
    // ==============================================

    const performance = {
      totalMs:
        Date.now() -
        startedAt,

      marketMs:
        marketDurationMs,

      historyMs:
        historyDurationMs,

      indicatorMs:
        indicatorDurationMs,

      structureMs:
        structureDurationMs,

      supportResistanceMs:
        supportResistanceRun
          .durationMs,

      fibonacciMs:
        fibonacciRun
          .durationMs,

      confluenceMs:
        confluenceRun
          .durationMs,

      analysisMs:
        analysisDurationMs,

      shariahMs:
        shariahRun.durationMs,

      cacheHit:
        history?.performance
          ?.cacheHit === true,

      liveQuoteCacheHit:
        market?.performance
          ?.cacheHit === true,

      bottleneck:
        findPerformanceBottleneck({
          marketMs:
            marketDurationMs,

          historyMs:
            historyDurationMs,

          indicatorMs:
            indicatorDurationMs,

          structureMs:
            structureDurationMs,

          analysisMs:
            analysisDurationMs,

          shariahMs:
            shariahRun.durationMs
        })
    };

    // ==============================================
    // Final API Contract
    // ==============================================

    return {
      success: true,

      apiVersion:
        API_VERSION,

      meta:
        buildMeta({
          requestId,

          symbol:
            normalizedSymbol,

          generatedAt
        }),

      dataQuality,

      performance,

      data: {
        metadata,

        thesisInvalidation,

        market,

        priceContext,

        fundamentals,

        sharedHistory,

        indicators,

        marketStructure,

        confluence,

        trend,

        agreement,

        explanation,

        risk,

        shariah,

        refactorStatus:
          buildRefactorStatus()
      }
    };
  } catch (error) {
    console.error(
      `[${requestId}] Master Analysis Service Error:`,
      error
    );

    return buildErrorResponse({
      requestId,

      symbol:
        normalizedSymbol,

      generatedAt,

      error:
        "Unable to generate master analysis.",

      details:
        error.message,

      performance: {
        totalMs:
          Date.now() -
          startedAt
      }
    });
  }
}

// ==================================================
// Export Service
// ==================================================

module.exports = {
  getMasterAnalysis,
  buildFundamentalsSnapshot
};
