const TRUST_CONTRACT_VERSION = "1.0.0";
const TECHNICAL_METHODOLOGY_VERSION = "1.0.0";
const AAOIFI_METHODOLOGY_VERSION = "0.5.0";

const DEFAULT_MARKET_DELAY_MINUTES = 15;
const SHARIAH_STALE_AFTER_HOURS = 24 * 7;

function toFiniteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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

function resolveMarketState({ market, priceContext }) {
  if (priceContext?.livePriceAvailable !== true) {
    return priceContext?.historicalCloseAvailable === true
      ? "fallback"
      : "unavailable";
  }

  if (market?.cache?.hit === true) {
    return "cached";
  }

  const delayMinutes = toFiniteNumber(
    process.env.FINNHUB_DELAY_MINUTES,
    DEFAULT_MARKET_DELAY_MINUTES
  );

  return delayMinutes > 0 ? "delayed" : "realtime";
}

function buildAnalysisMetadata({
  symbol,
  generatedAt,
  market,
  history,
  priceContext,
  shariah,
  dataQuality,
}) {
  const delayMinutes = Math.max(
    0,
    toFiniteNumber(
      process.env.FINNHUB_DELAY_MINUTES,
      DEFAULT_MARKET_DELAY_MINUTES
    )
  );
  const marketState = resolveMarketState({ market, priceContext });
  const quoteTimestamp =
    toIsoTimestamp(market?.data?.timestamp) || generatedAt;
  const historicalTimestamp =
    toIsoTimestamp(
      history?.metadata?.latestDate ||
        history?.dataQuality?.latestHistoricalDate
    );
  const shariahTimestamp =
    toIsoTimestamp(
      shariah?.verification?.lastCheckedAt ||
        shariah?.metadata?.providerMetadata?.fetchedAt ||
        shariah?.metadata?.generatedAt
    );
  const shariahAgeHours = hoursSince(shariahTimestamp);
  const shariahStale =
    shariah?.verification?.isStale === true ||
    (shariahAgeHours !== null &&
      shariahAgeHours > SHARIAH_STALE_AFTER_HOURS);
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
    shariahUnavailable
      ? "AAOIFI screening evidence is unavailable; Shariah status requires review."
      : null,
    shariahStale
      ? "AAOIFI screening evidence is stale and requires review."
      : null,
    ...(Array.isArray(market?.limitations)
      ? market.limitations
      : []),
    ...(Array.isArray(dataQuality?.warnings)
      ? dataQuality.warnings
      : []),
  ]);
  const evidenceChecks = [
    priceContext?.analysisPrice !== null &&
      priceContext?.analysisPrice !== undefined,
    history?.success === true,
    shariah?.success === true && shariahStatus !== "UNKNOWN",
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
    reviewRequired:
      ["fallback", "stale", "unavailable"].includes(marketState),
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
        state: history?.success === true ? "fresh" : "unavailable",
        asOf: historicalTimestamp,
        interval: history?.interval || "1day",
        fromCache: history?.performance?.cacheHit === true,
        error: history?.success === false ? history?.error || null : null,
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

function buildFundamentalInvalidation({ shariah }) {
  const status = shariah?.summary?.status || "UNKNOWN";
  const debtToAssets = toFiniteNumber(
    shariah?.financialScreen?.ratios?.debtToAssets
  );
  const impermissibleIncome = toFiniteNumber(
    shariah?.businessActivity?.revenueRatios?.impermissible
  );
  const evidenceAvailable =
    shariah?.success === true && status !== "UNKNOWN";
  const boundaryViolated =
    status === "NON_COMPLIANT" ||
    (debtToAssets !== null && debtToAssets > 0.3) ||
    (impermissibleIncome !== null && impermissibleIncome > 0.05);

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
      ? "Verified AAOIFI evidence is unavailable; review is required."
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
  constants: {
    TRUST_CONTRACT_VERSION,
    TECHNICAL_METHODOLOGY_VERSION,
    AAOIFI_METHODOLOGY_VERSION,
  },
};
