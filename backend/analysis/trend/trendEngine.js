const DIRECTIONAL_INPUTS = Object.freeze([
  { key: "ema", label: "EMA" },
  { key: "sma", label: "SMA" },
  { key: "macd", label: "MACD" }
]);

function normalizeInput(input) {
  if (
    input &&
    typeof input === "object"
  ) {
    return {
      available:
        input.success === true &&
        typeof input.signal === "string" &&
        input.signal.trim().length > 0,
      signal:
        String(input.signal || "")
          .trim()
          .toLowerCase()
    };
  }

  const signal =
    String(input || "")
      .trim()
      .toLowerCase();

  return {
    available:
      signal.length > 0,
    signal
  };
}

function analyzeTrend(
  emaInput,
  smaInput,
  macdInput,
  adxInput
) {
  let score = 0;
  const details = [];

  const inputs = {
    ema: normalizeInput(emaInput),
    sma: normalizeInput(smaInput),
    macd: normalizeInput(macdInput),
    adx: normalizeInput(adxInput)
  };

  const availableDirectionalInputs =
    DIRECTIONAL_INPUTS.filter(
      ({ key }) =>
        inputs[key].available
    );

  const missingDirectionalInputs =
    DIRECTIONAL_INPUTS.filter(
      ({ key }) =>
        !inputs[key].available
    ).map(({ label }) => label);

  const directionalEvidenceCount =
    availableDirectionalInputs.length;

  const minimumDirectionalEvidence = 2;
  const coveragePercent =
    Math.round(
      (
        directionalEvidenceCount /
        DIRECTIONAL_INPUTS.length
      ) * 100
    );

  if (
    directionalEvidenceCount <
    minimumDirectionalEvidence
  ) {
    DIRECTIONAL_INPUTS.forEach(
      ({ key, label }) => {
        details.push(
          inputs[key].available
            ? `${label} Available`
            : `${label} Unavailable`
        );
      }
    );

    details.push(
      inputs.adx.available
        ? "ADX Available (strength only)"
        : "ADX Unavailable"
    );

    return {
      success: false,
      status: "UNAVAILABLE",
      trend: "Unavailable",
      score: null,
      details,
      evidence: {
        directionalAvailable:
          directionalEvidenceCount,
        directionalRequired:
          minimumDirectionalEvidence,
        directionalTotal:
          DIRECTIONAL_INPUTS.length,
        coveragePercent,
        missing:
          missingDirectionalInputs,
        adxAvailable:
          inputs.adx.available
      },
      warning:
        "At least two directional indicators (EMA, SMA, MACD) are required to classify trend."
    };
  }

  const ema =
    inputs.ema.signal;
  const sma =
    inputs.sma.signal;
  const macd =
    inputs.macd.signal;
  const adx =
    inputs.adx.signal;

  // ============================
  // EMA — Direction
  // ============================

  if (!inputs.ema.available) {
    details.push("EMA Unavailable");
  } else if (
    ema.includes("above ema") ||
    ema.includes("bullish")
  ) {
    score += 25;
    details.push("EMA Bullish");
  } else if (
    ema.includes("below ema") ||
    ema.includes("bearish")
  ) {
    score -= 25;
    details.push("EMA Bearish");
  } else {
    details.push("EMA Neutral");
  }

  // ============================
  // SMA — Direction
  // ============================

  if (!inputs.sma.available) {
    details.push("SMA Unavailable");
  } else if (
    sma.includes("above sma") ||
    sma.includes("bullish")
  ) {
    score += 25;
    details.push("SMA Bullish");
  } else if (
    sma.includes("below sma") ||
    sma.includes("bearish")
  ) {
    score -= 25;
    details.push("SMA Bearish");
  } else {
    details.push("SMA Neutral");
  }

  // ============================
  // MACD — Momentum Direction
  // ============================

  if (!inputs.macd.available) {
    details.push("MACD Unavailable");
  } else if (macd.includes("bullish")) {
    score += 30;
    details.push("MACD Bullish");
  } else if (macd.includes("bearish")) {
    score -= 30;
    details.push("MACD Bearish");
  } else {
    details.push("MACD Neutral");
  }

  // ============================
  // ADX — Trend Strength
  // ============================

  /*
   * ADX does not provide direction.
   * It only strengthens the direction already detected
   * by EMA, SMA and MACD.
   */

  if (!inputs.adx.available) {
    details.push("ADX Unavailable");
  } else if (adx.includes("very strong")) {
    if (score > 0) {
      score += 20;
    } else if (score < 0) {
      score -= 20;
    }

    details.push("ADX Very Strong");
  } else if (adx.includes("strong")) {
    if (score > 0) {
      score += 15;
    } else if (score < 0) {
      score -= 15;
    }

    details.push("ADX Strong");
  } else if (
    adx.includes("developing") ||
    adx.includes("moderate")
  ) {
    if (score > 0) {
      score += 5;
    } else if (score < 0) {
      score -= 5;
    }

    details.push("ADX Developing");
  } else {
    details.push("ADX Weak");
  }

  // Keep score within -100 to +100
  score = Math.max(-100, Math.min(100, score));

  // ============================
  // Final Trend Classification
  // ============================

  let trend = "Sideways";

  if (score >= 75) {
    trend = "Strong Bullish";
  } else if (score >= 30) {
    trend = "Bullish";
  } else if (score > -30 && score < 30) {
    trend = "Sideways";
  } else if (score <= -75) {
    trend = "Strong Bearish";
  } else if (score <= -30) {
    trend = "Bearish";
  }

  return {
    success: true,
    status:
      directionalEvidenceCount ===
      DIRECTIONAL_INPUTS.length
        ? "COMPLETE"
        : "PARTIAL",
    trend,
    score,
    details,
    evidence: {
      directionalAvailable:
        directionalEvidenceCount,
      directionalRequired:
        minimumDirectionalEvidence,
      directionalTotal:
        DIRECTIONAL_INPUTS.length,
      coveragePercent,
      missing:
        missingDirectionalInputs,
      adxAvailable:
        inputs.adx.available
    },
    warning:
      missingDirectionalInputs.length > 0
        ? `Trend classification is based on partial evidence; missing: ${missingDirectionalInputs.join(", ")}.`
        : null
  };
}

module.exports = {
  analyzeTrend
};
