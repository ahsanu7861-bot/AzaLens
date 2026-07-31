const axios = require("axios");

const TWELVE_DATA_URL =
  "https://api.twelvedata.com/time_series";
const TWELVE_DATA_BASE_URL = "https://api.twelvedata.com";
const PROFILE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const profileCache = new Map();
const pendingProfileRequests = new Map();

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

  const cached = profileCache.get(normalizedSymbol);
  if (cached && cached.expiresAt > Date.now()) {
    return { success: true, provider: "TwelveData", symbol: normalizedSymbol,
      data: cached.data, error: null, cache: { hit: true, status: "HIT" } };
  }
  if (pendingProfileRequests.has(normalizedSymbol)) {
    return pendingProfileRequests.get(normalizedSymbol);
  }

  const promise = fetchTwelveDataProfile(normalizedSymbol)
    .then((data) => {
      profileCache.set(normalizedSymbol, {
        data,
        expiresAt: Date.now() + PROFILE_CACHE_TTL_MS
      });
      return { success: true, provider: "TwelveData", symbol: normalizedSymbol,
        data, error: null, cache: { hit: false, status: "MISS" } };
    })
    .catch((error) => ({ success: false, provider: "TwelveData",
      symbol: normalizedSymbol, data: null, error: error.message }));
  pendingProfileRequests.set(normalizedSymbol, promise);
  try {
    return await promise;
  } finally {
    pendingProfileRequests.delete(normalizedSymbol);
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
        error.response?.status === 429
          ? "TWELVE_DATA_RATE_LIMIT"
          : "TWELVE_DATA_REQUEST_FAILED",
      httpStatus:
        error.response?.status || null
    };
  }
}

module.exports = {
  clearTwelveDataProfileCache,
  getHistoricalData,
  getTwelveDataCompanyProfile,
  normalizeInterval,
  selectCanonicalListing,
  SUPPORTED_INTERVALS
};
