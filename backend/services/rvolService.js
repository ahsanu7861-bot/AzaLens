const { getHistory } = require("./marketEngine");
const { calculateRVOL } = require("../analysis/rvol");
const {
  STATUS: SESSION_STATUS,
  resolveMarketSession
} = require("../analysis/marketSession");

// ============================
// Helpers
// ============================

function normalizeSymbol(symbol) {
  return String(symbol || "")
    .trim()
    .toUpperCase();
}

/*
  Returns [{ date, volume }] pairs, kept together and filtered
  together, so a bar with an unparseable volume can never shift
  "todayVolume" onto the wrong date - the two values always come
  from the same bar.
*/
function getVolumeBars(history) {
  if (
    Array.isArray(history?.bars) &&
    history.bars.length > 0
  ) {
    return history.bars
      .map((bar) => ({
        date: bar?.date || null,
        volume: Number(bar?.volume)
      }))
      .filter(
        (bar) =>
          bar.date && Number.isFinite(bar.volume)
      );
  }

  if (
    Array.isArray(history?.data?.v) &&
    Array.isArray(history?.data?.t)
  ) {
    return history.data.t
      .map((date, index) => ({
        date: date || null,
        volume: Number(history.data.v[index])
      }))
      .filter(
        (bar) =>
          bar.date && Number.isFinite(bar.volume)
      );
  }

  return [];
}

function buildSignalAndExplanation({ rvol, session }) {
  if (session.status === SESSION_STATUS.UNKNOWN) {
    return {
      signal: "Volume Context Unavailable",
      explanation:
        `Market session status could not be determined for this ticker's exchange, so relative-volume comparison may not be reliable. Raw ratio: ${rvol.toFixed(2)}× the recent average.`
    };
  }

  if (session.status === SESSION_STATUS.OPEN) {
    return {
      signal: "Session In Progress",
      explanation:
        `The trading session is still open, so today's volume isn't final yet. Comparing a partial session to a full-day average would understate participation. So far it's running at ${rvol.toFixed(2)}× the recent average - check back after the session closes for a reliable comparison.`
    };
  }

  // CLOSED: the latest bar represents a complete trading session,
  // so the existing threshold-based comparison is valid.
  let signal = "Normal Volume";

  if (rvol >= 3) {
    signal = "Exceptional Volume";
  } else if (rvol >= 2) {
    signal = "High Volume";
  } else if (rvol >= 1.2) {
    signal = "Above Average Volume";
  } else if (rvol < 0.8) {
    signal = "Low Volume";
  }

  let explanation =
    "Trading activity is near its normal average.";

  if (signal === "Exceptional Volume") {
    explanation =
      "Trading activity is exceptionally high compared to the recent average.";
  } else if (signal === "High Volume") {
    explanation =
      "Trading activity is well above normal levels.";
  } else if (signal === "Above Average Volume") {
    explanation =
      "Trading activity is slightly above its recent average.";
  } else if (signal === "Low Volume") {
    explanation =
      "Trading activity is below its recent average.";
  }

  /*
    A CLOSED session can still mean the latest bar is from a prior
    day (weekend, holiday, or simply before today's session opens) -
    say so plainly rather than implying the number is "today's."
  */
  if (session.reason === "PRIOR_SESSION") {
    explanation += " (vs. last completed session)";
  }

  return { signal, explanation };
}

// ============================
// RVOL Service
// ============================

async function getRVOL(
  symbol,
  sharedHistory = null
) {
  const normalizedSymbol =
    normalizeSymbol(symbol);

  if (!normalizedSymbol) {
    return {
      success: false,
      error:
        "A valid ticker symbol is required."
    };
  }

  try {
    const history =
      sharedHistory ||
      await getHistory(
        normalizedSymbol
      );

    if (
      !history ||
      history.success !== true
    ) {
      return {
        success: false,

        provider:
          history?.provider ||
          "TwelveData",

        symbol:
          normalizedSymbol,

        error:
          history?.error ||
          "Unable to fetch historical market data."
      };
    }

    const volumeBars =
      getVolumeBars(history);

    if (
      volumeBars.length < 31
    ) {
      return {
        success: false,

        provider:
          history.provider ||
          "TwelveData",

        symbol:
          normalizedSymbol,

        error:
          "Insufficient historical volume data to calculate 30-day RVOL."
      };
    }

    const volumePrices =
      volumeBars.map((bar) => bar.volume);

    const latestBarDate =
      volumeBars[volumeBars.length - 1].date;

    const result =
      calculateRVOL(
        volumePrices
      );

    if (!result) {
      return {
        success: false,

        provider:
          history.provider ||
          "TwelveData",

        symbol:
          normalizedSymbol,

        error:
          "Unable to calculate RVOL."
      };
    }

    const todayVolume =
      Number(
        result.todayVolume
      );

    const averageVolume =
      Number(
        result.averageVolume
      );

    const rvol =
      Number(result.rvol);

    if (
      !Number.isFinite(
        todayVolume
      ) ||
      !Number.isFinite(
        averageVolume
      ) ||
      !Number.isFinite(rvol)
    ) {
      return {
        success: false,

        provider:
          history.provider ||
          "TwelveData",

        symbol:
          normalizedSymbol,

        error:
          "RVOL calculation returned invalid values."
      };
    }

    const session =
      resolveMarketSession({
        exchange:
          history.metadata?.exchange,
        timezone:
          history.metadata?.exchangeTimezone,
        latestBarDate
      });

    const { signal, explanation } =
      buildSignalAndExplanation({
        rvol,
        session
      });

    return {
      success: true,

      provider:
        history.provider ||
        "TwelveData",

      symbol:
        normalizedSymbol,

      todayVolume,

      averageVolume30:
        Math.round(
          averageVolume
        ),

      rvol:
        Number(
          rvol.toFixed(2)
        ),

      signal,

      explanation,

      session,

      dataSource:
        sharedHistory
          ? "Shared OHLCV"
          : "Market Engine"
    };
  } catch (error) {
    console.error(
      "RVOL Service Error:",
      error
    );

    return {
      success: false,

      symbol:
        normalizedSymbol,

      error:
        "Unable to calculate RVOL.",

      details:
        error.message
    };
  }
}

module.exports = {
  getRVOL
};
