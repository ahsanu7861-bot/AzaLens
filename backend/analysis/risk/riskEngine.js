function toNumber(value, fallback = null) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function round(value, decimals = 2) {
  const multiplier = 10 ** decimals;

  return Math.round(value * multiplier) / multiplier;
}

/*
 * The canonical risk-level thresholds. This engine is the single owner of the
 * mapping from score to level; the classifier and the validator below are
 * exported so the shared boundary can *validate* a score/level pair against the
 * real rule without maintaining a second copy of the table, and without any
 * downstream consumer being able to reclassify anything.
 */
const RISK_LEVELS = ["Low", "Moderate", "High", "Very High"];
const RISK_SCORE_MIN = 0;
const RISK_SCORE_MAX = 100;

/*
 * Strict on purpose. This is part of the validation path, so it must not accept
 * anything Number() would helpfully coerce: Number(null), Number(""),
 * Number("  ") and Number(false) are all 0, and 0 is a legitimate score. A
 * coercing classifier would silently certify null as "Low".
 */
function classifyRiskLevel(riskScore) {
  if (typeof riskScore !== "number" || !Number.isFinite(riskScore)) {
    return null;
  }

  if (riskScore < RISK_SCORE_MIN || riskScore > RISK_SCORE_MAX) {
    return null;
  }

  if (riskScore >= 70) return "Very High";
  if (riskScore >= 50) return "High";
  if (riskScore >= 30) return "Moderate";

  return "Low";
}

/*
 * True only when a successful risk result is internally consistent: a finite,
 * in-range score, an exactly-matching canonical level, and the two agreeing
 * under the thresholds above. No trimming, no case folding, no clamping - a
 * result that needs repairing is a result that cannot be trusted.
 */
function isCoherentRiskResult(risk) {
  if (!risk || risk.success !== true) return false;

  const level = classifyRiskLevel(risk.riskScore);
  if (level === null) return false;

  if (typeof risk.riskLevel !== "string") return false;
  if (!RISK_LEVELS.includes(risk.riskLevel)) return false;

  return risk.riskLevel === level;
}

/*
 * The single constructor for an unavailable risk result. Every rejection path
 * below returns this shape, which is the same one analyzeRisk already produces
 * when it cannot compute a profile - not a new public risk category.
 */
function unavailableRisk(symbol, error) {
  return {
    success: false,
    symbol: typeof symbol === "string" && symbol.trim() ? symbol : "Unknown",
    error
  };
}

/*
 * The shared trust boundary. Every consumer of the risk result - `data.risk` and
 * the guidance contract alike - receives the output of this function, so an
 * incoherent profile is withheld once, before anyone can render it.
 *
 * `success` is treated as a strict boolean and nothing else. A missing, null,
 * numeric or string flag ("true", 0, 1) is malformed, not a verdict: preserving
 * such an object would let a downstream truthiness check treat it as successful
 * and render its raw riskLevel and riskScore. Only these three outcomes exist:
 *
 *   success === false  -> preserved unchanged, so its own honest reason survives
 *   success === true   -> published only if internally coherent
 *   anything else      -> malformed, replaced with the unavailable shape
 */
function validateRiskResult(risk) {
  if (!risk || typeof risk !== "object" || Array.isArray(risk)) {
    return unavailableRisk(null, "Risk analysis was not available.");
  }

  if (risk.success === false) return risk;

  if (risk.success !== true) {
    return unavailableRisk(
      risk.symbol,
      "Risk analysis returned a malformed result and was withheld."
    );
  }

  if (isCoherentRiskResult(risk)) return risk;

  return unavailableRisk(
    risk.symbol,
    "Risk analysis failed its internal consistency check and was withheld."
  );
}

function analyzeRisk(analysis) {
  if (!analysis || analysis.success !== true) {
    return {
      success: false,
      error: "Valid master analysis data is required."
    };
  }

  const symbol = String(analysis.symbol || "Unknown").toUpperCase();
  const market = analysis.market || {};
  const indicators = analysis.indicators || {};
  const trend = analysis.trend || {};
  const agreement = analysis.agreement || {};

  const marketData =
    market.success === true && market.data
      ? market.data
      : {};

  const currentPrice =
    toNumber(marketData.price) ??
    toNumber(indicators.ema?.currentPrice) ??
    toNumber(indicators.sma?.currentPrice) ??
    toNumber(indicators.bollinger?.currentPrice);

  const atr = toNumber(indicators.atr?.atr);
  const adx = toNumber(indicators.adx?.adx);
  const rvol = toNumber(indicators.rvol?.rvol);
  const confidence = toNumber(agreement.confidence, 0);

  /*
    A relative-volume ratio only means what it claims to mean when
    it's comparing two complete trading sessions. When today's
    session is still open (or its status can't be determined), a
    low ratio is structurally expected and does not indicate real
    risk - see backend/analysis/marketSession.js.
  */
  const rvolSessionStatus = indicators.rvol?.session?.status || null;
  const rvolComparisonReliable = rvolSessionStatus === "CLOSED";

  if (currentPrice === null || currentPrice <= 0) {
    return {
      success: false,
      symbol,
      error: "A valid current market price is required."
    };
  }

  if (atr === null || atr <= 0) {
    return {
      success: false,
      symbol,
      error: "A valid ATR value is required."
    };
  }

  // ============================
  // ATR Measurements
  // ============================

  const atrPercent = round((atr / currentPrice) * 100);

  const referenceDistances = {
    tight: {
      atrMultiplier: 0.75,
      distance: round(atr * 0.75),
      percent: round(((atr * 0.75) / currentPrice) * 100)
    },

    standard: {
      atrMultiplier: 1.5,
      distance: round(atr * 1.5),
      percent: round(((atr * 1.5) / currentPrice) * 100)
    },

    wide: {
      atrMultiplier: 2,
      distance: round(atr * 2),
      percent: round(((atr * 2) / currentPrice) * 100)
    }
  };

  // ============================
  // Volatility Classification
  // ============================

  let volatility = "Low";

  if (atrPercent >= 5) {
    volatility = "Very High";
  } else if (atrPercent >= 3) {
    volatility = "High";
  } else if (atrPercent >= 1.5) {
    volatility = "Moderate";
  }

  // ============================
  // Risk Score
  // ============================

  let riskScore = 0;
  const riskNotes = [];
  const supportiveFactors = [];

  // ATR risk contribution
  if (atrPercent >= 5) {
    riskScore += 40;

    riskNotes.push(
      `ATR equals ${atrPercent}% of the current price, indicating very large daily price movement.`
    );
  } else if (atrPercent >= 3) {
    riskScore += 30;

    riskNotes.push(
      `ATR equals ${atrPercent}% of the current price, indicating high volatility.`
    );
  } else if (atrPercent >= 1.5) {
    riskScore += 18;

    riskNotes.push(
      `ATR equals ${atrPercent}% of the current price, indicating moderate volatility.`
    );
  } else {
    riskScore += 8;

    supportiveFactors.push(
      `ATR equals only ${atrPercent}% of the current price, indicating relatively controlled volatility.`
    );
  }

  // ADX trend-strength contribution
  if (adx !== null) {
    if (adx < 20) {
      riskScore += 20;

      riskNotes.push(
        `ADX is ${adx}, indicating weak trend strength and reduced directional reliability.`
      );
    } else if (adx < 25) {
      riskScore += 12;

      riskNotes.push(
        `ADX is ${adx}, showing that trend strength is still developing.`
      );
    } else {
      supportiveFactors.push(
        `ADX is ${adx}, providing stronger trend confirmation.`
      );
    }
  }

  // Relative-volume contribution
  if (rvol !== null && rvolComparisonReliable) {
    if (rvol < 0.8) {
      riskScore += 18;

      riskNotes.push(
        `Relative volume is only ${rvol}× average, indicating weak market participation.`
      );
    } else if (rvol < 1) {
      riskScore += 10;

      riskNotes.push(
        `Relative volume is ${rvol}× average, slightly below normal participation.`
      );
    } else if (rvol >= 1.5) {
      supportiveFactors.push(
        `Relative volume is ${rvol}× average, showing strong participation.`
      );
    } else {
      supportiveFactors.push(
        `Relative volume is ${rvol}× average, showing normal participation.`
      );
    }
  } else if (rvol !== null && rvolSessionStatus === "OPEN") {
    riskNotes.push(
      `Relative volume is not yet factored into this score - today's trading session is still in progress, so it can't be fairly compared to a full day's average.`
    );
  } else if (rvol !== null) {
    riskNotes.push(
      "Relative volume is not yet factored into this score - the trading session status for this ticker's exchange could not be determined."
    );
  }

  // Volume-spike contribution
  if (indicators.volumeSpike?.success === true) {
    if (indicators.volumeSpike.volumeSpikeDetected === true) {
      supportiveFactors.push(
        "An unusual volume spike confirms increased market activity."
      );
    } else {
      riskScore += 5;

      riskNotes.push(
        "No unusual volume spike was detected to confirm stronger participation."
      );
    }
  }

  // Agreement-confidence contribution
  if (confidence >= 75) {
    supportiveFactors.push(
      `Indicator agreement confidence is ${confidence}%, providing relatively strong confirmation.`
    );
  } else if (confidence >= 60) {
    riskScore += 5;

    riskNotes.push(
      `Indicator agreement confidence is ${confidence}%, which provides moderate rather than strong confirmation.`
    );
  } else {
    riskScore += 15;

    riskNotes.push(
      `Indicator agreement confidence is only ${confidence}%, indicating limited confirmation.`
    );
  }

  // Trend consistency
  if (trend.success === true) {
    if (String(trend.trend).includes("Strong")) {
      supportiveFactors.push(
        `The Trend Engine classifies the structure as ${trend.trend}.`
      );
    } else if (trend.trend === "Sideways") {
      riskScore += 15;

      riskNotes.push(
        "The broader trend is sideways, increasing the possibility of false signals."
      );
    }
  }

  riskScore = Math.max(0, Math.min(100, riskScore));

  // ============================
  // Overall Risk Level
  // ============================

  const riskLevel = classifyRiskLevel(riskScore);

  // ============================
  // Price Reference Levels
  // ============================

  const priceReferenceLevels = {
    currentPrice: round(currentPrice),

    belowCurrentPrice: {
      tight: round(currentPrice - referenceDistances.tight.distance),
      standard: round(currentPrice - referenceDistances.standard.distance),
      wide: round(currentPrice - referenceDistances.wide.distance)
    },

    aboveCurrentPrice: {
      tight: round(currentPrice + referenceDistances.tight.distance),
      standard: round(currentPrice + referenceDistances.standard.distance),
      wide: round(currentPrice + referenceDistances.wide.distance)
    }
  };

  // ============================
  // Summary
  // ============================

  let riskSummary =
    `${symbol} currently has a ${riskLevel.toLowerCase()} technical risk profile.`;

  if (volatility === "High" || volatility === "Very High") {
    riskSummary +=
      ` Volatility is ${volatility.toLowerCase()}, with ATR representing ${atrPercent}% of the current price.`;
  }

  if (adx !== null && adx < 20) {
    riskSummary +=
      " Trend strength is weak, which reduces the reliability of directional signals.";
  }

  if (rvol !== null && rvolComparisonReliable && rvol < 1) {
    riskSummary +=
      " Below-average relative volume also reduces participation confirmation.";
  }

  return {
    success: true,
    symbol,

    riskLevel,
    riskScore,
    volatility,

    currentPrice: round(currentPrice),
    atr: round(atr),
    atrPercent,

    agreementConfidence: confidence,

    referenceDistances,
    priceReferenceLevels,

    riskSummary,
    riskNotes,
    supportiveFactors,

    disclaimer:
      "These values are educational risk references only and are not personalized financial advice or trade instructions."
  };
}

module.exports = {
  analyzeRisk,
  classifyRiskLevel,
  isCoherentRiskResult,
  validateRiskResult,
  RISK_LEVELS,
  RISK_SCORE_MIN,
  RISK_SCORE_MAX
};