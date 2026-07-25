const assert = require("assert");

const {
  analyzeSupportResistance,
  detectPivots,
  normalizeBars
} = require("../analysis/structure/supportResistanceEngine");

function candle(index, close, overrides = {}) {
  return {
    date: `2026-01-${String(index + 1).padStart(2, "0")}`,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1000 + index,
    ...overrides
  };
}

function buildWaveBars(length = 30) {
  return Array.from({ length }, (_, index) =>
    candle(index, 100 + Math.sin(index * Math.PI / 3) * 10)
  );
}

function buildRisingBars(length = 30) {
  return Array.from({ length }, (_, index) =>
    candle(index, 100 + index)
  );
}

const complete = analyzeSupportResistance({
  symbol: "WAVE",
  bars: buildWaveBars(),
  currentPrice: 100,
  options: { pivotWindow: 2 }
});

assert.strictEqual(complete.success, true);
assert.strictEqual(complete.status, "COMPLETE");
assert.strictEqual(complete.partialSuccess, false);
assert.strictEqual(complete.evidence.coveragePercent, 100);
assert.deepStrictEqual(complete.evidence.missing, []);

const unavailable = analyzeSupportResistance({
  symbol: "RISE",
  bars: buildRisingBars(),
  currentPrice: 130,
  options: { pivotWindow: 2 }
});

assert.strictEqual(unavailable.success, false);
assert.strictEqual(unavailable.status, "UNAVAILABLE");
assert.strictEqual(unavailable.partialSuccess, false);
assert.strictEqual(unavailable.evidence.coveragePercent, 0);
assert.deepStrictEqual(
  unavailable.evidence.missing,
  ["SWING_HIGHS", "SWING_LOWS"]
);
assert.strictEqual(unavailable.nearestSupport, null);
assert.strictEqual(unavailable.nearestResistance, null);

const oneSidedBars = buildRisingBars();
oneSidedBars[15] = candle(15, 115, {
  high: 130,
  low: 114
});

const partial = analyzeSupportResistance({
  symbol: "ONE",
  bars: oneSidedBars,
  currentPrice: 131,
  options: { pivotWindow: 2 }
});

assert.strictEqual(partial.success, true);
assert.strictEqual(partial.status, "PARTIAL");
assert.strictEqual(partial.partialSuccess, true);
assert.strictEqual(partial.evidence.coveragePercent, 50);
assert.deepStrictEqual(partial.evidence.missing, ["SWING_LOWS"]);

const barsWithMalformedCandle = buildWaveBars();
barsWithMalformedCandle[4] = candle(4, 105, {
  high: 102,
  low: 100,
  open: 101,
  close: 105
});

const normalized = normalizeBars(barsWithMalformedCandle);
assert.strictEqual(normalized.length, 29);
assert.deepStrictEqual(
  normalized.map((bar) => bar.index),
  Array.from({ length: 29 }, (_, index) => index)
);
assert.strictEqual(normalized[4].sourceIndex, 5);

const malformedResult = analyzeSupportResistance({
  symbol: "DIRTY",
  bars: barsWithMalformedCandle,
  currentPrice: 100,
  options: { pivotWindow: 2 }
});

assert.strictEqual(malformedResult.statistics.receivedBars, 30);
assert.strictEqual(malformedResult.statistics.barsAnalyzed, 29);
assert.strictEqual(malformedResult.statistics.droppedBars, 1);
assert.ok(
  malformedResult.warnings.some((warning) =>
    warning.includes("1 malformed OHLCV bar was excluded")
  )
);

const pivots = detectPivots(normalized, 2);
for (const pivot of [...pivots.swingHighs, ...pivots.swingLows]) {
  assert.ok(pivot.index >= 0 && pivot.index < normalized.length);
}

const fallbackPrice = analyzeSupportResistance({
  symbol: "FALLBACK",
  bars: buildWaveBars(),
  currentPrice: null,
  options: { pivotWindow: 2 }
});

assert.strictEqual(
  fallbackPrice.currentPrice,
  Number(buildWaveBars().at(-1).close.toFixed(2))
);

console.log(
  "Support/resistance reliability tests passed: evidence states, malformed-bar diagnostics, stable pivot indexes, and price fallback are truthful."
);
