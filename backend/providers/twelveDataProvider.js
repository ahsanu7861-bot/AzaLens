const axios = require("axios");

const {
  buildCacheKey
} = require("../utils/cache");
const {
  reserveTwelveDataCredits,
} = require("../services/twelveDataCreditGovernor");

const TWELVE_DATA_URL =
  "https://api.twelvedata.com/time_series";
const TWELVE_DATA_BASE_URL = "https://api.twelvedata.com";
const PROVIDER_ID = "twelve_data";
const PROVIDER_LABEL = "TwelveData";

const PROFILE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_QUOTE_CACHE_TTL_MS = 20 * 1000;
const SYMBOL_SEARCH_CACHE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15 * 1000;

const QUOTE_CACHE_TTL_MS =
  Number(process.env.TWELVE_DATA_QUOTE_CACHE_TTL_MS) ||
  DEFAULT_QUOTE_CACHE_TTL_MS;

const REQUEST_TIMEOUT_MS =
  Number(process.env.TWELVE_DATA_REQUEST_TIMEOUT_MS) ||
  DEFAULT_REQUEST_TIMEOUT_MS;

const profileCache = new Map();
const pendingProfileRequests = new Map();
const quoteCache = new Map();
const pendingQuoteRequests = new Map();
const symbolSearchCache = new Map();
const pendingSymbolSearchRequests = new Map();

/*
  Every Twelve Data cache and pending-request key is namespaced by the provider
  id and the cache contract version. The Maps are module-private today, so a
  Finnhub record cannot physically reach them - but that is a property of the
  current file layout, not a guarantee anyone declared. Qualifying the key makes
  it a guarantee: a record written under `twelve_data` cannot be read back under
  `finnhub`, whichever module ends up holding the Map.
*/
function twelveDataCacheKey(capability, ...parts) {
  return buildCacheKey({
    provider: PROVIDER_ID,
    capability,
    parts
  });
}

/*
  The listed-equity instrument types AzaLens supports.

  This deliberately mirrors the set Finnhub search has always accepted
  (`finnhubProvider.js` isListedEquitySearchResult). PR A is a parity exercise:
  Twelve Data must not quietly widen or narrow the product's instrument scope,
  because that is a user-visible product decision and not an adapter's to make.
  `backend/tests/testTwelveDataSearchContract.js` pins the two sets together.
*/
const SUPPORTED_EQUITY_TYPES = Object.freeze([
  "common stock",
  "ordinary shares",
  "preferred stock",
  "preferred shares"
]);

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

function normalizeSymbol(symbol) {
  return String(symbol || "")
    .trim()
    .toUpperCase();
}

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

function getProviderError(data) {
  if (!data || typeof data !== "object") {
    return "Twelve Data returned an invalid response.";
  }

  if (data.status === "error") {
    return (
      data.message ||
      "Twelve Data returned an error."
    );
  }

  if (data.code && data.message) {
    return data.message;
  }

  return null;
}

function sameText(first, second) {
  return Boolean(first && second) &&
    String(first).trim().toUpperCase() === String(second).trim().toUpperCase();
}

function selectCanonicalListing(rows, profile, symbol) {
  const candidates = (Array.isArray(rows) ? rows : []).filter(
    (row) => sameText(row?.symbol, symbol)
  );
  if (candidates.length === 0) return null;

  const exactMic = candidates.find((row) =>
    sameText(row?.mic_code, profile?.mic_code)
  );
  if (exactMic) return exactMic;

  const exactExchange = candidates.find((row) =>
    sameText(row?.exchange, profile?.exchange) &&
    sameText(row?.type, "Common Stock")
  );
  if (exactExchange) return exactExchange;

  return candidates.find((row) =>
    sameText(row?.country, "United States") &&
    sameText(row?.type, "Common Stock") &&
    ["XNAS", "XNGS", "XNMS", "XNYS", "ARCX"].includes(
      String(row?.mic_code || "").toUpperCase()
    )
  ) || null;
}

async function fetchTwelveDataProfile(symbol) {
  const apiKey = String(process.env.TWELVE_DATA_API_KEY || "").trim();
  if (!apiKey) throw new Error("Twelve Data API key is not configured.");

  await reserveTwelveDataCredits("profile_bundle");
  const request = (endpoint) => axios.get(`${TWELVE_DATA_BASE_URL}/${endpoint}`, {
    params: { symbol, apikey: apiKey },
    timeout: 15000
  });
  const [profileResponse, stocksResponse, logoResult] = await Promise.all([
    request("profile"),
    request("stocks"),
    request("logo").then((response) => response.data).catch(() => null)
  ]);
  const profile = profileResponse?.data;
  const profileError = getProviderError(profile);
  const stocksError = getProviderError(stocksResponse?.data);
  if (profileError || stocksError) throw new Error(profileError || stocksError);

  const listing = selectCanonicalListing(stocksResponse?.data?.data, profile, symbol);
  if (!listing) throw new Error(`No canonical listing was identified for ${symbol}.`);

  return {
    name: profile?.name || listing?.name || null,
    ticker: profile?.symbol || listing?.symbol || symbol,
    country: profile?.country || listing?.country || null,
    currency: listing?.currency || null,
    exchange: profile?.exchange || listing?.exchange || null,
    sector: profile?.sector || null,
    industry: profile?.industry || null,
    /*
      Twelve Data does not return a per-symbol historical IPO or first-listing
      date from `/profile`, and `/ipo_calendar` is a date-ranged event feed
      costing 100 credits that returns nothing for a company listed decades ago.

      So this stays null, honestly. IPO date feeds no calculation, verdict,
      risk value, guidance state, Shariah gate or scanner decision - it is one
      presentation row - and neither a Finnhub enrichment request nor an IPO
      calendar request may be made to populate it. "Unavailable" is the true
      answer and the product says so.
    */
    ipoDate: null,
    website: profile?.website || null,
    logo: logoResult?.url || null,
    source: "Twelve Data Company Profile",
    retrievedAt: new Date().toISOString()
  };
}

async function getTwelveDataCompanyProfile(symbol) {
  const normalizedSymbol = normalizeSymbol(symbol);
  if (!normalizedSymbol) return { success: false, provider: "TwelveData",
    symbol: normalizedSymbol, data: null, error: "A valid ticker symbol is required." };

  const cacheKey = twelveDataCacheKey("profile", normalizedSymbol);
  const cached = profileCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { success: true, provider: PROVIDER_LABEL, symbol: normalizedSymbol,
      data: cached.data, error: null, cache: { hit: true, status: "HIT" } };
  }
  if (pendingProfileRequests.has(cacheKey)) {
    return pendingProfileRequests.get(cacheKey);
  }

  const promise = fetchTwelveDataProfile(normalizedSymbol)
    .then((data) => {
      profileCache.set(cacheKey, {
        data,
        expiresAt: Date.now() + PROFILE_CACHE_TTL_MS
      });
      return { success: true, provider: PROVIDER_LABEL, symbol: normalizedSymbol,
        data, error: null, cache: { hit: false, status: "MISS" } };
    })
    .catch((error) => ({ success: false, provider: PROVIDER_LABEL,
      symbol: normalizedSymbol, data: null, error: error.message,
      code: error.code || "TWELVE_DATA_PROFILE_REQUEST_FAILED" }));
  pendingProfileRequests.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    pendingProfileRequests.delete(cacheKey);
  }
}

function clearTwelveDataProfileCache() {
  profileCache.clear();
  pendingProfileRequests.clear();
}

async function getHistoricalData(
  symbol,
  interval = "1day"
) {
  const normalizedSymbol =
    normalizeSymbol(symbol);

  const normalizedInterval =
    normalizeInterval(interval);

  const privatePersonalMode = ["1", "true", "yes", "on"].includes(
    String(process.env.PRIVATE_PERSONAL_PROVIDER_MODE || "").trim().toLowerCase()
  );

  if (privatePersonalMode && normalizedInterval && normalizedInterval !== "1day") {
    return {
      success: false, provider: "TwelveData", symbol: normalizedSymbol,
      interval: normalizedInterval,
      error: "Twelve Data Basic permits only 1day end-of-day history in private-personal mode.",
      code: "TWELVE_DATA_BASIC_INTRADAY_NOT_ENTITLED"
    };
  }

  const API_KEY =
    process.env.TWELVE_DATA_API_KEY;

  if (!normalizedSymbol) {
    return {
      success: false,
      provider: "TwelveData",
      symbol: normalizedSymbol,
      interval,
      error:
        "A valid ticker symbol is required.",
      code: "INVALID_SYMBOL"
    };
  }

  if (!normalizedInterval) {
    return {
      success: false,
      provider: "TwelveData",
      symbol: normalizedSymbol,
      interval,
      error:
        "Unsupported historical interval.",
      code: "INVALID_INTERVAL",
      supportedIntervals:
        Array.from(SUPPORTED_INTERVALS)
    };
  }

  if (!API_KEY) {
    return {
      success: false,
      provider: "TwelveData",
      symbol: normalizedSymbol,
      interval: normalizedInterval,
      error:
        "Twelve Data API key is not configured.",
      code:
        "TWELVE_DATA_API_KEY_MISSING"
    };
  }

  try {
    await reserveTwelveDataCredits("time_series", { mode: "queue" });
    const response = await axios.get(
      TWELVE_DATA_URL,
      {
        params: {
          symbol: normalizedSymbol,
          interval: normalizedInterval,
          outputsize: 100,
          order: "asc",
          format: "JSON"
        },
        headers: {
          Authorization:
            `apikey ${API_KEY}`
        },
        timeout: 15000
      }
    );

    const data = response.data;

    const providerError =
      getProviderError(data);

    if (providerError) {
      console.error(
        `[TwelveData] ${normalizedSymbol} ${normalizedInterval}:`,
        providerError
      );

      return {
        success: false,
        provider: "TwelveData",
        symbol: normalizedSymbol,
        interval: normalizedInterval,
        error: providerError,
        code:
          data?.code === 429
            ? "TWELVE_DATA_RATE_LIMIT"
            : "TWELVE_DATA_PROVIDER_ERROR"
      };
    }

    const values = data?.values;

    if (
      !Array.isArray(values) ||
      values.length === 0
    ) {
      return {
        success: false,
        provider: "TwelveData",
        symbol: normalizedSymbol,
        interval: normalizedInterval,
        error:
          "Twelve Data returned no historical OHLCV values.",
        code:
          "TWELVE_DATA_EMPTY_SERIES"
      };
    }

    const bars = values
      .map((item) => {
        const date =
          item?.datetime;

        const open =
          Number(item?.open);

        const high =
          Number(item?.high);

        const low =
          Number(item?.low);

        const close =
          Number(item?.close);

        const volume =
          Number(item?.volume);

        if (
          !date ||
          !Number.isFinite(open) ||
          !Number.isFinite(high) ||
          !Number.isFinite(low) ||
          !Number.isFinite(close)
        ) {
          return null;
        }

        return {
          date,
          open,
          high,
          low,
          close,
          volume:
            Number.isFinite(volume)
              ? volume
              : 0
        };
      })
      .filter(Boolean)
      .sort(
        (first, second) =>
          new Date(first.date) -
          new Date(second.date)
      );

    if (bars.length === 0) {
      return {
        success: false,
        provider: "TwelveData",
        symbol: normalizedSymbol,
        interval: normalizedInterval,
        error:
          "Twelve Data response contained no valid OHLCV bars.",
        code:
          "TWELVE_DATA_INVALID_BARS"
      };
    }

    return {
      success: true,
      provider: "TwelveData",
      symbol: normalizedSymbol,
      interval: normalizedInterval,
      data: {
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
      },
      bars,
      metadata: {
        exchange:
          data?.meta?.exchange || null,
        exchangeTimezone:
          data?.meta?.exchange_timezone || null,
        micCode:
          data?.meta?.mic_code || null,
        currency:
          data?.meta?.currency || null,
        interval:
          data?.meta?.interval ||
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
  } catch (error) {
    const responseData =
      error.response?.data;

    console.error(
      `[TwelveData] Request failed for ${normalizedSymbol} ${normalizedInterval}:`,
      responseData || error.message
    );

    return {
      success: false,
      provider: "TwelveData",
      symbol: normalizedSymbol,
      interval: normalizedInterval,
      error:
        responseData?.message ||
        error.message ||
        "Twelve Data request failed.",
      code:
        error.code === "TWELVE_DATA_CREDIT_BUDGET_EXCEEDED"
          ? error.code
          : error.response?.status === 429
          ? "TWELVE_DATA_RATE_LIMIT"
          : "TWELVE_DATA_REQUEST_FAILED",
      httpStatus:
        error.response?.status || null
    };
  }
}

// ==================================================
// Shared normalization helpers
// ==================================================

/*
  ==========================================================================
  Strict numeric parsing
  ==========================================================================

  Unavailable must stay unavailable, and JavaScript's numeric coercion works
  hard against that. `Number(null)`, `Number("")`, `Number("   ")` and
  `Number([])` are all 0, and 0 is finite - so a naive Number()/isFinite() pair
  silently turns a field the provider never supplied into a real-looking zero.
  On a quote that means a missing previous close renders as $0.00, a missing
  change renders as "no movement", and a missing timestamp renders as 1970.
  Every one of those is an assertion AzaLens has no evidence for.

  Blank-string rejection cannot be an equality test against "": a value of
  "   " or "\t\n" coerces to 0 exactly like "" does, and an earlier version of
  this guard checked only `=== ""` and let whitespace through.

  Truthiness is not usable here either, because 0 and "0" are legitimate values
  that must survive. So the accepted domain is stated by type instead:

    ACCEPTED  - a finite number, including 0 and negative numbers
              - a string that is non-blank after trimming AND parses to a
                finite number, including "0"

    REJECTED  - null, undefined
              - "", and any whitespace-only string
              - any non-numeric string
              - NaN, Infinity, -Infinity (as numbers or as strings)
              - booleans, arrays, objects, and every other type

  Rejected input returns `fallback`, which is null for every quote field, and
  never a number derived from coercion.
*/
function toFiniteNumber(value, fallback = null) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed === "") {
      return fallback;
    }

    const number = Number(trimmed);

    return Number.isFinite(number) ? number : fallback;
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
    process.env.TWELVE_DATA_API_KEY || ""
  ).trim();

  if (!apiKey) {
    const error = new Error(
      "Twelve Data API key is not configured."
    );
    error.code = "TWELVE_DATA_API_KEY_MISSING";
    throw error;
  }

  return apiKey;
}

/*
  Normalizes an axios/provider failure into a stable {message, code, httpStatus}
  triple. Timeouts and 429s must be distinguishable by code rather than by
  string matching, because `recordProviderResult` classifies on the code.
*/
function describeRequestFailure(error) {
  const httpStatus = error?.response?.status || null;
  const bodyMessage =
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    null;

  /*
    An error this adapter raised itself already carries a normalized code -
    a missing key, an unusable payload, or a provider error body that arrived
    with HTTP 200. Pass it through rather than re-deriving it, and never let a
    transport-level code like ECONNABORTED overwrite it.
  */
  if (
    typeof error?.code === "string" &&
    error.code.startsWith("TWELVE_DATA_")
  ) {
    return {
      message: error.message,
      code: error.code,
      httpStatus: error.httpStatus || httpStatus
    };
  }

  if (error?.code === "ECONNABORTED") {
    return {
      message: "Twelve Data request timed out.",
      code: "TWELVE_DATA_TIMEOUT",
      httpStatus
    };
  }

  if (httpStatus === 429) {
    return {
      message:
        bodyMessage ||
        "Twelve Data rate limit was reached.",
      code: "TWELVE_DATA_RATE_LIMIT",
      httpStatus
    };
  }

  if (httpStatus === 401 || httpStatus === 403) {
    return {
      message:
        bodyMessage ||
        "Twelve Data rejected the API key.",
      code: "TWELVE_DATA_UNAUTHORIZED",
      httpStatus
    };
  }

  return {
    message:
      bodyMessage ||
      error?.message ||
      "Twelve Data request failed.",
    code: "TWELVE_DATA_REQUEST_FAILED",
    httpStatus
  };
}

/*
  Twelve Data reports some failures with HTTP 200 and an error body, so a
  successful transport does not mean a successful lookup. Codes are surfaced
  the same way as transport failures.
*/
function describeBodyError(data) {
  const message = getProviderError(data);

  if (!message) {
    return null;
  }

  const code = Number(data?.code);

  if (code === 429) {
    return {
      message,
      code: "TWELVE_DATA_RATE_LIMIT",
      httpStatus: 429
    };
  }

  if (code === 401 || code === 403) {
    return {
      message,
      code: "TWELVE_DATA_UNAUTHORIZED",
      httpStatus: code
    };
  }

  return {
    message,
    code: "TWELVE_DATA_PROVIDER_ERROR",
    httpStatus: Number.isFinite(code) ? code : null
  };
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
    expiresInSeconds: roundNumber(remainingMs / 1000, 3)
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

function bypassCacheMetadata(ttlMs) {
  return {
    status: "BYPASS",
    hit: false,
    ttlSeconds: Math.round(ttlMs / 1000),
    ageSeconds: 0,
    expiresInSeconds: 0
  };
}

function missCacheMetadata(ttlMs) {
  return {
    status: "MISS",
    hit: false,
    ttlSeconds: Math.round(ttlMs / 1000),
    ageSeconds: 0,
    expiresInSeconds: 0
  };
}

// ==================================================
// Live Quote
// ==================================================

/*
  A quote is only usable if it carries a finite, positive last price. Anything
  else - a null close, a string that will not parse, an error body that reached
  this far - is a failure, not a zero. Never let an unavailable price become 0.
*/
function isUsableQuote(quote) {
  /*
    The usability check must apply the SAME accepted domain as the field
    normalizer below. If it used a looser coercion, a payload whose `close` was
    `true` or `["101"]` would pass validation and then normalize to a null
    price - a "successful" quote carrying no price at all, which is worse than
    an honest failure.
  */
  const close = toFiniteNumber(quote?.close);

  return (
    quote &&
    typeof quote === "object" &&
    close !== null &&
    close > 0
  );
}

/*
  Maps the documented `/quote` response onto the normalized AzaLens quote
  contract. Only fields AzaLens actually consumes are normalized; provider-only
  fields stay in `providerMetadata` rather than widening the mounted contract.

  Two units are pinned here on purpose, because both are easy to get wrong and
  neither is self-describing in the payload:

    - `percent_change` is already a PERCENTAGE. A 1.5% move arrives as 1.5, and
      it is passed through unchanged. It must never be divided by 100, and a
      fractional 0.015 must never be accepted as equivalent.
    - `timestamp` is a Unix SECOND count, the same unit the existing normalized
      contract already carries, so it passes through unchanged too. Downstream
      code (analysisTrustService, supportResistanceEngine) distinguishes seconds
      from milliseconds by magnitude, so silently converting here would corrupt
      every displayed quote time.
*/
function normalizeTwelveDataQuote(symbol, quote) {
  return {
    success: true,
    provider: PROVIDER_LABEL,
    symbol,

    data: {
      symbol,
      company: quote.name || null,
      exchange: quote.exchange || null,
      currency: quote.currency || null,

      price: toFiniteNumber(quote.close),
      previousClose: toFiniteNumber(quote.previous_close),
      open: toFiniteNumber(quote.open),
      high: toFiniteNumber(quote.high),
      low: toFiniteNumber(quote.low),
      change: toFiniteNumber(quote.change),
      changePercent: toFiniteNumber(quote.percent_change),
      timestamp: toFiniteNumber(quote.timestamp)
    },

    /*
      Session and venue context Twelve Data supplies and AzaLens does not yet
      consume. It is reported rather than dropped so PR B can decide the
      delayed/real-time disclosure from observed provider evidence instead of
      an assumption. It is deliberately outside `data` so the mounted contract
      is unchanged.
    */
    providerMetadata: {
      isMarketOpen:
        typeof quote.is_market_open === "boolean"
          ? quote.is_market_open
          : null,
      micCode: quote.mic_code || null,
      datetime: quote.datetime || null,
      lastQuoteAt: toFiniteNumber(quote.last_quote_at)
    },

    companyProfile: null,
    limitations: []
  };
}

async function fetchFreshTwelveDataQuote(symbol) {
  const apiKey = getApiKey();

  await reserveTwelveDataCredits("quote", { mode: "queue" });

  const response = await axios.get(
    `${TWELVE_DATA_BASE_URL}/quote`,
    {
      params: { symbol, apikey: apiKey },
      timeout: REQUEST_TIMEOUT_MS
    }
  );

  const quote = response?.data;
  const bodyError = describeBodyError(quote);

  if (bodyError) {
    const error = new Error(bodyError.message);
    error.code = bodyError.code;
    error.httpStatus = bodyError.httpStatus;
    throw error;
  }

  if (!isUsableQuote(quote)) {
    const error = new Error(
      `Twelve Data returned no valid live quote for ${symbol}.`
    );
    error.code = "TWELVE_DATA_INVALID_QUOTE";
    throw error;
  }

  return normalizeTwelveDataQuote(symbol, quote);
}

function twelveDataQuoteFailure(symbol, error, cache) {
  const described = describeRequestFailure(error);

  return {
    success: false,
    provider: PROVIDER_LABEL,
    symbol,
    error: described.message,
    code: described.code,
    httpStatus: described.httpStatus,
    cache
  };
}

async function getTwelveDataQuote(symbol) {
  const normalizedSymbol = normalizeSymbol(symbol);

  if (!normalizedSymbol) {
    return {
      success: false,
      provider: PROVIDER_LABEL,
      symbol: normalizedSymbol,
      error: "A valid ticker symbol is required.",
      code: "INVALID_SYMBOL",
      httpStatus: null,
      cache: bypassCacheMetadata(QUOTE_CACHE_TTL_MS)
    };
  }

  const cacheKey = twelveDataCacheKey("quote", normalizedSymbol);
  const cachedEntry = readFreshCache(quoteCache, cacheKey);

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

  if (pendingQuoteRequests.has(cacheKey)) {
    try {
      const pendingResult =
        await pendingQuoteRequests.get(cacheKey);
      const settledEntry = readFreshCache(
        quoteCache,
        cacheKey
      );

      return {
        ...pendingResult,
        cache: createCacheMetadata({
          hit: true,
          status: "COALESCED",
          storedAt:
            settledEntry?.storedAt || Date.now(),
          expiresAt:
            settledEntry?.expiresAt ||
            Date.now() + QUOTE_CACHE_TTL_MS,
          ttlMs: QUOTE_CACHE_TTL_MS
        })
      };
    } catch (error) {
      return twelveDataQuoteFailure(
        normalizedSymbol,
        error,
        missCacheMetadata(QUOTE_CACHE_TTL_MS)
      );
    }
  }

  const requestPromise = (async () => {
    const freshResult =
      await fetchFreshTwelveDataQuote(normalizedSymbol);

    const cacheEntry = writeCache(
      quoteCache,
      cacheKey,
      freshResult,
      QUOTE_CACHE_TTL_MS
    );

    return { result: freshResult, cacheEntry };
  })();

  const derivedQuotePromise = requestPromise.then(
    ({ result }) => result
  );

  /*
    Same invariant the Finnhub adapter carries, for the same reason, because
    this is the same coalescing shape.

    The derived promise is only awaited by a concurrent caller that happens to
    arrive while it is pending. If none does, nothing attaches a handler, and a
    rejection here becomes an unhandled rejection that can terminate the
    process. The no-op .catch marks it handled for Node's tracking without
    swallowing the rejection for a real awaiter, because .catch() returns a NEW
    promise rather than mutating this one.

    backend/tests/testTwelveDataQuoteRejectionSafety.js proves it.
  */
  derivedQuotePromise.catch(() => {});

  pendingQuoteRequests.set(cacheKey, derivedQuotePromise);

  try {
    const { result, cacheEntry } = await requestPromise;

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
    return twelveDataQuoteFailure(
      normalizedSymbol,
      error,
      missCacheMetadata(QUOTE_CACHE_TTL_MS)
    );
  } finally {
    pendingQuoteRequests.delete(cacheKey);
  }
}

function clearTwelveDataQuoteCache() {
  quoteCache.clear();
  pendingQuoteRequests.clear();
}

// ==================================================
// Equity-only symbol search
// ==================================================

function isSupportedEquityType(instrumentType) {
  return SUPPORTED_EQUITY_TYPES.includes(
    String(instrumentType || "").trim().toLowerCase()
  );
}

/*
  Twelve Data returns `exchange` and `mic_code` as first-class fields, so the
  exchange is read directly. AzaLens must NOT reproduce the Finnhub adapter's
  `displaySymbol.split(":")` heuristic here: it exists only because Finnhub has
  no exchange field, and guessing a venue from a display string is exactly how
  a foreign listing gets silently substituted for a US primary.

  Duplicate tickers are deduplicated on symbol + venue rather than on symbol
  alone, so two genuinely different listings of the same ticker both survive
  and stay distinguishable. Collapsing them on symbol would silently pick one
  venue and hide the ambiguity from the person searching.
*/
function normalizeSearchRow(row) {
  const symbol = normalizeSymbol(row?.symbol);
  const exchange = String(row?.exchange || "").trim() || null;
  const micCode = String(row?.mic_code || "").trim() || null;

  return {
    symbol,
    name:
      String(row?.instrument_name || "").trim() ||
      symbol,
    exchange,
    micCode,
    country: String(row?.country || "").trim() || null,
    currency: String(row?.currency || "").trim() || null,
    securityType:
      String(row?.instrument_type || "").trim() || null,
    provider: PROVIDER_LABEL
  };
}

function isUsableSearchSymbol(symbol) {
  return (
    symbol.length > 0 &&
    symbol.length <= 15 &&
    /^[A-Z0-9.\-]+$/.test(symbol)
  );
}

function searchDedupeKey(result) {
  return [
    result.symbol,
    result.micCode || result.exchange || ""
  ].join("|");
}

async function searchTwelveDataEquities(query, limit = 12) {
  const normalizedQuery = String(query || "").trim();

  if (
    normalizedQuery.length < 1 ||
    normalizedQuery.length > 80
  ) {
    return [];
  }

  const cacheKey = twelveDataCacheKey(
    "search",
    normalizedQuery.toLowerCase()
  );
  const cachedEntry = readFreshCache(
    symbolSearchCache,
    cacheKey
  );

  if (cachedEntry) {
    return cachedEntry.value.results.slice(0, limit);
  }

  if (pendingSymbolSearchRequests.has(cacheKey)) {
    const pending = await pendingSymbolSearchRequests.get(
      cacheKey
    );

    return pending.slice(0, limit);
  }

  const requestPromise = (async () => {
    const apiKey = getApiKey();

    await reserveTwelveDataCredits("symbol_search", { mode: "queue" });

    const response = await axios.get(
      `${TWELVE_DATA_BASE_URL}/symbol_search`,
      {
        params: {
          symbol: normalizedQuery,
          outputsize: 120,
          apikey: apiKey
        },
        timeout: REQUEST_TIMEOUT_MS
      }
    );

    const body = response?.data;
    const bodyError = describeBodyError(body);

    if (bodyError) {
      const error = new Error(bodyError.message);
      error.code = bodyError.code;
      error.httpStatus = bodyError.httpStatus;
      throw error;
    }

    /*
      A search envelope must be a plain object. Anything else - a bare array, a
      string, a null - is a protocol failure, and it must not be reported as
      "no matches": telling someone their ticker does not exist when the
      provider simply did not answer is the more damaging of the two lies.

      A well-formed envelope carrying no rows is a different case and stays an
      honest empty list below, because that is what Twelve Data returns for a
      query that genuinely matched nothing.
    */
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      const error = new Error(
        "Twelve Data returned an invalid response."
      );
      error.code = "TWELVE_DATA_PROVIDER_ERROR";
      throw error;
    }

    const rows = Array.isArray(body.data)
      ? body.data
      : [];

    const seen = new Set();
    const equities = [];

    for (const row of rows) {
      if (!isSupportedEquityType(row?.instrument_type)) {
        continue;
      }

      const normalized = normalizeSearchRow(row);

      if (!isUsableSearchSymbol(normalized.symbol)) {
        continue;
      }

      const dedupeKey = searchDedupeKey(normalized);

      if (seen.has(dedupeKey)) {
        continue;
      }

      seen.add(dedupeKey);
      equities.push(normalized);
    }

    /*
      Provenance travels with the cached record, not just with the items, so a
      cache entry can never be mistaken for another provider's work even if the
      two stores were ever merged.
    */
    writeCache(
      symbolSearchCache,
      cacheKey,
      { provider: PROVIDER_LABEL, results: equities },
      SYMBOL_SEARCH_CACHE_TTL_MS
    );

    return equities;
  })();

  const derivedSearchPromise = requestPromise.then(
    (results) => results
  );

  // Same unhandled-rejection invariant as the quote path.
  derivedSearchPromise.catch(() => {});

  pendingSymbolSearchRequests.set(
    cacheKey,
    derivedSearchPromise
  );

  try {
    const results = await requestPromise;

    return results.slice(0, limit);
  } finally {
    pendingSymbolSearchRequests.delete(cacheKey);
  }
}

function clearTwelveDataSearchCache() {
  symbolSearchCache.clear();
  pendingSymbolSearchRequests.clear();
}

function getTwelveDataCacheKeysForTests() {
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
  clearTwelveDataProfileCache,
  clearTwelveDataQuoteCache,
  clearTwelveDataSearchCache,
  getHistoricalData,
  getTwelveDataCacheKeysForTests,
  getTwelveDataCompanyProfile,
  getTwelveDataQuote,
  normalizeInterval,
  searchTwelveDataEquities,
  selectCanonicalListing,
  SUPPORTED_EQUITY_TYPES,
  SUPPORTED_INTERVALS
};
