const TRUST_CONTRACT_VERSION = "1.0.0";
const TECHNICAL_METHODOLOGY_VERSION = "1.0.0";
const AAOIFI_METHODOLOGY_VERSION = "0.5.0";

const DEFAULT_MARKET_DELAY_MINUTES = 15;
const SHARIAH_STALE_AFTER_HOURS = 24 * 7;
const MINIMUM_RELIABLE_HISTORY_BARS = 50;
const SHARIAH_DEBT_TO_ASSETS_BOUNDARY = 0.3;
const SHARIAH_IMPERMISSIBLE_INCOME_BOUNDARY = 0.05;

/*
  ==========================================================================
  Strict numeric parsing
  ==========================================================================

  The accepted domain matches the provider adapters', and the consumer contract
  here makes that the right call rather than a copied convenience. Every caller
  already treats null as "unavailable" and guards on it explicitly:

    - resolveMarketDelay reads MARKET_DATA_DELAY_MINUTES / FINNHUB_DELAY_MINUTES
      and falls through to the next source on null. A whitespace-only value used
      to parse as 0, and 0 minutes is what makes resolveMarketState report
      "realtime" - so a stray space in an environment variable could have made
      the product claim real-time data it has no evidence for. Rejected input
      now falls through to the disclosed 15-minute default, which is the
      conservative answer.

    - buildThesisInvalidation guards `triggerPrice === null` and
      `completedClose === null` before using either.

    - the Shariah boundary check guards `debtToAssets !== null` and
      `impermissibleIncome !== null`. A malformed ratio coercing to 0 would sit
      below the 30% and 5% boundaries and quietly suppress a violation.

  Legitimate zero must survive in all of them: 0 delay minutes means realtime,
  and a 0 debt ratio is a real screening result.

    ACCEPTED  - a finite number, including 0 and negative numbers
              - a string that is non-blank after trimming AND parses to a
                finite number, including "0"

    REJECTED  - null, undefined, "", any whitespace-only string, any
                non-numeric string, NaN, Infinity, -Infinity, booleans,
                arrays, objects, and every other type
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
/*
  Derived from describeDelayRejection rather than restating the rule.

  Stating "reject negatives" in two places looked like defence in depth and was
  really a duplicated rule: the second copy could never fire, because the first
  already rejected the value, so a mutation to it changed nothing observable. A
  guard that cannot fail is not protection, it is unverifiable code. One rule,
  one place, and the diagnostic and the resolved value can never disagree.
*/
function toDelayMinutes(value) {
  if (describeDelayRejection(value) !== null) {
    return null;
  }

  return toFiniteNumber(value, null);
}

/*
  Why a configured delay source was refused, as a stable machine code.

  Deliberately no raw value: knowing that MARKET_DATA_DELAY_MINUTES was
  negative is enough to fix it, and echoing environment content into a metrics
  response is how configuration leaks into logs and dashboards.

  An ABSENT variable is not a rejection and is never reported as one. Nobody
  configured it, so there is nothing to diagnose.
*/
function describeDelayRejection(value) {
  if (value === undefined) {
    return null;
  }

  if (typeof value === "string" && value.trim() === "") {
    return "BLANK";
  }

  const parsed = toFiniteNumber(value, null);

  if (parsed === null) {
    return "NOT_NUMERIC";
  }

  if (parsed < 0) {
    return "NEGATIVE";
  }

  return null;
}

/*
  Resolution is unchanged: a valid primary wins, then a valid legacy alias, then
  the conservative 15-minute default. `minutes`, `source` and
  `deprecatedAliasInUse` keep exactly the semantics they had.

  What is added is protected-only evidence of WHY a fallback happened. Without
  it, an operator who typoed a delay sees a correct, safe 15 minutes and no
  indication that their configuration was ignored - the failure is silent
  precisely because the fallback is doing its job.

  These fields never reach mounted analysis output or the unauthenticated
  readiness endpoint: both mounted consumers read `.minutes` alone, and the full
  object appears only inside the token-protected metrics snapshot.

  `fallbackReason` vocabulary, one value per outcome:

    NONE                     a configured source was used and nothing
                             configured was refused. An ABSENT higher-priority
                             variable is not a refusal, so a valid legacy value
                             with no primary set is still NONE.
    PRIMARY_SOURCE_REJECTED  a configured higher-priority source was refused and
                             a lower-priority configured source was used.
    ALL_SOURCES_INVALID      every configured source was refused; the disclosed
                             default applies.
    NO_SOURCE_CONFIGURED     nothing was configured at all; the disclosed
                             default applies.

  The invariant, asserted in backend/tests/testProviderNumericSafety.js:

    fallbackReason === "NONE"  =>  rejectedSources is empty
    rejectedSources non-empty and source !== "DEFAULT"
                               =>  fallbackReason === "PRIMARY_SOURCE_REJECTED"

  Resolution order is unchanged and a valid primary still wins immediately:
  the loop RETURNS on the first source that resolves, so lower-priority
  variables are not inspected at all once the primary is valid. A malformed
  FINNHUB_DELAY_MINUTES sitting behind a valid MARKET_DATA_DELAY_MINUTES is
  therefore never read and never reported - it had no bearing on the result,
  and reporting it would invite someone to "fix" a variable that is not in use.
*/
function resolveMarketDelay(env = process.env) {
  const sources = [
    { variable: MARKET_DELAY_VARIABLE, deprecated: false },
    { variable: LEGACY_MARKET_DELAY_VARIABLE, deprecated: true },
  ];

  const configuredSources = [];
  const rejectedSources = [];

  for (const { variable, deprecated } of sources) {
    const raw = env[variable];

    if (raw !== undefined) {
      configuredSources.push(variable);
    }

    const rejection = describeDelayRejection(raw);

    if (rejection) {
      rejectedSources.push({ variable, reason: rejection });
      continue;
    }

    const minutes = toDelayMinutes(raw);

    if (minutes !== null) {
      /*
        `fallbackReason` and `rejectedSources` must never disagree about
        whether a fallback happened.

        This branch previously always reported "NONE", which produced a
        self-contradicting record: source FINNHUB_DELAY_MINUTES, no fallback
        claimed, and a rejected MARKET_DATA_DELAY_MINUTES sitting right beside
        it. A reader had to decide which of the two fields to believe, and a
        diagnostic that needs adjudicating is worse than none.

        "NONE" now means exactly what it says - nothing configured was
        refused. If a higher-priority source WAS refused and resolution moved
        on, that is a fallback, and it is named.
      */
      return {
        minutes,
        source: variable,
        deprecatedAliasInUse: deprecated,
        fallbackReason:
          rejectedSources.length > 0
            ? "PRIMARY_SOURCE_REJECTED"
            : "NONE",
        configuredSources,
        rejectedSources,
      };
    }
  }

  return {
    minutes: DEFAULT_MARKET_DELAY_MINUTES,
    source: "DEFAULT",
    deprecatedAliasInUse: false,
    fallbackReason:
      rejectedSources.length > 0
        ? "ALL_SOURCES_INVALID"
        : "NO_SOURCE_CONFIGURED",
    configuredSources,
    rejectedSources,
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
