const {
  fetchScreening,
} = require("../providers/halalTerminalProvider");

const {
  recordProviderResult,
} = require("../utils/observability");

// ============================================================
// AzaLens - Shariah Compliance Service
// Version: 0.4.1
// ============================================================

const STATUS = Object.freeze({
  COMPLIANT: "COMPLIANT",
  NON_COMPLIANT: "NON_COMPLIANT",
  UNKNOWN: "UNKNOWN",
});

const CONFIDENCE = Object.freeze({
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
  UNKNOWN: "UNKNOWN",
});

const PRIMARY_METHODOLOGY = Object.freeze({
  id: "AAOIFI",
  name: "AAOIFI",
});

function toNullableNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPercent(value, digits = 2) {
  const number = toNullableNumber(value);

  if (number === null) {
    return null;
  }

  return `${number.toFixed(digits)}%`;
}

function formatRatioAsPercent(value, digits = 2) {
  const number = toNullableNumber(value);

  if (number === null) {
    return null;
  }

  return `${(number * 100).toFixed(digits)}%`;
}

function normalizeMethodologyId(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/&/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (["S_P", "SANDP", "S_AND_P", "SNP"].includes(normalized)) {
    return "SP";
  }

  return normalized || null;
}

function methodologyStatus(isCompliant) {
  if (isCompliant === true) {
    return STATUS.COMPLIANT;
  }

  if (isCompliant === false) {
    return STATUS.NON_COMPLIANT;
  }

  return STATUS.UNKNOWN;
}

function normalizeMethodologyResult(methodology, fallback = {}) {
  const id =
    normalizeMethodologyId(methodology?.id || methodology?.name) ||
    normalizeMethodologyId(fallback.id) ||
    null;
  const isCompliant =
    typeof methodology?.isCompliant === "boolean"
      ? methodology.isCompliant
      : typeof fallback.isCompliant === "boolean"
        ? fallback.isCompliant
        : null;

  return {
    id,
    name:
      methodology?.name ||
      fallback.name ||
      id,
    status: methodologyStatus(isCompliant),
    isCompliant,
    verified:
      typeof methodology?.verified === "boolean"
        ? methodology.verified
        : null,
    disposition: methodology?.disposition || null,
    basis: methodology?.basis || null,
    alternateBasis: methodology?.alternateBasis || null,
    basesDisagree:
      typeof methodology?.basesDisagree === "boolean"
        ? methodology.basesDisagree
        : null,
    reason: methodology?.reason || null,
  };
}

function buildMethodologyResults(providerResult) {
  const details = Array.isArray(providerResult?.methodologies?.details)
    ? providerResult.methodologies.details
    : [];
  const summary =
    providerResult?.methodologies?.summary &&
    typeof providerResult.methodologies.summary === "object"
      ? providerResult.methodologies.summary
      : {};
  const results = {};

  details.forEach((methodology) => {
    const normalized = normalizeMethodologyResult(methodology);

    if (normalized.id) {
      results[normalized.id] = normalized;
    }
  });

  Object.entries(summary).forEach(([rawId, isCompliant]) => {
    const id = normalizeMethodologyId(rawId);

    if (!id || results[id]) {
      return;
    }

    results[id] = normalizeMethodologyResult(
      null,
      {
        id,
        name: id === "SP" ? "S&P" : id,
        isCompliant,
      }
    );
  });

  if (!results[PRIMARY_METHODOLOGY.id]) {
    results[PRIMARY_METHODOLOGY.id] = normalizeMethodologyResult(
      null,
      PRIMARY_METHODOLOGY
    );
  }

  return results;
}

function determineConfidence(providerResult, primaryMethodology) {
  if (!providerResult?.success) {
    return CONFIDENCE.UNKNOWN;
  }

  const lastCheckedAt = providerResult?.verification?.lastCheckedAt;
  const isStale = providerResult?.verification?.isStale;

  if (isStale === true) {
    return CONFIDENCE.LOW;
  }

  if (
    primaryMethodology?.status !== STATUS.UNKNOWN &&
    primaryMethodology?.verified === true &&
    lastCheckedAt
  ) {
    return CONFIDENCE.HIGH;
  }

  if (primaryMethodology?.status !== STATUS.UNKNOWN) {
    return CONFIDENCE.MEDIUM;
  }

  return CONFIDENCE.LOW;
}

function buildHeadline(companyName, primaryMethodology) {
  const company = companyName || "This instrument";
  const status = primaryMethodology?.status || STATUS.UNKNOWN;

  if (status === STATUS.COMPLIANT) {
    return `${company} passes the AAOIFI Shariah screening.`;
  }

  if (status === STATUS.NON_COMPLIANT) {
    return `${company} does not pass the AAOIFI Shariah screening.`;
  }

  return `AAOIFI Shariah compliance could not be verified for ${company}.`;
}

function buildSummary(providerResult, primaryMethodology, confidence) {
  return {
    headline: buildHeadline(
      providerResult?.company?.name,
      primaryMethodology
    ),
    status: primaryMethodology?.status || STATUS.UNKNOWN,
    confidence,
    methodologyId: PRIMARY_METHODOLOGY.id,
    methodologyName: PRIMARY_METHODOLOGY.name,
    explanation:
      primaryMethodology?.reason ||
      providerResult?.screening?.explanation ||
      providerResult?.screening?.businessScreen?.reason ||
      null,
    purificationRatePercent:
      providerResult?.screening?.purificationRatePercent ?? null,
    purificationRateFormatted: formatPercent(
      providerResult?.screening?.purificationRatePercent
    ),
  };
}

function buildBusinessActivity(providerResult) {
  const businessScreen = providerResult?.screening?.businessScreen || {};
  const businessIncome = providerResult?.businessIncome;

  return {
    status:
      businessScreen.passed === true
        ? "PASS"
        : businessScreen.passed === false
          ? "FAIL"
          : "UNKNOWN",
    passed:
      typeof businessScreen.passed === "boolean"
        ? businessScreen.passed
        : null,
    reason: businessScreen.reason || null,
    questionableBusiness:
      typeof businessScreen.questionableBusiness === "boolean"
        ? businessScreen.questionableBusiness
        : null,
    ifiExempt:
      typeof businessScreen.ifiExempt === "boolean"
        ? businessScreen.ifiExempt
        : null,
    advisory: businessIncome?.advisory ?? null,
    includedInVerdict: businessIncome?.includedInVerdict ?? null,
    fiscalYear: businessIncome?.fiscalYear || null,
    confidence: businessIncome?.confidence || null,
    segments: Array.isArray(businessIncome?.segments)
      ? businessIncome.segments
      : [],
    revenueRatios: businessIncome
      ? {
          impermissible:
            businessIncome.impermissibleRevenueRatio ?? null,
          impermissibleFormatted: formatRatioAsPercent(
            businessIncome.impermissibleRevenueRatio
          ),
          questionable:
            businessIncome.questionableRevenueRatio ?? null,
          questionableFormatted: formatRatioAsPercent(
            businessIncome.questionableRevenueRatio
          ),
          unknown: businessIncome.unknownRevenueRatio ?? null,
          unknownFormatted: formatRatioAsPercent(
            businessIncome.unknownRevenueRatio
          ),
          interestIncome: businessIncome.interestIncomeRatio ?? null,
          interestIncomeFormatted: formatRatioAsPercent(
            businessIncome.interestIncomeRatio
          ),
          combinedImpure: businessIncome.combinedImpureRatio ?? null,
          combinedImpureFormatted: formatRatioAsPercent(
            businessIncome.combinedImpureRatio
          ),
          exceedsFivePercent:
            businessIncome.exceedsFivePercent ?? null,
          exceedsFivePercentWithQuestionable:
            businessIncome.exceedsFivePercentWithQuestionable ?? null,
        }
      : null,
    sourceUrl: businessIncome?.sourceUrl || null,
  };
}

function buildFinancialScreen(providerResult) {
  const screening = providerResult?.screening?.financialScreen || {};
  const ratios = providerResult?.ratios || {};

  return {
    status:
      screening.passed === true
        ? "PASS"
        : screening.passed === false
          ? "FAIL"
          : "UNKNOWN",
    passed:
      typeof screening.passed === "boolean"
        ? screening.passed
        : null,
    ratios: {
      debtToAssets: ratios.debtToAssets ?? null,
      debtToAssetsFormatted: formatRatioAsPercent(
        ratios.debtToAssets
      ),
      cashToAssets: ratios.cashToAssets ?? null,
      cashToAssetsFormatted: formatRatioAsPercent(
        ratios.cashToAssets
      ),
      receivablesToAssets: ratios.receivablesToAssets ?? null,
      receivablesToAssetsFormatted: formatRatioAsPercent(
        ratios.receivablesToAssets
      ),
      interestIncomeToRevenue:
        ratios.interestIncomeToRevenue ?? null,
      interestIncomeToRevenueFormatted: formatRatioAsPercent(
        ratios.interestIncomeToRevenue
      ),
      debtToMarketCap: ratios.debtToMarketCap ?? null,
      debtToMarketCapFormatted: formatRatioAsPercent(
        ratios.debtToMarketCap
      ),
      cashToMarketCap: ratios.cashToMarketCap ?? null,
      cashToMarketCapFormatted: formatRatioAsPercent(
        ratios.cashToMarketCap
      ),
      receivablesToMarketCap:
        ratios.receivablesToMarketCap ?? null,
      receivablesToMarketCapFormatted: formatRatioAsPercent(
        ratios.receivablesToMarketCap
      ),
      liquidityToMarketCap:
        ratios.liquidityToMarketCap ?? null,
      liquidityToMarketCapFormatted: formatRatioAsPercent(
        ratios.liquidityToMarketCap
      ),
      liquidityToAssets: ratios.liquidityToAssets ?? null,
      liquidityToAssetsFormatted: formatRatioAsPercent(
        ratios.liquidityToAssets
      ),
    },
    financials: providerResult?.financials || null,
  };
}

function buildDisclaimers(providerResult) {
  if (
    !Array.isArray(providerResult?.disclaimers) ||
    providerResult.disclaimers.length === 0
  ) {
    return [
      {
        id: "AzaLens-shariah",
        severity: "religious",
        text:
          "AzaLens reports automated screening data and does not issue a fatwa or scholarly attestation.",
        url: null,
      },
    ];
  }

  return providerResult.disclaimers;
}

function buildUnknownResult(symbol, providerResult) {
  const methodologyResults = buildMethodologyResults(providerResult);
  const primaryMethodology =
    methodologyResults[PRIMARY_METHODOLOGY.id];

  return {
    success: false,
    symbol: symbol || providerResult?.symbol || null,
    module: {
      id: "shariah_compliance",
      name: "Shariah Compliance",
      version: "0.5.0",
    },
    summary: {
      headline: `AAOIFI Shariah compliance could not be verified${
        symbol ? ` for ${symbol}` : ""
      }.`,
      status: STATUS.UNKNOWN,
      confidence: CONFIDENCE.UNKNOWN,
      methodologyId: PRIMARY_METHODOLOGY.id,
      methodologyName: PRIMARY_METHODOLOGY.name,
      explanation:
        providerResult?.error?.message ||
        "The screening provider did not return a verified result.",
      purificationRatePercent: null,
      purificationRateFormatted: null,
    },
    company: providerResult?.company || null,
    primaryMethodology,
    methodologies: {
      primary: PRIMARY_METHODOLOGY.id,
      results: methodologyResults,
    },
    businessActivity: {
      status: "UNKNOWN",
      passed: null,
      reason: null,
      questionableBusiness: null,
      ifiExempt: null,
      advisory: null,
      includedInVerdict: null,
      fiscalYear: null,
      confidence: null,
      segments: [],
      revenueRatios: null,
      sourceUrl: null,
    },
    financialScreen: {
      status: "UNKNOWN",
      passed: null,
      ratios: {},
      financials: null,
    },
    verification: providerResult?.verification || null,
    disclaimers: buildDisclaimers(providerResult),
    provider: providerResult?.provider || null,
    providerError: providerResult?.error || null,
    metadata: {
      generatedAt: new Date().toISOString(),
      providerMetadata: providerResult?.metadata || null,
    },
  };
}

function transformProviderResult(providerResult) {
  if (!providerResult?.success) {
    return buildUnknownResult(providerResult?.symbol, providerResult);
  }

  const methodologyResults = buildMethodologyResults(providerResult);
  const primaryMethodology =
    methodologyResults[PRIMARY_METHODOLOGY.id];
  const confidence = determineConfidence(
    providerResult,
    primaryMethodology
  );

  return {
    success: true,
    symbol: providerResult.symbol || null,
    module: {
      id: "shariah_compliance",
      name: "Shariah Compliance",
      version: "0.5.0",
    },
    summary: buildSummary(
      providerResult,
      primaryMethodology,
      confidence
    ),
    company: providerResult.company || null,
    primaryMethodology,
    methodologies: {
      primary: PRIMARY_METHODOLOGY.id,
      results: methodologyResults,
    },
    businessActivity: buildBusinessActivity(providerResult),
    financialScreen: buildFinancialScreen(providerResult),
    verification: providerResult.verification || null,
    disclaimers: buildDisclaimers(providerResult),
    provider: providerResult.provider || null,
    providerError: providerResult.providerError || null,
    metadata: {
      generatedAt: new Date().toISOString(),
      providerMetadata: providerResult.metadata || null,
    },
  };
}

async function getShariahCompliance(symbol) {
  const startedAt = Date.now();

  try {
    const providerResult =
      await fetchScreening(symbol);

    recordProviderResult({
      provider:
        providerResult?.provider?.name ||
        "Halal Terminal",
      operation: "shariah_screening",
      result: providerResult,
      durationMs: Date.now() - startedAt,
    });

    return transformProviderResult(
      providerResult
    );
  } catch (error) {
    recordProviderResult({
      provider: "Halal Terminal",
      operation: "shariah_screening",
      result: {
        success: false,
        error: {
          code:
            error?.code ||
            "SHARIAH_PROVIDER_EXCEPTION",
          message:
            error?.message ||
            "Unexpected Shariah provider error.",
        },
      },
      durationMs: Date.now() - startedAt,
    });

    throw error;
  }
}

module.exports = {
  getShariahCompliance,
  transformProviderResult,
  STATUS,
  CONFIDENCE,
  PRIMARY_METHODOLOGY,
};
