"use strict";

const { RSI } = require("technicalindicators");
const { getHistory } = require("./marketEngine");

const SCAN_UNIVERSE_LIMIT = 20;
const MINIMUM_BARS = 31;

function normalizeSymbols(symbols) {
  if (!Array.isArray(symbols)) {
    throw new Error("Select at least one watchlist stock.");
  }

  const normalized = [
    ...new Set(
      symbols.map((symbol) =>
        String(symbol || "").trim().toUpperCase()
      )
    ),
  ].filter(Boolean);

  if (normalized.length === 0) {
    throw new Error("Select at least one watchlist stock.");
  }

  if (normalized.length > SCAN_UNIVERSE_LIMIT) {
    throw new Error(
      `A scan can touch at most ${SCAN_UNIVERSE_LIMIT} symbols.`
    );
  }

  if (
    normalized.some(
      (symbol) => !/^[A-Z0-9.\-]{1,15}$/.test(symbol)
    )
  ) {
    throw new Error("One or more stock symbols are invalid.");
  }

  return normalized;
}

function finiteBars(history) {
  const source = Array.isArray(history?.bars)
    ? history.bars
    : [];

  return source.filter(
    (bar) =>
      Number.isFinite(Number(bar?.close)) &&
      Number.isFinite(Number(bar?.high)) &&
      Number.isFinite(Number(bar?.low)) &&
      Number.isFinite(Number(bar?.volume))
  );
}

function average(values) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) /
    values.length;
}

function round(value, digits = 2) {
  return Number(Number(value).toFixed(digits));
}

function buildObservation(id, label, detail, tone = "neutral") {
  return { id, label, detail, tone };
}

function analyzeBars(symbol, bars) {
  if (bars.length < MINIMUM_BARS) {
    return {
      symbol,
      status: "UNAVAILABLE",
      message: `At least ${MINIMUM_BARS} daily bars are required.`,
      observations: [],
    };
  }

  const latest = bars.at(-1);
  const previous = bars.at(-2);
  const prior20 = bars.slice(-21, -1);
  const previous30 = bars.slice(-31, -1);
  const closes = bars.map((bar) => Number(bar.close));
  const latestClose = Number(latest.close);
  const previousClose = Number(previous.close);
  const dailyChangePercent =
    previousClose === 0
      ? null
      : ((latestClose - previousClose) / previousClose) * 100;
  const averageVolume30 = average(
    previous30.map((bar) => Number(bar.volume))
  );
  const relativeVolume =
    averageVolume30 && averageVolume30 > 0
      ? Number(latest.volume) / averageVolume30
      : null;
  const prior20High = Math.max(
    ...prior20.map((bar) => Number(bar.high))
  );
  const prior20Low = Math.min(
    ...prior20.map((bar) => Number(bar.low))
  );
  const sma20 = average(
    prior20.map((bar) => Number(bar.close))
  );
  const rsiValues = RSI.calculate({
    values: closes,
    period: 14,
  });
  const rsi14 = rsiValues.at(-1) ?? null;
  const observations = [];

  if (relativeVolume !== null && relativeVolume >= 1.5) {
    observations.push(
      buildObservation(
        "relative-volume",
        `RVOL ${round(relativeVolume)}×`,
        "Unusual participation versus the previous 30 sessions.",
        "attention"
      )
    );
  }

  if (latestClose > prior20High) {
    observations.push(
      buildObservation(
        "range-break",
        "Above prior 20-day range",
        "The latest close finished above the previous 20-session high.",
        "positive"
      )
    );
  } else if (latestClose < prior20Low) {
    observations.push(
      buildObservation(
        "range-break",
        "Below prior 20-day range",
        "The latest close finished below the previous 20-session low.",
        "critical"
      )
    );
  }

  if (rsi14 !== null && rsi14 >= 70) {
    observations.push(
      buildObservation(
        "rsi",
        `RSI ${round(rsi14, 1)}`,
        "Momentum is in the conventionally overbought zone.",
        "attention"
      )
    );
  } else if (rsi14 !== null && rsi14 <= 30) {
    observations.push(
      buildObservation(
        "rsi",
        `RSI ${round(rsi14, 1)}`,
        "Momentum is in the conventionally oversold zone.",
        "attention"
      )
    );
  }

  if (
    dailyChangePercent !== null &&
    Math.abs(dailyChangePercent) >= 3
  ) {
    observations.push(
      buildObservation(
        "daily-move",
        `${dailyChangePercent >= 0 ? "+" : ""}${round(
          dailyChangePercent
        )}% daily move`,
        "The latest close moved at least 3% from the prior close.",
        dailyChangePercent >= 0 ? "positive" : "critical"
      )
    );
  }

  if (observations.length === 0) {
    observations.push(
      buildObservation(
        "no-threshold",
        "No threshold event",
        "No configured price, volume or momentum threshold was crossed."
      )
    );
  }

  return {
    symbol,
    status: "COMPLETE",
    asOf: latest.date || null,
    metrics: {
      close: round(latestClose),
      dailyChangePercent:
        dailyChangePercent === null
          ? null
          : round(dailyChangePercent),
      relativeVolume:
        relativeVolume === null
          ? null
          : round(relativeVolume),
      rsi14: rsi14 === null ? null : round(rsi14, 1),
      sma20: sma20 === null ? null : round(sma20),
      prior20High: round(prior20High),
      prior20Low: round(prior20Low),
    },
    observations,
  };
}

async function scanWatchlist(
  symbols,
  dependencies = {}
) {
  const normalizedSymbols = normalizeSymbols(symbols);
  const historyLoader =
    dependencies.getHistory || getHistory;
  const results = [];

  // Deliberately sequential: one bounded provider request per symbol,
  // avoiding a burst that can overwhelm low-tier rate limits.
  for (let index = 0; index < normalizedSymbols.length; index += 1) {
    const symbol = normalizedSymbols[index];
    try {
      const history = await historyLoader(symbol, "1day");
      if (history?.code === "TWELVE_DATA_CREDIT_BUDGET_EXCEEDED") {
        const budgetError = new Error(history.error);
        budgetError.code = history.code;
        throw budgetError;
      }
      const bars = finiteBars(history);
      results.push(analyzeBars(symbol, bars));
    } catch (error) {
      results.push({
        symbol,
        status: "UNAVAILABLE",
        message: "Historical data was unavailable for this symbol.",
        observations: [],
      });
      if (error?.code === "TWELVE_DATA_CREDIT_BUDGET_EXCEEDED") {
        for (const unrequested of normalizedSymbols.slice(index + 1)) {
          results.push({
            symbol: unrequested,
            status: "UNAVAILABLE",
            message: "Historical data was not requested because the local provider credit budget was exhausted.",
            observations: [],
          });
        }
        break;
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    universe: "WATCHLIST_SELECTION",
    symbolsTouched: normalizedSymbols.length,
    universeLimit: SCAN_UNIVERSE_LIMIT,
    providerCallsPlanned: normalizedSymbols.length,
    shariahCalls: 0,
    methodology:
      "Daily price, volume and momentum observations from historical bars.",
    disclaimer:
      "Research observations only. This scanner does not issue trade signals or Shariah verdicts.",
    results,
  };
}

module.exports = {
  MINIMUM_BARS,
  SCAN_UNIVERSE_LIMIT,
  analyzeBars,
  normalizeSymbols,
  scanWatchlist,
};
