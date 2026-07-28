const assert = require("node:assert/strict");

const {
  STATUS,
  resolveMarketSession
} = require("../analysis/marketSession");

function run() {
  // 1. Bar dated before exchange-local today: CLOSED, prior session -
  //    covers weekends and holidays for free, no calendar needed.
  {
    const session = resolveMarketSession({
      exchange: "NASDAQ",
      timezone: "America/New_York",
      latestBarDate: "2026-07-27",
      now: new Date("2026-07-28T07:56:00Z") // 03:56 EDT, before open
    });

    assert.equal(session.status, STATUS.CLOSED);
    assert.equal(session.reason, "PRIOR_SESSION");
    assert.equal(session.exchangeLocalDate, "2026-07-28");
  }

  // 2. Bar dated today, exchange-local time before close: OPEN.
  {
    const session = resolveMarketSession({
      exchange: "NASDAQ",
      timezone: "America/New_York",
      latestBarDate: "2026-07-28",
      now: new Date("2026-07-28T17:00:00Z") // 13:00 EDT, mid-session
    });

    assert.equal(session.status, STATUS.OPEN);
    assert.equal(session.reason, "TODAY_SESSION_IN_PROGRESS");
  }

  // 3. Bar dated today, exchange-local time past close: CLOSED.
  {
    const session = resolveMarketSession({
      exchange: "NASDAQ",
      timezone: "America/New_York",
      latestBarDate: "2026-07-28",
      now: new Date("2026-07-28T21:30:00Z") // 17:30 EDT, after close
    });

    assert.equal(session.status, STATUS.CLOSED);
    assert.equal(session.reason, "TODAY_SESSION_ENDED");
  }

  // 4. Missing timezone: UNKNOWN, never guessed.
  {
    const session = resolveMarketSession({
      exchange: "NASDAQ",
      timezone: null,
      latestBarDate: "2026-07-28",
      now: new Date("2026-07-28T17:00:00Z")
    });

    assert.equal(session.status, STATUS.UNKNOWN);
    assert.equal(session.reason, "EXCHANGE_TIMEZONE_UNAVAILABLE");
  }

  // 5. Exchange not in the trading-hours table (e.g. a future
  //    non-US exchange not yet onboarded): UNKNOWN, not assumed
  //    to follow US hours.
  {
    const session = resolveMarketSession({
      exchange: "LSE",
      timezone: "Europe/London",
      latestBarDate: "2026-07-28",
      now: new Date("2026-07-28T10:00:00Z")
    });

    assert.equal(session.status, STATUS.UNKNOWN);
    assert.equal(session.reason, "EXCHANGE_HOURS_NOT_CONFIGURED");
  }

  // 6. Missing/unparseable bar date: UNKNOWN.
  {
    const session = resolveMarketSession({
      exchange: "NASDAQ",
      timezone: "America/New_York",
      latestBarDate: null,
      now: new Date("2026-07-28T17:00:00Z")
    });

    assert.equal(session.status, STATUS.UNKNOWN);
    assert.equal(session.reason, "BAR_DATE_UNAVAILABLE");
  }

  // 7. Bar dated ahead of the exchange's local clock: UNKNOWN, not
  //    silently trusted.
  {
    const session = resolveMarketSession({
      exchange: "NASDAQ",
      timezone: "America/New_York",
      latestBarDate: "2026-07-29",
      now: new Date("2026-07-28T17:00:00Z")
    });

    assert.equal(session.status, STATUS.UNKNOWN);
    assert.equal(session.reason, "BAR_DATE_IN_FUTURE");
  }

  // 8. Invalid IANA timezone string: UNKNOWN, not a thrown error.
  {
    const session = resolveMarketSession({
      exchange: "NASDAQ",
      timezone: "Not/A_Real_Zone",
      latestBarDate: "2026-07-28",
      now: new Date("2026-07-28T17:00:00Z")
    });

    assert.equal(session.status, STATUS.UNKNOWN);
    assert.equal(session.reason, "EXCHANGE_TIMEZONE_INVALID");
  }

  console.log("Market session resolver: all assertions passed.");
}

try {
  run();
} catch (error) {
  console.error("Market session resolver test failed:", error);
  process.exitCode = 1;
}
