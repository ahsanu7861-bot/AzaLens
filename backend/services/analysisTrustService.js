const TRUST_CONTRACT_VERSION = "1.0.0";
const TECHNICAL_METHODOLOGY_VERSION = "1.0.0";
const AAOIFI_METHODOLOGY_VERSION = "0.5.0";

const DEFAULT_MARKET_DELAY_MINUTES = 15;
const SHARIAH_STALE_AFTER_HOURS = 24 * 7;
const MINIMUM_RELIABLE_HISTORY_BARS = 50;
const SHARIAH_DEBT_TO_ASSETS_BOUNDARY = 0.3;
const SHARIAH_IMPERMISSIBLE_INCOME_BOUNDARY = 0.05;

function toFiniteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/*
  ==========================================================================
  Market-data delay, named for the capability rather than for one provider
  ==========================================================================

  This value drives a user-visible claim: whether a displayed quote is labelled
  realtime or delayed. It was read from FINNHUB_DELAY_MINUTES, which becomes a
  lie the moment the quote provider is not Finnhub.

  The variable is now MARKET_DATA_DELAY_MINUTES. FINNHUB_DELAY_MINUTES is still
  honoured as a deprecated alias so an existing deployment keeps working without
  an environment change - PR A must not require one.

  The 15-minute default is deliberately unchanged. Twelve Data's `/quote` is
  documented as real-time, but AzaLens has not verified what its own plan and
  feed actually deliver, and publishing "realtime" on an unverified assumption
  would be a worse error than publishing a conservative delay. Choosing the
  disclosed figure for a Twelve Data quote is a PR B decision that needs
  observed provider evidence, not a guess made here.

  `source` is returned alongside the value so the resolution path is
  internally observable rather than inferred.
*/
const MARKET_DELAY_VARIABLE = "MARKET_DATA_DELAY_MINUTES";
const LEGACY_MARKET_DELAY_VARIABLE = "FINNHUB_DELAY_MINUTES";

/*
  ==========================================================================
  The delay domain is NARROWER than the provider-number domain
  ==========================================================================

  These are two different semantic domains and must not be collapsed into one
  helper:

    - a PROVIDER NUMERIC FIELD may legitimately be negative. A price change of
      -3.94, a percent change of -1.76 and a negative Shariah ratio are all real
      values, so toFiniteNumber above accepts the whole signed finite range.

    - a MARKET DELAY may not. Minutes are a duration, and a negative duration
      is meaningless. It is also actively dangerous here, because the resolved
      count is what decides whether AzaLens publishes "delayed" or "realtime":
      `delayMinutes > 0 ? "delayed" : "realtime"` treats any value <= 0 as
      realtime, so a configured -5 would have made the product claim real-time
      market data on the strength of a typo.

  Zero is emphatically NOT rejected. An explicit 0 or "0" is the established
  deliberate way to configure realtime, and it must keep working.

    ACCEPTED  - a finite number >= 0
              - a non-blank numeric string that parses to a finite number >= 0
                (padding is allowed: " 12 ")

    REJECTED  - negative numbers and negative numeric strings
              - null, undefined, "", any whitespace-only string
              - any non-numeric string, NaN, Infinity, -Infinity
              - booleans, arrays, objects, every other type

  Rejected input falls through to the next source, and finally to the disclosed
  15-minute default - the conservative answer, because over-stating freshness is
  the more damaging error.
*/
function resolveMarketDelay(env = process.env) {
  const primary = toFiniteNumber(env[MARKET_DELAY_VARIABLE], null);

  if (primary !== null) {
    return {
      minutes: primary,
      source: MARKET_DELAY_VARIABLE,
      deprecatedAliasInUse: false,
    };
  }

  const legacy = toFiniteNumber(
    env[LEGACY_MARKET_DELAY_VARIABLE],
    null
  );

  if (legacy !== null) {
    return {
      minutes: legacy,
      source: LEGACY_MARKET_DELAY_VARIABLE,
      deprecatedAliasInUse: true,
    };
  }

  return {
    minutes: DEFAULT_MARKET_DELAY_MINUTES,
    source: "DEFAULT",
    deprecatedAliasInUse: false,
  };
}

function toIsoTimestamp(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numericValue = Number(value);
  const date = Number.isFinite(numericValue)
    ? new Date(
        numericValue < 1_000_000_000_000
          ? numericValue * 1000
          : numericValue
      )
    : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function hoursSince(value, now = Date.now()) {
  const timestamp = toIsoTimestamp(value);

  if (!timestamp) {
    return null;
  }

  return Math.max(
    0,
    (now - new Date(timestamp).getTime()) / (60 * 60 * 1000)
  );
}

function uniqueStrings(values) {
  return [
    ...new Set(
      values.filter(
        (value) => typeof value === "string" && value.trim()
      )
    ),
  ];
}

function getHistoryBarCount(history) {
  if (Array.isArray(history?.bars)) {
    return history.bars.length;
  }

  if (Array.isArray(history?.data?.c)) {
    return history.data.c.length;
  }

  return 0;
}

function isHistoryCacheHit(history) {
  return (
    history?.performance?.cacheHit === true ||
    history?.cache?.hit === true ||
    String(history?.cache || "").toUpperCase() === "HIT"
  );
}

function resolveHistoryState(history) {
  const barCount = getHistoryBarCount(history);

  if (history?.success !== true || barCount === 0) {
    return "unavailable";
  }

  if (barCount < MINIMUM_RELIABLE_HISTORY_BARS) {
    return "partial";
  }

  return isHistoryCacheHit(history) ? "cached" : "fresh";
}

function resolveEvaluationTime(generatedAt) {
  const timestamp = new Date(generatedAt).getTime();

  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function isShariahEvidenceStale(shariah, generatedAt) {
  const shariahTimestamp = toIsoTimestamp(
    shariah?.verification?.lastCheckedAt ||
      shariah?.metadata?.providerMetadata?.fetchedAt ||
      shariah?.metadata?.generatedAt
  );
  const shariahAgeHours = hoursSince(
    shariahTimestamp,
    resolveEvaluationTime(generatedAt)
  );

  return (
    shariah?.verification?.isStale === true ||
    (shariahAgeHours !== null &&
      shariahAgeHours > SHARIAH_STALE_AFTER_HOURS)
  );
}

function resolveMarketState({ market, priceContext }) {
  if (priceContext?.livePriceAvailable !== true) {
    return priceContext?.historicalCloseAvailable === true
      ? "fallback"
      : "unavailable";
  }

  if (market?.cache?.hit === true) {
    return "cached";
  }

  const delayMinutes = resolveMarketDelay().minutes;

  return delayMinutes > 0 ? "delayed" : "realtime";
}

function buildAnalysisMetadata({
  symbol,
  generatedAt,
  market,
  history,
  priceContext,
  fundamentals,
  shariah,
  dataQuality,
}) {
  const delayMinutes = Math.max(
    0,
    resolveMarketDelay().minutes
  );
  const marketState = resolveMarketState({ market, priceContext });
  const quoteTimestamp =
    toIsoTimestamp(market?.data?.timestamp) || generatedAt;
  const historicalTimestamp =
    toIsoTimestamp(
      history?.metadata?.latestDate ||
        history?.dataQuality?.latestHistoricalDate
    );
  const historyBarCount = getHistoryBarCount(history);
  const historyState = resolveHistoryState(history);
  const shariahTimestamp =
    toIsoTimestamp(
      shariah?.verification?.lastCheckedAt ||
        shariah?.metadata?.providerMetadata?.fetchedAt ||
        shariah?.metadata?.generatedAt
    );
  const shariahStale = isShariahEvidenceStale(
    shariah,
    generatedAt
  );
  const shariahStatus = shariah?.summary?.status || "UNKNOWN";
  const shariahUnavailable =
    shariah?.success !== true || shariahStatus === "UNKNOWN";
  const shariahState = shariahUnavailable
    ? "unavailable"
    : shariahStale
      ? "stale"
      : shariah?.metadata?.providerMetadata?.fromCache === true
        ? "cached"
        : "fresh";
  const dataQualityState = String(
    dataQuality?.status || ""
  ).toLowerCase();
  const dataQualityRequiresReview = [
    "degraded",
    "unavailable",
  ].includes(dataQualityState);
  const reviewRequired =
    ["fallback", "stale", "unavailable"].includes(marketState) ||
    ["partial", "unavailable"].includes(historyState) ||
    shariahUnavailable ||
    shariahStale ||
    dataQualityRequiresReview;
  const providerErrors = uniqueStrings([
    market?.success === false ? market?.error : null,
    history?.success === false ? history?.error : null,
    shariah?.providerError?.message,
  ]);
  const knownLimitations = uniqueStrings([
    marketState === "delayed"
      ? `Market quotes may be delayed by up to ${delayMinutes} minutes.`
      : null,
    marketState === "cached"
      ? "The displayed quote came from the provider cache."
      : null,
    marketState === "fallback"
      ? "Live quote unavailable; the latest completed historical close is displayed."
      : null,
    historyState === "cached"
      ? "Historical OHLCV data came from the provider cache."
      : null,
    historyState === "partial"
      ? `Historical evidence contains ${historyBarCount} bars; at least ${MINIMUM_RELIABLE_HISTORY_BARS} bars are required for full technical coverage.`
      : null,
    historyState === "unavailable"
      ? "Historical OHLCV evidence is unavailable."
      : null,
    shariahUnavailable
      ? "AAOIFI screening evidence is unavailable; Shariah status requires review."
      : null,
    shariahStale
      ? "AAOIFI screening evidence is stale and requires review."
      : null,
    ...(Array.isArray(market?.limitations)
      ? market.limitations
      : []),
    ...(Array.isArray(fundamentals?.limitations)
      ? fundamentals.limitations
      : []),
    ...(Array.isArray(dataQuality?.warnings)
      ? dataQuality.warnings
      : []),
  ]);
  const evidenceChecks = [
    priceContext?.analysisPrice !== null &&
      priceContext?.analysisPrice !== undefined,
    historyState === "fresh" || historyState === "cached",
    shariah?.success === true &&
      shariahStatus !== "UNKNOWN" &&
      !shariahStale,
  ];
  const availableEvidence = evidenceChecks.filter(Boolean).length;

  return {
    contractVersion: TRUST_CONTRACT_VERSION,
    state: marketState,
    asOf: quoteTimestamp,
    delayMinutes: marketState === "delayed" ? delayMinutes : null,
    marketSource: market?.provider || null,
    filingSource:
      shariah?.provider?.name ||
      shariah?.businessActivity?.sourceUrl ||
      null,
    reviewRequired,
    symbol,
    generatedAt,
    analysisTimeframe: history?.interval || "1day",
    cacheStatus: {
      quote: market?.cache?.status || "UNKNOWN",
      history: history?.cache || "UNKNOWN",
      shariah:
        shariah?.metadata?.providerMetadata?.fromCache === true
          ? "HIT"
          : "MISS",
    },
    methodologyVersions: {
      technical: TECHNICAL_METHODOLOGY_VERSION,
      shariah: AAOIFI_METHODOLOGY_VERSION,
    },
    evidenceCompleteness: {
      available: availableEvidence,
      total: evidenceChecks.length,
      percent: Math.round(
        (availableEvidence / evidenceChecks.length) * 100
      ),
      status:
        availableEvidence === evidenceChecks.length
          ? "complete"
          : availableEvidence === 0
            ? "unavailable"
            : "partial",
    },
    sources: {
      quote: {
        provider: market?.provider || null,
        state: marketState,
        asOf: quoteTimestamp,
        delayMinutes: marketState === "delayed" ? delayMinutes : null,
        fromCache: market?.cache?.hit === true,
        error: market?.success === false ? market?.error || null : null,
      },
      history: {
        provider: history?.provider || null,
        state: historyState,
        asOf: historicalTimestamp,
        interval: history?.interval || "1day",
        fromCache: isHistoryCacheHit(history),
        barCount: historyBarCount,
        minimumBarsRequired: MINIMUM_RELIABLE_HISTORY_BARS,
        reviewRequired: ["partial", "unavailable"].includes(historyState),
        error: historyState === "unavailable" ? history?.error || null : null,
      },
      fundamentals: {
        provider:
          fundamentals?.provider || null,
        state:
          fundamentals?.status ===
          "PARTIAL"
            ? "partial"
            : "unavailable",
        asOf:
          toIsoTimestamp(
            fundamentals?.asOf
          ),
        reviewRequired:
          fundamentals?.status !==
          "PARTIAL",
        error:
          fundamentals?.status ===
          "UNAVAILABLE"
            ? "Verified company profile is unavailable."
            : null,
      },
      shariah: {
        provider: shariah?.provider?.name || null,
        methodology: "AAOIFI",
        state: shariahState,
        asOf: shariahTimestamp,
        fromCache:
          shariah?.metadata?.providerMetadata?.fromCache === true,
        reviewRequired: shariahUnavailable || shariahStale,
        error: shariah?.providerError?.message || null,
      },
    },
    providerErrors,
    knownLimitations,
  };
}

function findReferencePrice(reference) {
  return toFiniteNumber(
    reference?.zone?.center ??
      reference?.zone?.low ??
      reference?.zone?.high
  );
}

function formatPrice(value, currency = "USD") {
  if (!Number.isFinite(value)) {
    return "an unavailable price";
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function buildTechnicalInvalidation({
  market,
  priceContext,
  history,
  agreement,
  confluence,
  indicators,
}) {
  const direction = String(
    agreement?.direction || agreement?.agreement || ""
  ).toLowerCase();
  const bullish = direction.includes("bull");
  const bearish = direction.includes("bear");
  const reference = bullish
    ? confluence?.nearestSupport
    : bearish
      ? confluence?.nearestResistance
      : null;
  const triggerPrice = findReferencePrice(reference);
  const completedClose = toFiniteNumber(
    history?.bars?.[history.bars.length - 1]?.close ??
      priceContext?.latestHistoricalClose
  );
  const relativeVolume = toFiniteNumber(indicators?.rvol?.rvol);
  const currency = market?.data?.currency || "USD";

  if (
    (!bullish && !bearish) ||
    triggerPrice === null ||
    completedClose === null
  ) {
    return {
      status: "unknown",
      rule:
        "A confirmed directional thesis and nearby technical reference are required.",
      triggerPrice,
      observedValue: completedClose,
      evidence:
        "Technical invalidation could not be evaluated from the available evidence.",
    };
  }

  const priceViolated = bullish
    ? completedClose < triggerPrice
    : completedClose > triggerPrice;
  const volumeUnavailable = relativeVolume === null;
  const volumeConfirmed =
    !volumeUnavailable && relativeVolume >= 1.5;
  const violated = priceViolated && volumeConfirmed;
  const status =
    priceViolated && volumeUnavailable
      ? "unknown"
      : violated
        ? "violated"
        : "intact";
  const comparison = bullish ? "below" : "above";

  return {
    status,
    rule: `Daily close ${comparison} ${formatPrice(
      triggerPrice,
      currency
    )} with relative volume at or above 1.5×.`,
    triggerPrice,
    observedValue: completedClose,
    relativeVolume,
    evidence:
      relativeVolume === null
        ? `Latest completed close: ${formatPrice(
            completedClose,
            currency
          )}; relative volume unavailable.`
        : `Latest completed close: ${formatPrice(
            completedClose,
            currency
          )}; RVOL: ${relativeVolume.toFixed(2)}×.`,
  };
}

function buildFundamentalInvalidation({ shariah, generatedAt }) {
  const status = shariah?.summary?.status || "UNKNOWN";
  const shariahStale = isShariahEvidenceStale(
    shariah,
    generatedAt
  );
  const debtToAssets = toFiniteNumber(
    shariah?.financialScreen?.ratios?.debtToAssets
  );
  const impermissibleIncome = toFiniteNumber(
    shariah?.businessActivity?.revenueRatios?.impermissible
  );
  const evidenceAvailable =
    shariah?.success === true &&
    status !== "UNKNOWN" &&
    !shariahStale;
  const boundaryViolated =
    status === "NON_COMPLIANT" ||
    (debtToAssets !== null &&
      debtToAssets > SHARIAH_DEBT_TO_ASSETS_BOUNDARY) ||
    (impermissibleIncome !== null &&
      impermissibleIncome > SHARIAH_IMPERMISSIBLE_INCOME_BOUNDARY);

  return {
    status: !evidenceAvailable
      ? "unknown"
      : boundaryViolated
        ? "violated"
        : "intact",
    rule:
      "AAOIFI status becomes non-compliant, debt-to-assets exceeds 30%, or impermissible income exceeds 5%.",
    debtToAssets,
    impermissibleIncome,
    evidence: !evidenceAvailable
      ? shariahStale
        ? "AAOIFI evidence is stale; review is required."
        : "Verified AAOIFI evidence is unavailable; review is required."
      : `AAOIFI status: ${status}; debt/assets: ${
          debtToAssets === null
            ? "unavailable"
            : `${(debtToAssets * 100).toFixed(2)}%`
        }; impermissible income: ${
          impermissibleIncome === null
            ? "unavailable"
            : `${(impermissibleIncome * 100).toFixed(2)}%`
        }.`,
  };
}

function buildThesisInvalidation(input) {
  const technical = buildTechnicalInvalidation(input);
  const fundamental = buildFundamentalInvalidation(input);
  const statuses = [technical.status, fundamental.status];
  const status = statuses.includes("violated")
    ? "violated"
    : statuses.every((value) => value === "intact")
      ? "intact"
      : "unknown";

  return {
    status,
    technical: technical.rule,
    fundamental: fundamental.rule,
    evaluatedAt: input.generatedAt || new Date().toISOString(),
    methodologyVersion: TECHNICAL_METHODOLOGY_VERSION,
    evidence: {
      technical,
      fundamental,
    },
  };
}

module.exports = {
  buildAnalysisMetadata,
  buildThesisInvalidation,
  resolveMarketDelay,
  constants: {
    MARKET_DELAY_VARIABLE,
    LEGACY_MARKET_DELAY_VARIABLE,
    TRUST_CONTRACT_VERSION,
    TECHNICAL_METHODOLOGY_VERSION,
    AAOIFI_METHODOLOGY_VERSION,
    DEFAULT_MARKET_DELAY_MINUTES,
    SHARIAH_STALE_AFTER_HOURS,
    SHARIAH_DEBT_TO_ASSETS_BOUNDARY,
    SHARIAH_IMPERMISSIBLE_INCOME_BOUNDARY,
    MINIMUM_RELIABLE_HISTORY_BARS,
  },
};
