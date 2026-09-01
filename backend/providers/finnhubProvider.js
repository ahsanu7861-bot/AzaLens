const axios = require("axios");

const {
  buildCacheKey
} = require("../utils/cache");

// ==================================================
// Finnhub Configuration
// ==================================================

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";
const PROVIDER_ID = "finnhub";

/*
  Cache and pending-request keys carry the provider id and the cache contract
  version. The Maps below are module-private, so a Twelve Data record cannot
  physically reach them today - but that is a property of the file layout, not
  a declared guarantee. Qualifying the key makes it one, and keeps the two
  providers' namespaces provably disjoint under
  backend/tests/testProviderCacheNamespaces.js.

  This is a namespacing change only. TTLs, values, coalescing behaviour and
  every normalized response field are untouched.
*/
function finnhubCacheKey(capability, ...parts) {
  return buildCacheKey({
    provider: PROVIDER_ID,
    capability,
    parts
  });
}

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

/*
  ==========================================================================
  Strict numeric parsing
  ==========================================================================

  This is a DEFAULT-PATH correction, not part of the Twelve Data parity work.
  Finnhub is the configured quote provider today, so this guard runs on live
  production traffic.

  The previous implementation was `Number(value)` guarded by `isFinite`, which
  reads as safe and is not: `Number(null)`, `Number("")`, `Number("   ")` and
  `Number([])` are all 0, and 0 is finite. Any quote field Finnhub omitted as
  null or blank therefore reached the product as a real-looking zero - a
  previous close of $0.00, a change of "no movement", a timestamp of 1970 - and
  nothing downstream could tell that apart from a genuine zero.

  Blank-string rejection cannot be an equality test against "", because "   "
  and "\t\n" coerce to 0 exactly like "" does. Truthiness is unusable too,
  because 0 and "0" are legitimate quote values that must survive unchanged.

    ACCEPTED  - a finite number, including 0 and negative numbers
              - a string that is non-blank after trimming AND parses to a
                finite number, including "0"

    REJECTED  - null, undefined
              - "", and any whitespace-only string
              - any non-numeric string
              - NaN, Infinity, -Infinity (as numbers or as strings)
              - booleans, arrays, objects, and every other type

  Rejected input returns `fallback` - null for every quote field - which is the
  adapter's existing unavailable representation. No new error shape is
  introduced, and every well-formed numeric response is byte-identical to
  before.
*/
function toFiniteNumber(value, fallback = null) {
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : fallback;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed === "") {
      return fallback;
    }

    const number = Number(trimmed);

    return Number.isFinite(number)
      ? number
      : fallback;
  }

  return fallback;
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
  /*
    Validation must apply the SAME accepted domain as the field normalizer.
    With a looser coercion here, a payload whose `c` was `true` or `["101"]`
    would pass validation and then normalize to a null price - a "successful"
    quote carrying no price, which is worse than an honest failure.
  */
  const currentPrice = toFiniteNumber(quote?.c);

  return (
    quote &&
    typeof quote === "object" &&
    currentPrice !== null &&
    currentPrice > 0
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

  const cacheKey = finnhubCacheKey(
    "search",
    normalizedQuery.toLowerCase()
  );
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
        exchange: "US",
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
  const cacheKey = finnhubCacheKey("profile", symbol);

  const cachedEntry = readFreshCache(
    profileCache,
    cacheKey
  );

  if (cachedEntry) {
    return cachedEntry.value;
  }

  if (pendingProfileRequests.has(cacheKey)) {
    return pendingProfileRequests.get(cacheKey);
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
      cacheKey,
      profile,
      PROFILE_CACHE_TTL_MS
    );

    return profile;
  })();

  pendingProfileRequests.set(
    cacheKey,
    requestPromise
  );

  try {
    return await requestPromise;
  } finally {
    pendingProfileRequests.delete(cacheKey);
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
    const country = String(profile.country || "").trim().toUpperCase();
    const exchange = String(profile.exchange || "").trim().toUpperCase();
    if ((country && country !== "US") || /\bOTC\b|OTCM|OTCQ|PINK/.test(exchange)) {
      return {
        success: false,
        provider: "Finnhub",
        symbol: normalizedSymbol,
        data: null,
        code: "LISTING_NOT_AVAILABLE_PRIVATE_PERSONAL",
        error: "OTC and international equities are unavailable in private-personal mode."
      };
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

  const cacheKey = finnhubCacheKey(
    "quote",
    normalizedSymbol
  );

  const cachedEntry = readFreshCache(
    quoteCache,
    cacheKey
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
      cacheKey
    )
  ) {
    try {
      const pendingResult =
        await pendingQuoteRequests.get(
          cacheKey
        );

      const newCacheEntry =
        readFreshCache(
          quoteCache,
          cacheKey
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
      cacheKey,
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
    cacheKey,
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
      cacheKey
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

    const cacheKey = finnhubCacheKey(
      "quote",
      normalizedSymbol
    );

    quoteCache.delete(cacheKey);
    pendingQuoteRequests.delete(
      cacheKey
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

    const cacheKey = finnhubCacheKey(
      "profile",
      normalizedSymbol
    );

    profileCache.delete(
      cacheKey
    );

    pendingProfileRequests.delete(
      cacheKey
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

function clearFinnhubSearchCache() {
  symbolSearchCache.clear();
  pendingSymbolSearchRequests.clear();
}

function getFinnhubCacheKeysForTests() {
  return {
    quote: [...quoteCache.keys()],
    profile: [...profileCache.keys()],
    search: [...symbolSearchCache.keys()],
    pendingQuote: [...pendingQuoteRequests.keys()],
    pendingProfile: [...pendingProfileRequests.keys()],
    pendingSearch: [...pendingSymbolSearchRequests.keys()]
  };
}

module.exports = {
  getFinnhubQuote,
  getFinnhubCompanyProfile,
  getHistoricalCandles,
  clearFinnhubQuoteCache,
  clearFinnhubProfileCache,
  clearFinnhubSearchCache,
  getFinnhubCacheKeysForTests,
  getFinnhubCacheStats,
  isListedEquitySearchResult,
  searchListedEquities
};
