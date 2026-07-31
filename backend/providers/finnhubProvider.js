const axios = require("axios");

// ==================================================
// Finnhub Configuration
// ==================================================

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";

const DEFAULT_QUOTE_CACHE_TTL_MS = 20 * 1000;
const DEFAULT_PROFILE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10 * 1000;

const QUOTE_CACHE_TTL_MS =
  Number(process.env.FINNHUB_QUOTE_CACHE_TTL_MS) ||
  DEFAULT_QUOTE_CACHE_TTL_MS;

const PROFILE_CACHE_TTL_MS =
  Number(process.env.FINNHUB_PROFILE_CACHE_TTL_MS) ||
  DEFAULT_PROFILE_CACHE_TTL_MS;

const REQUEST_TIMEOUT_MS =
  Number(process.env.FINNHUB_REQUEST_TIMEOUT_MS) ||
  DEFAULT_REQUEST_TIMEOUT_MS;

// ==================================================
// In-Memory Cache
// ==================================================

const quoteCache = new Map();
const profileCache = new Map();

/*
  Prevents duplicate Finnhub calls when several requests for the
  same symbol arrive before the first request has completed.
*/
const pendingQuoteRequests = new Map();
const pendingProfileRequests = new Map();
const symbolSearchCache = new Map();
const pendingSymbolSearchRequests = new Map();
const SYMBOL_SEARCH_CACHE_TTL_MS = 15 * 60 * 1000;

// ==================================================
// Helpers
// ==================================================

function normalizeSymbol(symbol) {
  return String(symbol || "")
    .trim()
    .toUpperCase();
}

function toFiniteNumber(value, fallback = null) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function roundNumber(value, decimals = 3) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  const factor = 10 ** decimals;

  return Math.round(number * factor) / factor;
}

function getApiKey() {
  const apiKey = String(
    process.env.FINNHUB_API_KEY || ""
  ).trim();

  if (!apiKey) {
    throw new Error(
      "FINNHUB_API_KEY is missing from the environment."
    );
  }

  return apiKey;
}

function getAxiosErrorMessage(error) {
  const responseMessage =
    error?.response?.data?.error ||
    error?.response?.data?.message;

  if (responseMessage) {
    return String(responseMessage);
  }

  if (error?.code === "ECONNABORTED") {
    return "Finnhub request timed out.";
  }

  if (error?.response?.status === 401) {
    return "Finnhub rejected the API key.";
  }

  if (error?.response?.status === 403) {
    return "Finnhub access was forbidden.";
  }

  if (error?.response?.status === 429) {
    return "Finnhub rate limit was reached.";
  }

  return (
    error?.message ||
    "An unknown Finnhub error occurred."
  );
}

function createCacheMetadata({
  hit,
  status,
  storedAt,
  expiresAt,
  ttlMs
}) {
  const now = Date.now();

  const ageMs = storedAt
    ? Math.max(0, now - storedAt)
    : 0;

  const remainingMs = expiresAt
    ? Math.max(0, expiresAt - now)
    : ttlMs;

  return {
    status,
    hit,
    ttlSeconds: Math.round(ttlMs / 1000),
    ageSeconds: roundNumber(ageMs / 1000, 3),
    expiresInSeconds: roundNumber(
      remainingMs / 1000,
      3
    )
  };
}

function readFreshCache(cache, key) {
  const cachedEntry = cache.get(key);

  if (!cachedEntry) {
    return null;
  }

  if (Date.now() >= cachedEntry.expiresAt) {
    cache.delete(key);
    return null;
  }

  return cachedEntry;
}

function writeCache(cache, key, value, ttlMs) {
  const storedAt = Date.now();

  const entry = {
    value,
    storedAt,
    expiresAt: storedAt + ttlMs
  };

  cache.set(key, entry);

  return entry;
}

function isValidQuote(quote) {
  return (
    quote &&
    typeof quote === "object" &&
    Number.isFinite(Number(quote.c)) &&
    Number(quote.c) > 0
  );
}

function isListedEquitySearchResult(result) {
  const type = String(result?.type || "").trim().toLowerCase();
  const symbol = normalizeSymbol(result?.symbol);

  return (
    symbol.length > 0 &&
    symbol.length <= 15 &&
    /^[A-Z0-9.\-]+$/.test(symbol) &&
    (type === "common stock" ||
      type === "ordinary shares" ||
      type === "preferred stock" ||
      type === "preferred shares")
  );
}

async function searchListedEquities(query, limit = 12) {
  const normalizedQuery = String(query || "").trim();

  if (normalizedQuery.length < 1 || normalizedQuery.length > 80) {
    return [];
  }

  const cacheKey = normalizedQuery.toLowerCase();
  const cachedEntry = readFreshCache(symbolSearchCache, cacheKey);

  if (cachedEntry) {
    return cachedEntry.value.slice(0, limit);
  }

  if (pendingSymbolSearchRequests.has(cacheKey)) {
    const pending = await pendingSymbolSearchRequests.get(cacheKey);
    return pending.slice(0, limit);
  }

  const requestPromise = (async () => {
    const response = await axios.get(`${FINNHUB_BASE_URL}/search`, {
      params: {
        q: normalizedQuery,
        token: getApiKey()
      },
      timeout: REQUEST_TIMEOUT_MS
    });

    const results = Array.isArray(response?.data?.result)
      ? response.data.result
      : [];
    const equities = results
      .filter(isListedEquitySearchResult)
      .map((result) => ({
        symbol: normalizeSymbol(result.symbol),
        name: String(result.description || result.symbol).trim(),
        exchange: String(result.displaySymbol || "").includes(":")
          ? String(result.displaySymbol).split(":")[0]
          : null,
        securityType: String(result.type || "Common Stock")
      }))
      .filter(
        (result, index, all) =>
          all.findIndex((candidate) => candidate.symbol === result.symbol) ===
          index
      );

    writeCache(
      symbolSearchCache,
      cacheKey,
      equities,
      SYMBOL_SEARCH_CACHE_TTL_MS
    );
    return equities;
  })();

  pendingSymbolSearchRequests.set(cacheKey, requestPromise);

  try {
    const results = await requestPromise;
    return results.slice(0, limit);
  } finally {
    pendingSymbolSearchRequests.delete(cacheKey);
  }
}

// ==================================================
// Company Profile
// ==================================================

async function fetchCompanyProfile(symbol) {
  const cachedEntry = readFreshCache(
    profileCache,
    symbol
  );

  if (cachedEntry) {
    return cachedEntry.value;
  }

  if (pendingProfileRequests.has(symbol)) {
    return pendingProfileRequests.get(symbol);
  }

  const requestPromise = (async () => {
    const apiKey = getApiKey();

    const response = await axios.get(
      `${FINNHUB_BASE_URL}/stock/profile2`,
      {
        params: {
          symbol,
          token: apiKey
        },
        timeout: REQUEST_TIMEOUT_MS
      }
    );

    const profile =
      response?.data &&
      typeof response.data === "object"
        ? response.data
        : {};

    writeCache(
      profileCache,
      symbol,
      profile,
      PROFILE_CACHE_TTL_MS
    );

    return profile;
  })();

  pendingProfileRequests.set(
    symbol,
    requestPromise
  );

  try {
    return await requestPromise;
  } finally {
    pendingProfileRequests.delete(symbol);
  }
}

// ==================================================
// Fetch Fresh Live Quote
// ==================================================

async function fetchFreshFinnhubQuote(symbol) {
  const apiKey = getApiKey();
  const quoteResponse = await axios.get(
    `${FINNHUB_BASE_URL}/quote`,
    {
      params: { symbol, token: apiKey },
      timeout: REQUEST_TIMEOUT_MS
    }
  );

  const quote = quoteResponse?.data;

  if (!isValidQuote(quote)) {
    throw new Error(
      `Finnhub returned no valid live quote for ${symbol}.`
    );
  }

  return {
    success: true,
    provider: "Finnhub",
    symbol,

    data: {
      symbol,
      company: null,
      exchange: null,
      currency: null,

      price:
        toFiniteNumber(quote.c),

      previousClose:
        toFiniteNumber(quote.pc),

      open:
        toFiniteNumber(quote.o),

      high:
        toFiniteNumber(quote.h),

      low:
        toFiniteNumber(quote.l),

      change:
        toFiniteNumber(quote.d),

      changePercent:
        toFiniteNumber(quote.dp),

      timestamp:
        toFiniteNumber(quote.t)
    },
    companyProfile: null,
    limitations: []
  };
}

async function getFinnhubCompanyProfile(symbol) {
  const normalizedSymbol = normalizeSymbol(symbol);
  if (!normalizedSymbol) {
    return { success: false, provider: "Finnhub", symbol: normalizedSymbol,
      data: null, error: "A valid ticker symbol is required." };
  }

  try {
    const profile = await fetchCompanyProfile(normalizedSymbol);
    if (!profile || Object.keys(profile).length === 0) {
      return { success: false, provider: "Finnhub", symbol: normalizedSymbol,
        data: null, error: "Company profile unavailable." };
    }
    return {
      success: true,
      provider: "Finnhub",
      symbol: normalizedSymbol,
      data: {
        name: profile.name || null,
        ticker: profile.ticker || normalizedSymbol,
        country: profile.country || null,
        currency: profile.currency || null,
        exchange: profile.exchange || null,
        sector: null,
        industry: profile.finnhubIndustry || null,
        ipoDate: profile.ipo || null,
        website: profile.weburl || null,
        logo: profile.logo || null,
        source: "Finnhub Company Profile",
        retrievedAt: new Date().toISOString()
      },
      error: null
    };
  } catch (error) {
    return { success: false, provider: "Finnhub", symbol: normalizedSymbol,
      data: null, error: getAxiosErrorMessage(error) };
  }
}

// ==================================================
// Get Live Quote
// ==================================================

async function getFinnhubQuote(symbol) {
  const normalizedSymbol =
    normalizeSymbol(symbol);

  if (!normalizedSymbol) {
    return {
      success: false,
      provider: "Finnhub",
      symbol: normalizedSymbol,
      error:
        "A valid ticker symbol is required.",

      cache: {
        status: "BYPASS",
        hit: false,
        ttlSeconds:
          Math.round(
            QUOTE_CACHE_TTL_MS / 1000
          ),
        ageSeconds: 0,
        expiresInSeconds: 0
      }
    };
  }

  const cachedEntry = readFreshCache(
    quoteCache,
    normalizedSymbol
  );

  if (cachedEntry) {
    return {
      ...cachedEntry.value,

      cache: createCacheMetadata({
        hit: true,
        status: "HIT",
        storedAt: cachedEntry.storedAt,
        expiresAt: cachedEntry.expiresAt,
        ttlMs: QUOTE_CACHE_TTL_MS
      })
    };
  }

  /*
    If another request for this symbol is already running,
    wait for it instead of sending another Finnhub request.
  */
  if (
    pendingQuoteRequests.has(
      normalizedSymbol
    )
  ) {
    try {
      const pendingResult =
        await pendingQuoteRequests.get(
          normalizedSymbol
        );

      const newCacheEntry =
        readFreshCache(
          quoteCache,
          normalizedSymbol
        );

      return {
        ...pendingResult,

        cache: createCacheMetadata({
          hit: true,
          status: "COALESCED",
          storedAt:
            newCacheEntry?.storedAt ||
            Date.now(),
          expiresAt:
            newCacheEntry?.expiresAt ||
            Date.now() +
              QUOTE_CACHE_TTL_MS,
          ttlMs: QUOTE_CACHE_TTL_MS
        })
      };
    } catch (error) {
      return {
        success: false,
        provider: "Finnhub",
        symbol: normalizedSymbol,
        error:
          getAxiosErrorMessage(error),

        cache: {
          status: "MISS",
          hit: false,
          ttlSeconds:
            Math.round(
              QUOTE_CACHE_TTL_MS / 1000
            ),
          ageSeconds: 0,
          expiresInSeconds: 0
        }
      };
    }
  }

  const requestPromise = (async () => {
    const freshResult =
      await fetchFreshFinnhubQuote(
        normalizedSymbol
      );

    const cacheEntry = writeCache(
      quoteCache,
      normalizedSymbol,
      freshResult,
      QUOTE_CACHE_TTL_MS
    );

    return {
      result: freshResult,
      cacheEntry
    };
  })();

  const derivedQuotePromise = requestPromise.then(
    ({ result }) => result
  );

  /*
    This derived promise is only awaited by a concurrent
    caller that happens to arrive while it is pending (see
    the coalescing branch above). If no such caller shows
    up, nothing ever attaches a handler to it, and a
    rejection here becomes an unhandled rejection that can
    crash the process. Attaching a no-op .catch marks the
    promise as handled for Node's tracking without
    swallowing the rejection for any real awaiter, since
    .catch() returns a new promise rather than mutating
    this one.
  */
  derivedQuotePromise.catch(() => {});

  pendingQuoteRequests.set(
    normalizedSymbol,
    derivedQuotePromise
  );

  try {
    const {
      result,
      cacheEntry
    } = await requestPromise;

    return {
      ...result,

      cache: createCacheMetadata({
        hit: false,
        status: "MISS",
        storedAt: cacheEntry.storedAt,
        expiresAt: cacheEntry.expiresAt,
        ttlMs: QUOTE_CACHE_TTL_MS
      })
    };
  } catch (error) {
    return {
      success: false,
      provider: "Finnhub",
      symbol: normalizedSymbol,
      error:
        getAxiosErrorMessage(error),

      cache: {
        status: "MISS",
        hit: false,
        ttlSeconds:
          Math.round(
            QUOTE_CACHE_TTL_MS / 1000
          ),
        ageSeconds: 0,
        expiresInSeconds: 0
      }
    };
  } finally {
    pendingQuoteRequests.delete(
      normalizedSymbol
    );
  }
}

// ==================================================
// Get Historical Candles
// ==================================================

async function getHistoricalCandles(
  symbol,
  resolution = "D",
  days = 100
) {
  const normalizedSymbol =
    normalizeSymbol(symbol);

  try {
    if (!normalizedSymbol) {
      return {
        success: false,
        provider: "Finnhub",
        symbol: normalizedSymbol,
        error:
          "A valid ticker symbol is required."
      };
    }

    const apiKey = getApiKey();

    const safeDays =
      Number.isFinite(Number(days)) &&
      Number(days) > 0
        ? Number(days)
        : 100;

    const to =
      Math.floor(Date.now() / 1000);

    const from =
      to -
      safeDays * 24 * 60 * 60;

    const response = await axios.get(
      `${FINNHUB_BASE_URL}/stock/candle`,
      {
        params: {
          symbol: normalizedSymbol,
          resolution,
          from,
          to,
          token: apiKey
        },
        timeout: REQUEST_TIMEOUT_MS
      }
    );

    if (response?.data?.s !== "ok") {
      return {
        success: false,
        provider: "Finnhub",
        symbol: normalizedSymbol,
        error:
          "No historical data found."
      };
    }

    return {
      success: true,
      provider: "Finnhub",
      symbol: normalizedSymbol,
      data: response.data
    };
  } catch (error) {
    return {
      success: false,
      provider: "Finnhub",
      symbol: normalizedSymbol,
      error:
        getAxiosErrorMessage(error)
    };
  }
}

// ==================================================
// Cache Utilities
// ==================================================

function clearFinnhubQuoteCache(symbol = null) {
  if (symbol) {
    const normalizedSymbol =
      normalizeSymbol(symbol);

    quoteCache.delete(normalizedSymbol);
    pendingQuoteRequests.delete(
      normalizedSymbol
    );

    return {
      cleared: true,
      symbol: normalizedSymbol
    };
  }

  const entriesCleared =
    quoteCache.size;

  quoteCache.clear();
  pendingQuoteRequests.clear();

  return {
    cleared: true,
    entriesCleared
  };
}

function clearFinnhubProfileCache(
  symbol = null
) {
  if (symbol) {
    const normalizedSymbol =
      normalizeSymbol(symbol);

    profileCache.delete(
      normalizedSymbol
    );

    pendingProfileRequests.delete(
      normalizedSymbol
    );

    return {
      cleared: true,
      symbol: normalizedSymbol
    };
  }

  const entriesCleared =
    profileCache.size;

  profileCache.clear();
  pendingProfileRequests.clear();

  return {
    cleared: true,
    entriesCleared
  };
}

function getFinnhubCacheStats() {
  return {
    quoteCache: {
      entries: quoteCache.size,
      ttlSeconds:
        Math.round(
          QUOTE_CACHE_TTL_MS / 1000
        ),
      pendingRequests:
        pendingQuoteRequests.size
    },

    profileCache: {
      entries: profileCache.size,
      ttlSeconds:
        Math.round(
          PROFILE_CACHE_TTL_MS / 1000
        ),
      pendingRequests:
        pendingProfileRequests.size
    }
  };
}

module.exports = {
  getFinnhubQuote,
  getFinnhubCompanyProfile,
  getHistoricalCandles,
  clearFinnhubQuoteCache,
  clearFinnhubProfileCache,
  getFinnhubCacheStats,
  searchListedEquities
};
