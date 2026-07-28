// ============================================================
// AzaLens - Market Session Resolver
//
// Determines whether the latest available OHLCV bar represents a
// completed trading session or one still in progress, using the
// exchange's real IANA timezone (supplied per-symbol by the
// historical-data provider) rather than guessing from the ticker
// or assuming a single global market clock.
//
// Only US equities (NASDAQ/NYSE) are wired up today. To support
// another exchange, add an entry to EXCHANGE_TRADING_HOURS below -
// anything not listed here correctly resolves to UNKNOWN instead of
// assuming US hours apply globally, per AzaLens's fail-honest rule.
// ============================================================

const EXCHANGE_TRADING_HOURS = {
  NASDAQ: { open: "09:30", close: "16:00" },
  NYSE: { open: "09:30", close: "16:00" }
  // Add more exchanges as AzaLens expands beyond US equities, e.g.:
  // LSE: { open: "08:00", close: "16:30" },
  // ASX: { open: "10:00", close: "16:00" },
};

const STATUS = Object.freeze({
  OPEN: "OPEN",
  CLOSED: "CLOSED",
  UNKNOWN: "UNKNOWN"
});

function toDateOnly(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const match = value.trim().match(/^\d{4}-\d{2}-\d{2}/);

  return match ? match[0] : null;
}

function getExchangeLocalParts(timezone, now) {
  try {
    const dateFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });

    const timeFormatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit"
    });

    return {
      date: dateFormatter.format(now),
      time: timeFormatter.format(now)
    };
  } catch (error) {
    // An invalid/unrecognized IANA timezone string from the provider.
    return null;
  }
}

function toMinutesSinceMidnight(hhmm) {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm || "");

  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

/*
  Inputs are whatever the historical-data provider actually gave us -
  never guessed. When any required piece is missing (timezone, a
  known exchange, a parseable bar date), the status is UNKNOWN.
*/
function resolveMarketSession({
  exchange,
  timezone,
  latestBarDate,
  now = new Date()
}) {
  const barDate = toDateOnly(latestBarDate);
  const hours = exchange ? EXCHANGE_TRADING_HOURS[exchange] : null;

  const base = {
    exchange: exchange || null,
    timezone: timezone || null,
    latestBarDate: barDate
  };

  if (!barDate || !timezone || !hours) {
    return {
      ...base,
      status: STATUS.UNKNOWN,
      exchangeLocalDate: null,
      exchangeLocalTime: null,
      reason: !barDate
        ? "BAR_DATE_UNAVAILABLE"
        : !timezone
          ? "EXCHANGE_TIMEZONE_UNAVAILABLE"
          : "EXCHANGE_HOURS_NOT_CONFIGURED"
    };
  }

  const local = getExchangeLocalParts(timezone, now);

  if (!local) {
    return {
      ...base,
      status: STATUS.UNKNOWN,
      exchangeLocalDate: null,
      exchangeLocalTime: null,
      reason: "EXCHANGE_TIMEZONE_INVALID"
    };
  }

  if (barDate < local.date) {
    return {
      ...base,
      status: STATUS.CLOSED,
      exchangeLocalDate: local.date,
      exchangeLocalTime: local.time,
      reason: "PRIOR_SESSION"
    };
  }

  if (barDate > local.date) {
    // The bar is dated ahead of the exchange's local clock - a data
    // anomaly, not something this resolver should paper over.
    return {
      ...base,
      status: STATUS.UNKNOWN,
      exchangeLocalDate: local.date,
      exchangeLocalTime: local.time,
      reason: "BAR_DATE_IN_FUTURE"
    };
  }

  const nowMinutes = toMinutesSinceMidnight(local.time);
  const closeMinutes = toMinutesSinceMidnight(hours.close);

  if (nowMinutes === null || closeMinutes === null) {
    return {
      ...base,
      status: STATUS.UNKNOWN,
      exchangeLocalDate: local.date,
      exchangeLocalTime: local.time,
      reason: "TRADING_HOURS_INVALID"
    };
  }

  const sessionEnded = nowMinutes >= closeMinutes;

  return {
    ...base,
    status: sessionEnded ? STATUS.CLOSED : STATUS.OPEN,
    exchangeLocalDate: local.date,
    exchangeLocalTime: local.time,
    reason: sessionEnded
      ? "TODAY_SESSION_ENDED"
      : "TODAY_SESSION_IN_PROGRESS"
  };
}

module.exports = {
  STATUS,
  EXCHANGE_TRADING_HOURS,
  resolveMarketSession
};
