"use strict";

const assert = require("node:assert/strict");
const {
  SCAN_UNIVERSE_LIMIT,
  analyzeBars,
  normalizeSymbols,
  scanWatchlist,
} = require("../services/scannerService");

function makeBars({
  count = 40,
  latestClose = 142,
  latestVolume = 2500,
} = {}) {
  const bars = Array.from({ length: count }, (_, index) => ({
    date: `2026-06-${String(index + 1).padStart(2, "0")}`,
    open: 100 + index,
    high: 102 + index,
    low: 98 + index,
    close: 100 + index,
    volume: 1000,
  }));
  bars.at(-1).close = latestClose;
  bars.at(-1).high = latestClose + 1;
  bars.at(-1).low = latestClose - 1;
  bars.at(-1).volume = latestVolume;
  return bars;
}

assert.deepEqual(
  normalizeSymbols([" aapl ", "MSFT", "AAPL"]),
  ["AAPL", "MSFT"]
);
assert.throws(
  () =>
    normalizeSymbols(
      Array.from(
        { length: SCAN_UNIVERSE_LIMIT + 1 },
        (_, index) => `S${index}`
      )
    ),
  /at most 20/
);

const observation = analyzeBars("AAPL", makeBars());
assert.equal(observation.status, "COMPLETE");
assert.ok(
  observation.observations.some(
    (item) => item.id === "relative-volume"
  )
);
assert.ok(
  observation.observations.some(
    (item) => item.id === "range-break"
  )
);

async function run() {
  let historyCalls = 0;
  const scan = await scanWatchlist(["AAPL", "MSFT"], {
    async getHistory(symbol, interval) {
      historyCalls += 1;
      assert.equal(interval, "1day");
      return {
        bars: makeBars({
          latestClose: symbol === "AAPL" ? 142 : 141,
        }),
      };
    },
  });

  assert.equal(historyCalls, 2);
  assert.equal(scan.symbolsTouched, 2);
  assert.equal(scan.providerCallsPlanned, 2);
  assert.equal(scan.shariahCalls, 0);
  assert.equal(scan.results.length, 2);
  assert.match(scan.disclaimer, /does not issue trade signals/i);

  let protectedCalls = 0;
  const protectedScan = await scanWatchlist(
    ["AAPL", "MSFT", "JPM"],
    {
      async getHistory() {
        protectedCalls += 1;
        return {
          code: "TWELVE_DATA_CREDIT_BUDGET_EXCEEDED",
          error: "Local credit budget exhausted.",
        };
      },
    }
  );
  assert.equal(protectedCalls, 1);
  assert.equal(protectedScan.results.length, 3);
  assert.ok(
    protectedScan.results.every(
      (result) => result.status === "UNAVAILABLE"
    )
  );
  assert.match(protectedScan.results[1].message, /not requested/i);

  console.log("Scanner service: all assertions passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
