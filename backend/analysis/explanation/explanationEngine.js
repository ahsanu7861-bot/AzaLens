function safeNumber(value, fallback = null) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function analyzeExplanation(analysis) {
  if (!analysis || analysis.success !== true) {
    return {
      success: false,
      error: "Valid master analysis data is required."
    };
  }

  const symbol = analysis.symbol || "Unknown";
  const market = analysis.market || {};
  const indicators = analysis.indicators || {};
  const trend = analysis.trend || {};
  const agreement = analysis.agreement || {};

  const positives = [];
  const cautions = [];
  const observations = [];

  const marketData =
    market.success === true && market.data
      ? market.data
      : null;

  const currentPrice =
    safeNumber(marketData?.price) ??
    safeNumber(indicators.ema?.currentPrice) ??
    safeNumber(indicators.sma?.currentPrice) ??
    safeNumber(indicators.bollinger?.currentPrice);

  // ============================
  // Market Snapshot
  // ============================

  if (marketData) {
    const changePercent = safeNumber(marketData.changePercent);

    if (changePercent !== null) {
      observations.push(
        `${symbol} is trading at $${currentPrice}, with a daily change of ${changePercent.toFixed(
          2
        )}%.`
      );
    } else if (currentPrice !== null) {
      observations.push(
        `${symbol} is trading at $${currentPrice}.`
      );
    }
  } else {
    cautions.push(
      "Live market data is currently unavailable, so the explanation relies on historical indicator data."
    );
  }

  // ============================
  // Trend
  // ============================

  if (trend.success === true) {
    observations.push(
      `The Trend Engine classifies the current structure as ${trend.trend} with a score of ${trend.score}.`
    );

    if (
      String(trend.trend).includes("Bullish")
    ) {
      positives.push(
        `The overall trend structure is ${trend.trend.toLowerCase()}.`
      );
    } else if (
      String(trend.trend).includes("Bearish")
    ) {
      cautions.push(
        `The overall trend structure is ${trend.trend.toLowerCase()}.`
      );
    } else {
      cautions.push(
        "The broader trend is currently sideways or unclear."
      );
    }
  }

  // ============================
  // Agreement
  // ============================

  /*
   * Evidence Agreement publishes independent family counts, not a percentage.
   * This block quotes the canonical summary the agreement engine already built -
   * it never recomputes an assessment, and it never publishes a figure the
   * contract no longer contains.
   */
  const agreementSummary =
    typeof agreement.summary === "string" ? agreement.summary.trim() : "";
  const supportingFamilies = Number(agreement.support?.supportingFamilies);
  const expectedFamilies = Number(agreement.coverage?.expectedFamilies);
  const usableFamilies = Number(agreement.coverage?.usableFamilies);

  if (agreement.success === true && agreementSummary) {
    observations.push(agreementSummary);

    const countsUsable =
      Number.isFinite(supportingFamilies) &&
      Number.isFinite(expectedFamilies) &&
      Number.isFinite(usableFamilies);

    if (
      agreement.agreement === "aligned" &&
      agreement.direction === "Bullish" &&
      countsUsable
    ) {
      positives.push(
        `${supportingFamilies} of ${expectedFamilies} independent evidence families support the bullish direction.`
      );
    } else if (
      agreement.agreement === "aligned" &&
      agreement.direction === "Bearish" &&
      countsUsable
    ) {
      cautions.push(
        `${supportingFamilies} of ${expectedFamilies} independent evidence families support the bearish direction.`
      );
    } else if (countsUsable && usableFamilies < expectedFamilies) {
      cautions.push(
        `Only ${usableFamilies} of ${expectedFamilies} evidence families were usable, so the reading rests on incomplete evidence.`
      );
    } else {
      cautions.push(
        "The evidence families are not fully aligned, which reduces directional conviction."
      );
    }
  }

  // ============================
  // EMA
  // ============================

  if (indicators.ema?.success === true) {
    if (
      String(indicators.ema.signal).includes("Above EMA")
    ) {
      positives.push(
        `Price is above EMA20 at ${indicators.ema.ema20}, supporting short-term bullish structure.`
      );
    } else if (
      String(indicators.ema.signal).includes("Below EMA")
    ) {
      cautions.push(
        `Price is below EMA20 at ${indicators.ema.ema20}, indicating short-term weakness.`
      );
    }
  }

  // ============================
  // SMA
  // ============================

  if (indicators.sma?.success === true) {
    if (
      String(indicators.sma.signal).includes("Above SMA")
    ) {
      positives.push(
        `Price is above SMA50 at ${indicators.sma.sma50}, supporting the broader trend.`
      );
    } else if (
      String(indicators.sma.signal).includes("Below SMA")
    ) {
      cautions.push(
        `Price is below SMA50 at ${indicators.sma.sma50}, showing broader technical weakness.`
      );
    }
  }

  // ============================
  // MACD
  // ============================

  if (indicators.macd?.success === true) {
    if (
      String(indicators.macd.signal).includes("Bullish")
    ) {
      positives.push(
        "MACD shows bullish momentum."
      );
    } else if (
      String(indicators.macd.signal).includes("Bearish")
    ) {
      cautions.push(
        "MACD shows bearish momentum."
      );
    } else {
      observations.push(
        "MACD momentum is currently neutral."
      );
    }
  }

  // ============================
  // RSI
  // ============================

  if (indicators.rsi?.success === true) {
    const rsiValue = safeNumber(indicators.rsi.rsi);

    if (indicators.rsi.signal === "Overbought") {
      cautions.push(
        `RSI is ${rsiValue}, indicating overbought conditions and possible short-term exhaustion.`
      );
    } else if (indicators.rsi.signal === "Oversold") {
      positives.push(
        `RSI is ${rsiValue}, indicating oversold conditions and possible recovery potential.`
      );
    } else {
      observations.push(
        `RSI is ${rsiValue}, which is currently neutral.`
      );
    }
  }

  // ============================
  // Bollinger Bands
  // ============================

  if (indicators.bollinger?.success === true) {
    const bollingerSignal = String(
      indicators.bollinger.signal || ""
    );

    if (
      bollingerSignal === "Above Upper Band"
    ) {
      cautions.push(
        "Price is above the upper Bollinger Band, which may indicate strong momentum but also short-term overextension."
      );
    } else if (
      bollingerSignal === "Price Near Upper Band"
    ) {
      positives.push(
        "Price is trading near the upper Bollinger Band, showing positive price momentum."
      );
    } else if (
      bollingerSignal === "Below Lower Band"
    ) {
      cautions.push(
        "Price is below the lower Bollinger Band, reflecting strong downside pressure."
      );
    } else if (
      bollingerSignal === "Price Near Lower Band"
    ) {
      cautions.push(
        "Price is trading near the lower Bollinger Band, indicating weak price momentum."
      );
    }
  }

  // ============================
  // ADX
  // ============================

  if (indicators.adx?.success === true) {
    const adxValue = safeNumber(indicators.adx.adx);

    if (
      String(indicators.adx.signal).includes("Very Strong")
    ) {
      positives.push(
        `ADX is ${adxValue}, confirming very strong trend strength.`
      );
    } else if (
      String(indicators.adx.signal).includes("Strong")
    ) {
      positives.push(
        `ADX is ${adxValue}, confirming strong trend strength.`
      );
    } else if (
      String(indicators.adx.signal).includes("Developing")
    ) {
      observations.push(
        `ADX is ${adxValue}, showing a developing trend.`
      );
    } else {
      cautions.push(
        `ADX is only ${adxValue}, so the current directional move has weak trend strength.`
      );
    }
  }

  // ============================
  // ATR
  // ============================

  if (indicators.atr?.success === true) {
    const atrValue = safeNumber(indicators.atr.atr);

    if (
      String(indicators.atr.signal).includes("High")
    ) {
      cautions.push(
        `ATR is ${atrValue}, indicating high volatility and potentially wider price swings.`
      );
    } else {
      observations.push(
        `ATR is ${atrValue}, with volatility classified as ${indicators.atr.signal}.`
      );
    }
  }

  // ============================
  // OBV
  // ============================

  if (indicators.obv?.success === true) {
    if (indicators.obv.signal === "Accumulation") {
      positives.push(
        "OBV suggests accumulation and underlying buying pressure."
      );
    } else if (
      indicators.obv.signal === "Distribution"
    ) {
      cautions.push(
        "OBV suggests distribution and underlying selling pressure."
      );
    } else {
      observations.push(
        "OBV does not currently show a clear accumulation or distribution signal."
      );
    }
  }

  // ============================
  // RVOL
  // ============================

  if (indicators.rvol?.success === true) {
    const rvolValue = safeNumber(indicators.rvol.rvol);

    /*
      A low ratio only means weak participation when it's comparing
      two complete trading sessions. Below rvolValue >= 1.5 (still a
      genuine positive regardless of session status), only claim
      "weak" once the session is confirmed CLOSED - see
      backend/analysis/marketSession.js.
    */
    const sessionStatus =
      indicators.rvol.session?.status || null;
    const comparisonReliable = sessionStatus === "CLOSED";

    if (rvolValue !== null && rvolValue >= 1.5) {
      positives.push(
        `Relative volume is ${rvolValue}× average, showing strong market participation.`
      );
    } else if (
      rvolValue !== null &&
      rvolValue >= 1
    ) {
      observations.push(
        `Relative volume is ${rvolValue}× average, showing normal participation.`
      );
    } else if (rvolValue !== null && comparisonReliable) {
      cautions.push(
        `Relative volume is only ${rvolValue}× average, so participation is currently weak.`
      );
    } else if (rvolValue !== null && sessionStatus === "OPEN") {
      observations.push(
        "Today's trading session is still in progress, so relative volume can't yet be fairly compared to a full day's average."
      );
    } else if (rvolValue !== null) {
      observations.push(
        "Relative volume could not be reliably compared because the trading session status for this ticker's exchange is unknown."
      );
    }
  }

  // ============================
  // Volume Spike
  // ============================

  if (indicators.volumeSpike?.success === true) {
    if (
      indicators.volumeSpike.volumeSpikeDetected === true
    ) {
      positives.push(
        "An unusual volume spike was detected, confirming increased market attention."
      );
    } else {
      cautions.push(
        "No unusual volume spike was detected."
      );
    }
  }

  // ============================
  // Candlestick
  // ============================

  if (indicators.candlestick?.success === true) {
    if (indicators.candlestick.bias === "Bullish") {
      positives.push(
        `${indicators.candlestick.pattern} provides bullish price-action confirmation.`
      );
    } else if (
      indicators.candlestick.bias === "Bearish"
    ) {
      cautions.push(
        `${indicators.candlestick.pattern} provides bearish price-action confirmation.`
      );
    } else {
      observations.push(
        "No strong directional candlestick pattern was detected."
      );
    }
  }

  // ============================
  // Overall Assessment
  // ============================

  /*
   * The strength of the reading is taken from the agreement engine's own graded
   * state. This engine no longer applies a second threshold of its own: doing so
   * meant two components grading the same evidence by different rules and
   * occasionally disagreeing in public.
   */
  const gradedStates = ["Moderate agreement", "High agreement"];
  const wellSupported = gradedStates.includes(agreement.evidenceState);

  let overallAssessment =
    "The technical evidence is mixed and does not currently provide strong directional clarity.";

  if (agreement.evidenceState === "No directional evidence") {
    overallAssessment =
      `${symbol} shows usable evidence in every family, but none of them currently expresses a direction.`;
  } else if (agreement.evidenceState === "Conflicting evidence") {
    overallAssessment =
      `${symbol} shows directional evidence that cancels out: the evidence families are split, so no dominant lean stands.`;
  } else if (agreement.evidenceState === "Insufficient evidence") {
    overallAssessment =
      `${symbol} has too little usable evidence to assess agreement between independent families.`;
  } else if (agreement.evidenceState === "Evidence unavailable") {
    overallAssessment =
      `${symbol} has no usable evidence families, so no technical reading can be formed.`;
  } else if (agreement.direction === "Bullish" && wellSupported) {
    overallAssessment =
      `${symbol} currently shows a bullish technical structure supported by most independent evidence families. However, the setup should still be evaluated alongside volatility, trend strength, and volume participation.`;
  } else if (agreement.direction === "Bullish") {
    overallAssessment =
      `${symbol} currently shows bullish technical evidence, but confirmation is incomplete or conviction is limited.`;
  } else if (agreement.direction === "Bearish" && wellSupported) {
    overallAssessment =
      `${symbol} currently shows a bearish technical structure supported by most independent evidence families. Volatility and volume conditions should still be considered carefully.`;
  } else if (agreement.direction === "Bearish") {
    overallAssessment =
      `${symbol} currently shows bearish technical evidence, but confirmation is incomplete or conviction is limited.`;
  }

  // ============================
  // Narrative
  // ============================

  const narrativeParts = [];

  if (observations.length > 0) {
    narrativeParts.push(observations.join(" "));
  }

  if (positives.length > 0) {
    narrativeParts.push(
      `Supporting evidence: ${positives.join(" ")}`
    );
  }

  if (cautions.length > 0) {
    narrativeParts.push(
      `Cautionary evidence: ${cautions.join(" ")}`
    );
  }

  narrativeParts.push(overallAssessment);

  return {
    success: true,
    symbol,
    title: `${symbol} Technical Explanation`,
    overallAssessment,
    narrative: narrativeParts.join(" "),
    positives,
    cautions,
    observations,
    disclaimer:
      "This analysis is for informational and educational purposes only and is not financial advice."
  };
}

module.exports = {
  analyzeExplanation
};