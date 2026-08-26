const {
  getCapabilityProviders,
  getCompanyProfile,
  getHistoricalCandles,
  getProviderLabel,
  getQuote
} = require("../providers/marketDataProvider");

const {
  buildCacheKey,
  getCache,
  setCache
} = require("../utils/cache");

const {
  recordProviderResult
} = require(
  "../utils/observability"
);

/*
  History caching is shared by both supported market-data providers. Keep the
  pending owner beside that shared cache boundary so identical requests can
  share one provider call while provider, symbol and interval remain part of
  the key. This only removes duplicate work; it never retries or falls back.
*/
const pendingHistoryRequests = new Map();

// ==================================================
// Helpers
// ==================================================

function normalizeSymbol(symbol) {
  return String(symbol || "")
    .trim()
    .toUpperCase();
}

/*
  The provenance a response should carry when the provider itself did not get
  far enough to say - an empty symbol, or a thrown error before any adapter
  ran. Previously these paths hardcoded "Finnhub" and "FINNHUB", which was
  correct only for as long as Finnhub was the quote provider.

  Deriving the label from the ACTIVE capability selection keeps it correct
  under any selection, and keeps it identical to the old literal under the
  accepted defaults - which is what makes this change invariant today.
*/
function capabilityProviderLabel(capability) {
  return getProviderLabel(
    getCapabilityProviders()[capability]
  );
}

function capabilityProviderSource(capability) {
  return capabilityProviderLabel(capability)
    .toUpperCase();
}

const SUPPORTED_INTERVALS = new Set([
  "1min",
  "5min",
  "15min",
  "30min",
  "45min",
  "1h",
  "2h",
  "4h",
  "8h",
  "1day",
  "1week",
  "1month"
]);

function normalizeInterval(interval) {
  const normalizedInterval =
    String(interval || "1day")
      .trim()
      .toLowerCase();

  return SUPPORTED_INTERVALS.has(
    normalizedInterval
  )
    ? normalizedInterval
    : null;
}

function toNumber(value, fallback = null) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function normalizeLiveCacheMetadata(
  cache
) {
  if (
    !cache ||
    typeof cache !== "object"
  ) {
    return {
      status: "UNKNOWN",
      hit: false,
      ttlSeconds: 20,
      ageSeconds: 0,
      expiresInSeconds: 0
    };
  }

  return {
    status:
      cache.status ||
      (cache.hit ? "HIT" : "MISS"),

    hit:
      cache.hit === true,

    ttlSeconds:
      toNumber(
        cache.ttlSeconds,
        20
      ),

    ageSeconds:
      toNumber(
        cache.ageSeconds,
        0
      ),

    expiresInSeconds:
      toNumber(
        cache.expiresInSeconds,
        0
      )
  };
}

// ==================================================
// Normalize Column-Based OHLCV
// ==================================================

function normalizeColumnData(data) {
  if (
    !data ||
    typeof data !== "object" ||
    !Array.isArray(data.t)
  ) {
    return [];
  }

  const dates = data.t;
  const opens =
    Array.isArray(data.o)
      ? data.o
      : [];

  const highs =
    Array.isArray(data.h)
      ? data.h
      : [];

  const lows =
    Array.isArray(data.l)
      ? data.l
      : [];

  const closes =
    Array.isArray(data.c)
      ? data.c
      : [];

  const volumes =
    Array.isArray(data.v)
      ? data.v
      : [];

  const bars = [];

  for (
    let index = 0;
    index < dates.length;
    index += 1
  ) {
    const date = dates[index];
    const open =
      toNumber(opens[index]);

    const high =
      toNumber(highs[index]);

    const low =
      toNumber(lows[index]);

    const close =
      toNumber(closes[index]);

    const volume =
      toNumber(
        volumes[index],
        0
      );

    if (
      !date ||
      open === null ||
      high === null ||
      low === null ||
      close === null
    ) {
      continue;
    }

    bars.push({
      date,
      open,
      high,
      low,
      close,
      volume
    });
  }

  return bars.sort((a, b) => {
    return (
      new Date(a.date) -
      new Date(b.date)
    );
  });
}

// ==================================================
// Normalize Array-Based OHLCV
// ==================================================

function normalizeArrayData(rawData) {
  if (!Array.isArray(rawData)) {
    return [];
  }

  return rawData
    .map((bar) => {
      const date =
        bar.date ||
        bar.datetime ||
        bar.timestamp ||
        bar.time ||
        null;

      const open =
        toNumber(bar.open);

      const high =
        toNumber(bar.high);

      const low =
        toNumber(bar.low);

      const close =
        toNumber(bar.close);

      const volume =
        toNumber(
          bar.volume,
          0
        );

      if (
        !date ||
        open === null ||
        high === null ||
        low === null ||
        close === null
      ) {
        return null;
      }

      return {
        date,
        open,
        high,
        low,
        close,
        volume
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      return (
        new Date(a.date) -
        new Date(b.date)
      );
    });
}

// ==================================================
// Universal Historical Normalizer
// ==================================================

function normalizeHistoricalBars(source) {
  if (!source) {
    return [];
  }

  if (Array.isArray(source)) {
    return normalizeArrayData(source);
  }

  if (
    typeof source === "object" &&
    Array.isArray(source.t)
  ) {
    return normalizeColumnData(source);
  }

  if (
    typeof source === "object" &&
    source.data
  ) {
    return normalizeHistoricalBars(
      source.data
    );
  }

  if (
    typeof source === "object" &&
    source.bars
  ) {
    return normalizeHistoricalBars(
      source.bars
    );
  }

  if (
    typeof source === "object" &&
    source.history
  ) {
    return normalizeHistoricalBars(
      source.history
    );
  }

  return [];
}

// ==================================================
// Build Legacy Column Data
// ==================================================

function buildColumnData(bars) {
  return {
    t: bars.map(
      (bar) => bar.date
    ),

    o: bars.map(
      (bar) => bar.open
    ),

    h: bars.map(
      (bar) => bar.high
    ),

    l: bars.map(
      (bar) => bar.low
    ),

    c: bars.map(
      (bar) => bar.close
    ),

    v: bars.map(
      (bar) => bar.volume
    )
  };
}

// ==================================================
// Historical Data Quality
// ==================================================

function buildHistoricalQuality(
  bars,
  cacheStatus
) {
  const warnings = [];

  if (
    !Array.isArray(bars) ||
    bars.length === 0
  ) {
    return {
      status: "Unavailable",
      historicalBars: 0,
      latestHistoricalDate: null,
      oldestHistoricalDate: null,
      cache: cacheStatus,

      warnings: [
        "No valid historical OHLCV bars were available."
      ]
    };
  }

  if (bars.length < 50) {
    warnings.push(
      "Historical dataset contains fewer than 50 bars."
    );
  }

  const invalidVolumeBars =
    bars.filter((bar) => {
      return (
        !Number.isFinite(
          bar.volume
        ) ||
        bar.volume < 0
      );
    }).length;

  if (invalidVolumeBars > 0) {
    warnings.push(
      `${invalidVolumeBars} bars contain invalid volume data.`
    );
  }

  const duplicateDates =
    bars.length -
    new Set(
      bars.map(
        (bar) => bar.date
      )
    ).size;

  if (duplicateDates > 0) {
    warnings.push(
      `${duplicateDates} duplicate historical dates were detected.`
    );
  }

  return {
    status:
      warnings.length > 0
        ? "Degraded"
        : "Good",

    historicalBars:
      bars.length,

    latestHistoricalDate:
      bars[
        bars.length - 1
      ]?.date || null,

    oldestHistoricalDate:
      bars[0]?.date || null,

    cache: cacheStatus,
    warnings
  };
}

// ==================================================
// Live Market Data — Finnhub
// ==================================================

async function getMarketDataUnobserved(symbol) {
  const normalizedSymbol =
    normalizeSymbol(symbol);

  const startedAt = Date.now();

  if (!normalizedSymbol) {
    return {
      success: false,
      provider: capabilityProviderLabel("quote"),
      symbol: normalizedSymbol,

      error:
        "A valid ticker symbol is required.",

      cache: {
        status: "BYPASS",
        hit: false,
        ttlSeconds: 20,
        ageSeconds: 0,
        expiresInSeconds: 0
      },

      performance: {
        durationMs:
          Date.now() -
          startedAt,

        cacheHit: false
      }
    };
  }

  try {
    const [result, profileResult] = await Promise.all([
      getQuote(normalizedSymbol),
      getCompanyProfile(normalizedSymbol)
    ]);

    const companyProfile = profileResult?.success
      ? profileResult.data
      : null;
    const mergedResult = {
      ...result,
      data: result?.data ? {
        ...result.data,
        company: companyProfile?.name || result.data.company || null,
        exchange: companyProfile?.exchange || result.data.exchange || null,
        currency: companyProfile?.currency || result.data.currency || null
      } : result?.data,
      companyProfile,
      limitations: [
        ...(Array.isArray(result?.limitations) ? result.limitations : []),
        ...(companyProfile ? [] : [
          `Company profile enrichment is unavailable: ${profileResult?.error || "unknown provider error"}`
        ])
      ]
    };

    const cache =
      normalizeLiveCacheMetadata(
        result?.cache
      );

    if (mergedResult?.success === true) {
      return {
        ...mergedResult,

        symbol:
          mergedResult.symbol ||
          mergedResult.data?.symbol ||
          normalizedSymbol,

        cache,

        performance: {
          durationMs:
            Date.now() -
            startedAt,

          cacheHit:
            cache.hit,

          source:
            cache.hit
              ? "CACHE"
              : capabilityProviderSource("quote")
        }
      };
    }

    return {
      success: false,

      provider:
        result?.provider ||
        capabilityProviderLabel("quote"),

      symbol:
        result?.symbol ||
        normalizedSymbol,

      error:
        result?.error ||
        "Unable to fetch live market data.",

      cache,

      performance: {
        durationMs:
          Date.now() -
          startedAt,

        cacheHit:
          cache.hit,

        source:
          cache.hit
            ? "CACHE"
            : capabilityProviderSource("quote")
      }
    };
  } catch (error) {
    console.error(
      "Market Engine Live Error:",
      error
    );

    return {
      success: false,
      provider: capabilityProviderLabel("quote"),
      symbol: normalizedSymbol,

      error:
        "Unable to fetch live market data.",

      details:
        error.message,

      cache: {
        status: "ERROR",
        hit: false,
        ttlSeconds: 20,
        ageSeconds: 0,
        expiresInSeconds: 0
      },

      performance: {
        durationMs:
          Date.now() -
          startedAt,

        cacheHit: false,
        source: capabilityProviderSource("quote")
      }
    };
  }
}

async function getMarketData(symbol) {
  const startedAt = Date.now();
  const result =
    await getMarketDataUnobserved(symbol);

  recordProviderResult({
    provider:
      result?.provider ||
      capabilityProviderLabel("quote"),
    operation: "live_quote",
    result,
    durationMs:
      Date.now() - startedAt
  });

  return result;
}

// ==================================================
// Historical Data — Shared OHLCV
// ==================================================

async function getHistoryUnobserved(
  symbol,
  interval = "1day"
) {
  const normalizedSymbol =
    normalizeSymbol(symbol);

  const normalizedInterval =
    normalizeInterval(interval);

  const startedAt = Date.now();

  if (!normalizedSymbol) {
    return {
      success: false,
      provider: capabilityProviderLabel("history"),
      symbol: normalizedSymbol,
      interval,

      error:
        "A valid ticker symbol is required.",

      code:
        "INVALID_SYMBOL",

      performance: {
        durationMs:
          Date.now() -
          startedAt,

        cacheHit: false
      }
    };
  }

  if (!normalizedInterval) {
    return {
      success: false,
      provider: capabilityProviderLabel("history"),
      symbol: normalizedSymbol,
      interval,

      error:
        "Unsupported historical interval.",

      code:
        "INVALID_INTERVAL",

      supportedIntervals:
        Array.from(SUPPORTED_INTERVALS),

      performance: {
        durationMs:
          Date.now() -
          startedAt,

        cacheHit: false
      }
    };
  }

  /*
    The history cache lives in utils/cache.js - a single flat namespace shared
    with halalTerminalProvider - and its key used to be
    `history_${SYMBOL}_${INTERVAL}` with no provider identity at all.

    HISTORY_PROVIDER is switchable between twelve_data and finnhub, so within
    one process a flip in either direction served the other provider's bars.
    It would not have looked broken: Finnhub returns `t` as Unix seconds and
    Twelve Data returns date strings, and normalizeHistoricalBars accepts both.
    Compatible shapes are exactly the condition that makes cross-provider reuse
    invisible rather than safe.

    The key now carries the cache contract version and the provider id, so a
    Twelve Data record can never satisfy a Finnhub request or the reverse.
  */
  const historyProvider =
    getCapabilityProviders().history;

  const cacheKey = buildCacheKey({
    provider: historyProvider,
    capability: "history",
    parts: [normalizedSymbol, normalizedInterval]
  });

  try {
    // ==============================================
    // Cache Check
    // ==============================================

    const cachedResult =
      getCache(cacheKey);

    if (cachedResult) {
      const bars =
        normalizeHistoricalBars(
          cachedResult.bars ||
          cachedResult.data ||
          cachedResult.history
        );

      if (bars.length === 0) {
        return {
          success: false,
          provider: capabilityProviderLabel("history"),
          symbol: normalizedSymbol,
          interval:
            normalizedInterval,

          error:
            "Cached historical data could not be normalized.",

          code:
            "INVALID_CACHED_HISTORY",

          performance: {
            durationMs:
              Date.now() -
              startedAt,

            cacheHit: true
          }
        };
      }

      const data =
        buildColumnData(bars);

      return {
        success: true,

        provider:
          cachedResult.provider ||
          capabilityProviderLabel("history"),

        symbol: normalizedSymbol,

        interval:
          normalizedInterval,

        // Existing services can use data.c,
        // data.o, data.h, data.l and data.v.
        data,

        // Shared-OHLCV services use bars.
        bars,

        metadata:
          cachedResult.metadata || {
            interval:
              normalizedInterval,
            barCount:
              bars.length,
            oldestDate:
              bars[0]?.date || null,
            latestDate:
              bars[
                bars.length - 1
              ]?.date || null
          },

        cache: "HIT",

        dataQuality:
          buildHistoricalQuality(
            bars,
            "HIT"
          ),

        performance: {
          durationMs:
            Date.now() -
            startedAt,

          cacheHit: true
        }
      };
    }

    if (pendingHistoryRequests.has(cacheKey)) {
      const pendingResult =
        await pendingHistoryRequests.get(cacheKey);

      if (pendingResult?.success !== true) {
        return {
          ...pendingResult,
          performance: {
            ...pendingResult?.performance,
            durationMs:
              Date.now() -
              startedAt,
            cacheHit: false
          }
        };
      }

      return {
        ...pendingResult,
        cache: "COALESCED",
        dataQuality:
          buildHistoricalQuality(
            pendingResult.bars,
            "COALESCED"
          ),
        performance: {
          ...pendingResult.performance,
          durationMs:
            Date.now() -
            startedAt,
          cacheHit: true
        }
      };
    }

    // ==============================================
    // Provider Fetch
    // ==============================================

    const requestPromise = (async () => {
      const result =
        await getHistoricalCandles(
          normalizedSymbol,
          normalizedInterval
        );

    if (result?.success !== true) {
      return {
        success: false,

        provider:
          result?.provider ||
          capabilityProviderLabel("history"),

        symbol:
          normalizedSymbol,

        interval:
          normalizedInterval,

        code:
          result?.code ||
          "HISTORICAL_DATA_ERROR",

        error:
          result?.error ||
          "Unable to fetch historical market data.",

        supportedIntervals:
          result?.supportedIntervals,

        performance: {
          durationMs:
            Date.now() -
            startedAt,

          cacheHit: false
        }
      };
    }

    const bars =
      normalizeHistoricalBars(
        result.data ||
        result.bars ||
        result.history ||
        result
      );

    if (bars.length === 0) {
      return {
        success: false,

        provider:
          result.provider ||
          capabilityProviderLabel("history"),

        symbol:
          normalizedSymbol,

        interval:
          normalizedInterval,

        error:
          "Historical data was returned, but no valid OHLCV bars could be normalized.",

        code:
          "INVALID_HISTORICAL_BARS",

        performance: {
          durationMs:
            Date.now() -
            startedAt,

          cacheHit: false
        }
      };
    }

    const data =
      buildColumnData(bars);

    const normalizedResult = {
      success: true,

      provider:
        result.provider ||
        capabilityProviderLabel("history"),

      symbol:
        normalizedSymbol,

      interval:
        normalizedInterval,

      // Legacy structure
      data,

      // Shared OHLCV structure
      bars,

      metadata:
        result.metadata || {
          interval:
            normalizedInterval,
          barCount:
            bars.length,
          oldestDate:
            bars[0]?.date || null,
          latestDate:
            bars[
              bars.length - 1
            ]?.date || null
        }
    };

    // Existing cache utility uses minutes.
    setCache(
      cacheKey,
      normalizedResult,
      30
    );

      return {
        ...normalizedResult,

        cache: "MISS",

        dataQuality:
          buildHistoricalQuality(
            bars,
            "MISS"
          ),

        performance: {
          durationMs:
            Date.now() -
            startedAt,

          cacheHit: false
        }
      };
    })();

    pendingHistoryRequests.set(
      cacheKey,
      requestPromise
    );

    try {
      return await requestPromise;
    } finally {
      pendingHistoryRequests.delete(cacheKey);
    }
  } catch (error) {
    console.error(
      "Market Engine Historical Error:",
      error
    );

    return {
      success: false,
      provider: capabilityProviderLabel("history"),
      symbol: normalizedSymbol,

      interval:
        normalizedInterval,

      error:
        "Unable to fetch historical market data.",

      details:
        error.message,

      code:
        "HISTORICAL_DATA_EXCEPTION",

      performance: {
        durationMs:
          Date.now() -
          startedAt,

        cacheHit: false
      }
    };
  }
}

async function getHistory(
  symbol,
  interval = "1day"
) {
  const startedAt = Date.now();
  const result =
    await getHistoryUnobserved(
      symbol,
      interval
    );

  recordProviderResult({
    provider:
      result?.provider ||
      capabilityProviderLabel("history"),
    operation: "historical_ohlcv",
    result,
    durationMs:
      Date.now() - startedAt
  });

  return result;
}

module.exports = {
  getMarketData,
  getHistory,
  normalizeHistoricalBars,
  buildColumnData,
  normalizeInterval,
  SUPPORTED_INTERVALS
};
