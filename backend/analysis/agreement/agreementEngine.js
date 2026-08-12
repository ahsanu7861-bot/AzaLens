const EXPECTED_INDICATOR_COUNT = 9;

/*
 * The canonical backend declaration of every `evidenceState` value this engine
 * can emit. These exact strings travel on the wire and are mapped by
 * services/guidanceContractService.js, so they are named here once rather than
 * retyped at each use site: a silent rename in one branch below would otherwise
 * fall through the guidance map's fail-closed default and quietly degrade every
 * affected verdict to Analysis Limited.
 *
 * The strings themselves are unchanged. See docs/VERDICT_CONTRACT.md §2.1.
 */
const EVIDENCE_STATES = Object.freeze({
  UNAVAILABLE: "Evidence unavailable",
  NO_DIRECTION: "No directional evidence",
  CONFLICTING: "Conflicting evidence",
  LIMITED: "Limited evidence",
  LOW: "Low agreement",
  MODERATE: "Moderate agreement",
  HIGH: "High agreement"
});

/*
 * The subset that asserts a *grade* - how strongly complete directional evidence
 * agrees. Presentation code must never show one of these beside incomplete
 * coverage, which is what the PR 1B safeguard in VerdictCard.tsx enforces.
 */
const GRADED_EVIDENCE_STATES = Object.freeze([
  EVIDENCE_STATES.HIGH,
  EVIDENCE_STATES.MODERATE,
  EVIDENCE_STATES.LOW
]);

function analyzeAgreement(indicators) {
  const bullish = [];
  const bearish = [];
  const neutral = [];
  const agreementDetails = [];
  const unavailableIndicators = [];

  function markUnavailable(name, label) {
    unavailableIndicators.push(name);

    agreementDetails.push(
      `${label} data is unavailable for this analysis and was excluded from indicator agreement.`
    );
  }

  // ============================
  // RSI
  // ============================

  if (indicators.rsi?.success === true) {
    if (indicators.rsi.signal === "Oversold") {
      bullish.push("RSI");

      agreementDetails.push(
        `RSI is ${indicators.rsi.rsi}, indicating oversold conditions.`
      );
    } else if (indicators.rsi.signal === "Overbought") {
      bearish.push("RSI");

      agreementDetails.push(
        `RSI is ${indicators.rsi.rsi}, indicating overbought conditions.`
      );
    } else {
      neutral.push("RSI");

      agreementDetails.push(
        `RSI is ${indicators.rsi.rsi}, currently neutral.`
      );
    }
  } else {
    markUnavailable("RSI", "RSI");
  }

  // ============================
  // EMA
  // ============================

  if (indicators.ema?.success === true) {
    if (indicators.ema.signal.includes("Above EMA")) {
      bullish.push("EMA");
      agreementDetails.push("Price is above EMA20.");
    } else if (indicators.ema.signal.includes("Below EMA")) {
      bearish.push("EMA");
      agreementDetails.push("Price is below EMA20.");
    } else {
      neutral.push("EMA");
      agreementDetails.push("Price is near EMA20.");
    }
  } else {
    markUnavailable("EMA", "EMA");
  }

  // ============================
  // SMA
  // ============================

  if (indicators.sma?.success === true) {
    if (indicators.sma.signal.includes("Above SMA")) {
      bullish.push("SMA");
      agreementDetails.push("Price is above SMA50.");
    } else if (indicators.sma.signal.includes("Below SMA")) {
      bearish.push("SMA");
      agreementDetails.push("Price is below SMA50.");
    } else {
      neutral.push("SMA");
      agreementDetails.push("Price is near SMA50.");
    }
  } else {
    markUnavailable("SMA", "SMA");
  }

  // ============================
  // MACD
  // ============================

  if (indicators.macd?.success === true) {
    if (indicators.macd.signal.includes("Bullish")) {
      bullish.push("MACD");
      agreementDetails.push("MACD indicates bullish momentum.");
    } else if (indicators.macd.signal.includes("Bearish")) {
      bearish.push("MACD");
      agreementDetails.push("MACD indicates bearish momentum.");
    } else {
      neutral.push("MACD");
      agreementDetails.push("MACD momentum is currently neutral.");
    }
  } else {
    markUnavailable("MACD", "MACD");
  }

  // ============================
  // Bollinger Bands
  // ============================

  if (indicators.bollinger?.success === true) {
    if (
      indicators.bollinger.signal === "Above Upper Band" ||
      indicators.bollinger.signal === "Price Near Upper Band"
    ) {
      bullish.push("Bollinger Bands");

      agreementDetails.push(
        "Price is trading in the upper Bollinger Band region."
      );
    } else if (
      indicators.bollinger.signal === "Below Lower Band" ||
      indicators.bollinger.signal === "Price Near Lower Band"
    ) {
      bearish.push("Bollinger Bands");

      agreementDetails.push(
        "Price is trading in the lower Bollinger Band region."
      );
    } else {
      neutral.push("Bollinger Bands");

      agreementDetails.push(
        "Price is trading near the middle Bollinger Band."
      );
    }
  } else {
    markUnavailable("Bollinger Bands", "Bollinger Bands");
  }

  // ============================
  // ADX
  // ============================

  // ADX measures trend strength, not direction.
  if (indicators.adx?.success === true) {
    neutral.push("ADX");

    agreementDetails.push(
      `ADX is ${indicators.adx.adx} and reports "${indicators.adx.signal}".`
    );
  } else {
    markUnavailable("ADX", "ADX");
  }

  // ============================
  // Candlestick
  // ============================

  if (indicators.candlestick?.success === true) {
    if (indicators.candlestick.bias === "Bullish") {
      bullish.push("Candlestick");

      agreementDetails.push(
        `${indicators.candlestick.pattern} provides bullish price-action evidence.`
      );
    } else if (indicators.candlestick.bias === "Bearish") {
      bearish.push("Candlestick");

      agreementDetails.push(
        `${indicators.candlestick.pattern} provides bearish price-action evidence.`
      );
    } else {
      neutral.push("Candlestick");

      agreementDetails.push(
        "No directional candlestick pattern was detected."
      );
    }
  } else {
    markUnavailable("Candlestick", "Candlestick");
  }

  // ============================
  // RVOL
  // ============================

  // RVOL measures participation, not direction.
  if (indicators.rvol?.success === true) {
    neutral.push("RVOL");

    agreementDetails.push(
      `Relative volume is ${indicators.rvol.rvol}× average volume.`
    );
  } else {
    markUnavailable("RVOL", "Relative volume (RVOL)");
  }

  // ============================
  // Volume Spike
  // ============================

  // A volume spike confirms participation, but not bullish/bearish direction.
  if (indicators.volumeSpike?.success === true) {
    neutral.push("Volume Spike");

    if (indicators.volumeSpike.volumeSpikeDetected) {
      agreementDetails.push(
        `${indicators.volumeSpike.signal} detected; this confirms unusually strong participation but not direction by itself.`
      );
    } else {
      agreementDetails.push("No unusual volume spike was detected.");
    }
  } else {
    markUnavailable("Volume Spike", "Volume spike");
  }

  // ============================
  // Signal Counts
  // ============================

  const bullishSignals = bullish.length;
  const bearishSignals = bearish.length;
  const neutralSignals = neutral.length;

  const totalIndicators =
    bullishSignals + bearishSignals + neutralSignals;

  const dominantCount = Math.max(
    bullishSignals,
    bearishSignals
  );

  // ============================
  // Direction
  // ============================

  let direction = "Mixed";

  if (bullishSignals > bearishSignals) {
    direction = "Bullish";
  } else if (bearishSignals > bullishSignals) {
    direction = "Bearish";
  }

  // ============================
  // Confidence
  // ============================

  /*
   * Dominant directional signals receive full weight.
   * Neutral signals receive partial credit because they do not oppose
   * the dominant direction, but they also do not confirm it strongly.
   *
   * Raw agreement is calculated from the evidence that exists. The
   * published percentage is then scaled by coverage so a small,
   * unanimous subset cannot appear equivalent to complete evidence.
   */

  let rawAgreementPercent = 0;

  if (totalIndicators > 0) {
    rawAgreementPercent = Math.round(
      (
        dominantCount +
        neutralSignals * 0.35
      ) /
      totalIndicators *
      100
    );
  }

  rawAgreementPercent = Math.min(100, Math.max(0, rawAgreementPercent));

  const coveragePercent = Math.round(
    totalIndicators / EXPECTED_INDICATOR_COUNT * 100
  );
  const confidence = Math.round(
    rawAgreementPercent * coveragePercent / 100
  );

  let evidenceState = EVIDENCE_STATES.LOW;

  if (totalIndicators === 0) {
    evidenceState = EVIDENCE_STATES.UNAVAILABLE;
  } else if (bullishSignals === 0 && bearishSignals === 0) {
    evidenceState = EVIDENCE_STATES.NO_DIRECTION;
  } else if (bullishSignals === bearishSignals) {
    evidenceState = EVIDENCE_STATES.CONFLICTING;
  } else if (totalIndicators < EXPECTED_INDICATOR_COUNT) {
    evidenceState = EVIDENCE_STATES.LIMITED;
  } else if (confidence >= 75) {
    evidenceState = EVIDENCE_STATES.HIGH;
  } else if (confidence >= 50) {
    evidenceState = EVIDENCE_STATES.MODERATE;
  }

  // ============================
  // Agreement Status
  // ============================

  let agreement = "conflicting";

  const opposingCount =
    direction === "Bullish"
      ? bearishSignals
      : direction === "Bearish"
      ? bullishSignals
      : Math.max(bullishSignals, bearishSignals);

  if (
    direction !== "Mixed" &&
    dominantCount >= 3 &&
    dominantCount > opposingCount &&
    confidence >= 60
  ) {
    agreement = "aligned";
  }

  // ============================
  // Agreement Summary
  // ============================

  let agreementSummary =
    "Indicators are mixed and do not currently provide clear directional agreement.";

  if (totalIndicators === 0) {
    agreementSummary =
      "No indicators were available to establish directional agreement.";
  } else if (agreement === "aligned" && direction === "Bullish") {
    agreementSummary =
      "Bullish indicators are aligned, although neutral signals may reduce conviction.";
  } else if (agreement === "aligned" && direction === "Bearish") {
    agreementSummary =
      "Bearish indicators are aligned, although neutral signals may reduce conviction.";
  } else if (direction === "Bullish") {
    agreementSummary =
      "Bullish evidence is present, but confirmation is incomplete or conflicting.";
  } else if (direction === "Bearish") {
    agreementSummary =
      "Bearish evidence is present, but confirmation is incomplete or conflicting.";
  }

  if (unavailableIndicators.length > 0) {
    agreementSummary +=
      ` (${unavailableIndicators.length} of ${unavailableIndicators.length + totalIndicators} indicators were unavailable and excluded.)`;
  }

  return {
    agreement,
    direction,
    confidence,
    rawAgreementPercent,
    coveragePercent,
    evidenceState,
    expectedIndicators: EXPECTED_INDICATOR_COUNT,
    availableIndicators: totalIndicators,
    agreementSummary,
    agreementDetails,

    bullishSignals,
    bearishSignals,
    neutralSignals,

    bullish,
    bearish,
    neutral,

    totalIndicators,
    unavailableIndicators
  };
}

module.exports = {
  analyzeAgreement,
  EVIDENCE_STATES,
  GRADED_EVIDENCE_STATES,
  EXPECTED_INDICATOR_COUNT
};
