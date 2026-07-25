// ==================================================
// AzaLens
// Support & Resistance Service
// ==================================================

const DEFAULT_OPTIONS = Object.freeze({
  pivotWindow: 5,
  mergeThresholdPercent: 1,
  maximumZonesPerSide: 5,
  minimumBars: 20,
  minimumTouches: 1
});

// ==================================================
// Helpers
// ==================================================

function normalizeSymbol(symbol) {
  return String(symbol || "")
    .trim()
    .toUpperCase();
}

function toFiniteNumber(value, fallback = null) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    typeof value === "boolean"
  ) {
    return fallback;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(
    maximum,
    Math.max(minimum, value)
  );
}

function roundNumber(value, decimals = 2) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  const factor = 10 ** decimals;

  return (
    Math.round(number * factor) /
    factor
  );
}

function percentageDifference(
  valueA,
  valueB
) {
  const first =
    toFiniteNumber(valueA);

  const second =
    toFiniteNumber(valueB);

  if (
    first === null ||
    second === null ||
    first === 0 ||
    second === 0
  ) {
    return null;
  }

  const reference =
    (Math.abs(first) +
      Math.abs(second)) /
    2;

  if (reference === 0) {
    return null;
  }

  return (
    Math.abs(first - second) /
    reference
  ) * 100;
}

function calculateDistancePercent(
  level,
  currentPrice
) {
  const normalizedLevel =
    toFiniteNumber(level);

  const normalizedPrice =
    toFiniteNumber(currentPrice);

  if (
    normalizedLevel === null ||
    normalizedPrice === null ||
    normalizedPrice === 0
  ) {
    return null;
  }

  return (
    Math.abs(
      normalizedPrice -
      normalizedLevel
    ) /
    normalizedPrice
  ) * 100;
}

function normalizeDate(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    typeof value === "number"
  ) {
    /*
      Unix timestamps from Finnhub are normally
      measured in seconds.

      JavaScript timestamps are measured in
      milliseconds.
    */
    const milliseconds =
      value < 1000000000000
        ? value * 1000
        : value;

    const date =
      new Date(milliseconds);

    return Number.isNaN(
      date.getTime()
    )
      ? null
      : date.toISOString();
  }

  const date = new Date(value);

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date.toISOString();
}

function calculateAverage(values) {
  if (
    !Array.isArray(values) ||
    values.length === 0
  ) {
    return null;
  }

  const validValues =
    values.filter(
      Number.isFinite
    );

  if (validValues.length === 0) {
    return null;
  }

  const total =
    validValues.reduce(
      (sum, value) =>
        sum + value,
      0
    );

  return (
    total /
    validValues.length
  );
}

// ==================================================
// OHLCV Normalization
// ==================================================

function normalizeBars(rawBars) {
  if (!Array.isArray(rawBars)) {
    return [];
  }

  return rawBars
    .map((bar, index) => {
      if (
        !bar ||
        typeof bar !== "object"
      ) {
        return null;
      }

      const high =
        toFiniteNumber(bar.high);

      const low =
        toFiniteNumber(bar.low);

      const open =
        toFiniteNumber(bar.open);

      const close =
        toFiniteNumber(bar.close);

      const volume =
        toFiniteNumber(
          bar.volume,
          0
        );

      if (
        high === null ||
        low === null ||
        open === null ||
        close === null
      ) {
        return null;
      }

      if (
        high < low ||
        high <= 0 ||
        low <= 0 ||
        open <= 0 ||
        close <= 0 ||
        open < low ||
        open > high ||
        close < low ||
        close > high
      ) {
        return null;
      }

      return {
        sourceIndex: index,

        date:
          bar.date ??
          bar.datetime ??
          bar.timestamp ??
          bar.time ??
          index,

        normalizedDate:
          normalizeDate(
            bar.date ??
            bar.datetime ??
            bar.timestamp ??
            bar.time
          ),

        open,
        high,
        low,
        close,
        volume
      };
    })
    .filter(Boolean)
    .map((bar, index) => ({
      ...bar,
      index
    }));
}

// ==================================================
// Pivot Detection
// ==================================================

function isSwingHigh(
  bars,
  currentIndex,
  pivotWindow
) {
  const currentHigh =
    bars[currentIndex]?.high;

  if (!Number.isFinite(currentHigh)) {
    return false;
  }

  for (
    let offset = 1;
    offset <= pivotWindow;
    offset += 1
  ) {
    const previousHigh =
      bars[
        currentIndex - offset
      ]?.high;

    const nextHigh =
      bars[
        currentIndex + offset
      ]?.high;

    if (
      !Number.isFinite(previousHigh) ||
      !Number.isFinite(nextHigh)
    ) {
      return false;
    }

    /*
      The pivot must be strictly higher than
      every candle on both sides.

      Equal highs do not count as separate
      swing highs. This helps prevent duplicate
      pivots from flat price structures.
    */
    if (
      currentHigh <= previousHigh ||
      currentHigh <= nextHigh
    ) {
      return false;
    }
  }

  return true;
}

function isSwingLow(
  bars,
  currentIndex,
  pivotWindow
) {
  const currentLow =
    bars[currentIndex]?.low;

  if (!Number.isFinite(currentLow)) {
    return false;
  }

  for (
    let offset = 1;
    offset <= pivotWindow;
    offset += 1
  ) {
    const previousLow =
      bars[
        currentIndex - offset
      ]?.low;

    const nextLow =
      bars[
        currentIndex + offset
      ]?.low;

    if (
      !Number.isFinite(previousLow) ||
      !Number.isFinite(nextLow)
    ) {
      return false;
    }

    /*
      The pivot must be strictly lower than
      every candle on both sides.
    */
    if (
      currentLow >= previousLow ||
      currentLow >= nextLow
    ) {
      return false;
    }
  }

  return true;
}

function detectPivots(
  bars,
  pivotWindow
) {
  const swingHighs = [];
  const swingLows = [];

  if (
    !Array.isArray(bars) ||
    bars.length <
      pivotWindow * 2 + 1
  ) {
    return {
      swingHighs,
      swingLows
    };
  }

  for (
    let index = pivotWindow;
    index <
    bars.length - pivotWindow;
    index += 1
  ) {
    const bar = bars[index];

    if (
      isSwingHigh(
        bars,
        index,
        pivotWindow
      )
    ) {
      swingHighs.push({
        type: "resistance",
        price: bar.high,
        index,
        date: bar.date,
        normalizedDate:
          bar.normalizedDate,
        volume: bar.volume
      });
    }

    if (
      isSwingLow(
        bars,
        index,
        pivotWindow
      )
    ) {
      swingLows.push({
        type: "support",
        price: bar.low,
        index,
        date: bar.date,
        normalizedDate:
          bar.normalizedDate,
        volume: bar.volume
      });
    }
  }

  return {
    swingHighs,
    swingLows
  };
}

// ==================================================
// Zone Clustering
// ==================================================

function createInitialZone(pivot) {
  return {
    type: pivot.type,
    pivots: [pivot],
    prices: [pivot.price],
    lowerBound: pivot.price,
    upperBound: pivot.price,
    centerPrice: pivot.price
  };
}

function recalculateZone(zone) {
  const prices =
    zone.pivots.map(
      (pivot) => pivot.price
    );

  const lowerBound =
    Math.min(...prices);

  const upperBound =
    Math.max(...prices);

  const centerPrice =
    calculateAverage(prices);

  return {
    ...zone,
    prices,
    lowerBound,
    upperBound,
    centerPrice
  };
}

function shouldMergePivotIntoZone(
  pivot,
  zone,
  mergeThresholdPercent
) {
  const difference =
    percentageDifference(
      pivot.price,
      zone.centerPrice
    );

  if (difference === null) {
    return false;
  }

  return (
    difference <=
    mergeThresholdPercent
  );
}

function clusterPivots(
  pivots,
  mergeThresholdPercent
) {
  if (
    !Array.isArray(pivots) ||
    pivots.length === 0
  ) {
    return [];
  }

  /*
    Sorting by price lets nearby levels
    naturally form adjacent clusters.
  */
  const sortedPivots =
    [...pivots].sort(
      (first, second) =>
        first.price -
        second.price
    );

  const zones = [];

  for (
    const pivot of sortedPivots
  ) {
    let bestZoneIndex = -1;
    let smallestDifference =
      Number.POSITIVE_INFINITY;

    for (
      let zoneIndex = 0;
      zoneIndex < zones.length;
      zoneIndex += 1
    ) {
      const zone =
        zones[zoneIndex];

      const difference =
        percentageDifference(
          pivot.price,
          zone.centerPrice
        );

      if (
        difference !== null &&
        difference <=
          mergeThresholdPercent &&
        difference <
          smallestDifference
      ) {
        smallestDifference =
          difference;

        bestZoneIndex =
          zoneIndex;
      }
    }

    if (bestZoneIndex === -1) {
      zones.push(
        createInitialZone(pivot)
      );

      continue;
    }

    zones[
      bestZoneIndex
    ].pivots.push(pivot);

    zones[
      bestZoneIndex
    ] = recalculateZone(
      zones[bestZoneIndex]
    );
  }

  return zones.map(
    recalculateZone
  );
}

// ==================================================
// Zone Scoring
// ==================================================

function calculateRecencyScore(
  latestPivotIndex,
  totalBars
) {
  if (
    !Number.isFinite(
      latestPivotIndex
    ) ||
    !Number.isFinite(totalBars) ||
    totalBars <= 1
  ) {
    return 0;
  }

  const barsAgo =
    Math.max(
      0,
      totalBars -
        1 -
        latestPivotIndex
    );

  /*
    A pivot on the latest available bar receives
    a recency score of 100.

    The score gradually declines as the pivot
    becomes older.
  */
  return clamp(
    100 -
      (barsAgo /
        Math.max(
          totalBars - 1,
          1
        )) *
        100,
    0,
    100
  );
}

function calculateTouchScore(touches) {
  const normalizedTouches =
    Math.max(
      0,
      Number(touches) || 0
    );

  /*
    One touch starts the zone.

    Additional touches strengthen it,
    with the score capped at 100.
  */
  return clamp(
    normalizedTouches * 20,
    0,
    100
  );
}

function calculateVolumeScore(
  pivots,
  bars
) {
  if (
    !Array.isArray(pivots) ||
    pivots.length === 0 ||
    !Array.isArray(bars) ||
    bars.length === 0
  ) {
    return 50;
  }

  const allVolumes =
    bars
      .map((bar) => bar.volume)
      .filter(
        (volume) =>
          Number.isFinite(volume) &&
          volume > 0
      );

  const pivotVolumes =
    pivots
      .map(
        (pivot) =>
          pivot.volume
      )
      .filter(
        (volume) =>
          Number.isFinite(volume) &&
          volume > 0
      );

  const averageMarketVolume =
    calculateAverage(allVolumes);

  const averagePivotVolume =
    calculateAverage(pivotVolumes);

  if (
    !Number.isFinite(
      averageMarketVolume
    ) ||
    !Number.isFinite(
      averagePivotVolume
    ) ||
    averageMarketVolume <= 0
  ) {
    return 50;
  }

  const volumeRatio =
    averagePivotVolume /
    averageMarketVolume;

  return clamp(
    volumeRatio * 50,
    0,
    100
  );
}

function calculateCompactnessScore(
  lowerBound,
  upperBound,
  centerPrice
) {
  if (
    !Number.isFinite(lowerBound) ||
    !Number.isFinite(upperBound) ||
    !Number.isFinite(centerPrice) ||
    centerPrice <= 0
  ) {
    return 0;
  }

  const zoneWidthPercent =
    (
      (upperBound -
        lowerBound) /
      centerPrice
    ) * 100;

  /*
    Narrow, repeatedly tested zones receive
    a higher compactness score.
  */
  return clamp(
    100 -
      zoneWidthPercent * 50,
    0,
    100
  );
}

function scoreZone(
  zone,
  bars,
  currentPrice
) {
  const touches =
    zone.pivots.length;

  const latestPivot =
    [...zone.pivots].sort(
      (first, second) =>
        second.index -
        first.index
    )[0];

  const oldestPivot =
    [...zone.pivots].sort(
      (first, second) =>
        first.index -
        second.index
    )[0];

  const recencyScore =
    calculateRecencyScore(
      latestPivot?.index,
      bars.length
    );

  const touchScore =
    calculateTouchScore(
      touches
    );

  const volumeScore =
    calculateVolumeScore(
      zone.pivots,
      bars
    );

  const compactnessScore =
    calculateCompactnessScore(
      zone.lowerBound,
      zone.upperBound,
      zone.centerPrice
    );

  /*
    Weighting:

    Touches:      40%
    Recency:      30%
    Volume:       15%
    Compactness:  15%
  */
  const rawStrength =
    touchScore * 0.4 +
    recencyScore * 0.3 +
    volumeScore * 0.15 +
    compactnessScore * 0.15;

  const strengthScore =
    roundNumber(
      clamp(
        rawStrength,
        0,
        100
      ),
      1
    );

  const strength =
    roundNumber(
      strengthScore / 10,
      1
    );

  let classification =
    "Weak";

  if (strengthScore >= 80) {
    classification =
      "Very Strong";
  } else if (
    strengthScore >= 65
  ) {
    classification =
      "Strong";
  } else if (
    strengthScore >= 45
  ) {
    classification =
      "Moderate";
  }

  const distancePercent =
    calculateDistancePercent(
      zone.centerPrice,
      currentPrice
    );

  return {
    type: zone.type,

    zone: {
      low:
        roundNumber(
          zone.lowerBound
        ),

      high:
        roundNumber(
          zone.upperBound
        ),

      center:
        roundNumber(
          zone.centerPrice
        ),

      width:
        roundNumber(
          zone.upperBound -
            zone.lowerBound
        ),

      widthPercent:
        roundNumber(
          zone.centerPrice > 0
            ? (
                (
                  zone.upperBound -
                  zone.lowerBound
                ) /
                zone.centerPrice
              ) * 100
            : null
        )
    },

    touches,

    strength,
    strengthScore,
    classification,

    distancePercent:
      roundNumber(
        distancePercent
      ),

    latestTouch: {
      date:
        latestPivot?.date ??
        null,

      normalizedDate:
        latestPivot
          ?.normalizedDate ??
        null,

      barIndex:
        latestPivot?.index ??
        null,

      barsAgo:
        Number.isFinite(
          latestPivot?.index
        )
          ? bars.length -
            1 -
            latestPivot.index
          : null
    },

    oldestTouch: {
      date:
        oldestPivot?.date ??
        null,

      normalizedDate:
        oldestPivot
          ?.normalizedDate ??
        null,

      barIndex:
        oldestPivot?.index ??
        null
    },

    scoreComponents: {
      touches:
        roundNumber(
          touchScore,
          1
        ),

      recency:
        roundNumber(
          recencyScore,
          1
        ),

      volume:
        roundNumber(
          volumeScore,
          1
        ),

      compactness:
        roundNumber(
          compactnessScore,
          1
        )
    },

    pivotPrices:
      zone.pivots
        .map(
          (pivot) =>
            roundNumber(
              pivot.price
            )
        )
        .sort(
          (first, second) =>
            first - second
        )
  };
}

// ==================================================
// Zone Classification
// ==================================================

function classifyZones(
  zones,
  currentPrice
) {
  const support = [];
  const resistance = [];
  const overlapping = [];

  for (const zone of zones) {
    const lower =
      zone.zone.low;

    const upper =
      zone.zone.high;

    if (
      !Number.isFinite(lower) ||
      !Number.isFinite(upper)
    ) {
      continue;
    }

    if (
      upper <
      currentPrice
    ) {
      support.push({
        ...zone,
        relationToPrice:
          "Below Current Price"
      });

      continue;
    }

    if (
      lower >
      currentPrice
    ) {
      resistance.push({
        ...zone,
        relationToPrice:
          "Above Current Price"
      });

      continue;
    }

    overlapping.push({
      ...zone,
      relationToPrice:
        "Current Price Inside Zone"
    });
  }

  support.sort(
    (first, second) =>
      second.zone.center -
      first.zone.center
  );

  resistance.sort(
    (first, second) =>
      first.zone.center -
      second.zone.center
  );

  overlapping.sort(
    (first, second) =>
      second.strengthScore -
      first.strengthScore
  );

  return {
    support,
    resistance,
    overlapping
  };
}

// ==================================================
// Public Analysis Function
// ==================================================

function analyzeSupportResistance({
  symbol,
  bars,
  currentPrice,
  options = {}
} = {}) {
  const normalizedSymbol =
    normalizeSymbol(symbol);

  const startedAt =
    Date.now();

  const configuration = {
    ...DEFAULT_OPTIONS,
    ...options
  };

  const pivotWindow =
    Math.max(
      1,
      Math.floor(
        toFiniteNumber(
          configuration.pivotWindow,
          DEFAULT_OPTIONS.pivotWindow
        )
      )
    );

  const mergeThresholdPercent =
    clamp(
      toFiniteNumber(
        configuration.mergeThresholdPercent,
        DEFAULT_OPTIONS
          .mergeThresholdPercent
      ),
      0.01,
      10
    );

  const maximumZonesPerSide =
    Math.max(
      1,
      Math.floor(
        toFiniteNumber(
          configuration.maximumZonesPerSide,
          DEFAULT_OPTIONS
            .maximumZonesPerSide
        )
      )
    );

  const minimumBars =
    Math.max(
      pivotWindow * 2 + 1,
      Math.floor(
        toFiniteNumber(
          configuration.minimumBars,
          DEFAULT_OPTIONS.minimumBars
        )
      )
    );

  const minimumTouches =
    Math.max(
      1,
      Math.floor(
        toFiniteNumber(
          configuration.minimumTouches,
          DEFAULT_OPTIONS.minimumTouches
        )
      )
    );

  const normalizedBars =
    normalizeBars(bars);

  const receivedBars =
    Array.isArray(bars)
      ? bars.length
      : 0;

  const droppedBars =
    Math.max(
      0,
      receivedBars -
        normalizedBars.length
    );

  const normalizedCurrentPrice =
    toFiniteNumber(
      currentPrice,
      normalizedBars[
        normalizedBars.length - 1
      ]?.close ?? null
    );

  if (!normalizedSymbol) {
    return {
      success: false,
      symbol: normalizedSymbol,
      error:
        "A valid ticker symbol is required.",

      performance: {
        durationMs:
          Date.now() -
          startedAt
      }
    };
  }

  if (
    normalizedBars.length <
    minimumBars
  ) {
    return {
      success: false,
      symbol: normalizedSymbol,

      error:
        `At least ${minimumBars} valid OHLCV bars are required for support and resistance analysis.`,

      dataSource:
        "Shared OHLCV",

      configuration: {
        pivotWindow,
        mergeThresholdPercent,
        maximumZonesPerSide,
        minimumBars,
        minimumTouches
      },

      diagnostics: {
        receivedBars:
          receivedBars,

        validBars:
          normalizedBars.length,

        droppedBars
      },

      performance: {
        durationMs:
          Date.now() -
          startedAt
      }
    };
  }

  if (
    normalizedCurrentPrice === null ||
    normalizedCurrentPrice <= 0
  ) {
    return {
      success: false,
      symbol: normalizedSymbol,

      error:
        "A valid current price is required for support and resistance analysis.",

      dataSource:
        "Shared OHLCV",

      performance: {
        durationMs:
          Date.now() -
          startedAt
      }
    };
  }

  const {
    swingHighs,
    swingLows
  } = detectPivots(
    normalizedBars,
    pivotWindow
  );

  const resistanceClusters =
    clusterPivots(
      swingHighs,
      mergeThresholdPercent
    );

  const supportClusters =
    clusterPivots(
      swingLows,
      mergeThresholdPercent
    );

  /*
    All pivot clusters are later classified
    according to their current relationship
    with price.

    This means an old resistance zone that
    now sits below price can correctly behave
    as support.
  */
  const scoredZones = [
    ...resistanceClusters,
    ...supportClusters
  ]
    .map((zone) =>
      scoreZone(
        zone,
        normalizedBars,
        normalizedCurrentPrice
      )
    )
    .filter(
      (zone) =>
        zone.touches >=
        minimumTouches
    );

  const classified =
    classifyZones(
      scoredZones,
      normalizedCurrentPrice
    );

  const support =
    classified.support.slice(
      0,
      maximumZonesPerSide
    );

  const resistance =
    classified.resistance.slice(
      0,
      maximumZonesPerSide
    );

  const overlapping =
    classified.overlapping.slice(
      0,
      maximumZonesPerSide
    );

  const nearestSupport =
    support[0] || null;

  const nearestResistance =
    resistance[0] || null;

  const pricePosition = {
    currentPrice:
      roundNumber(
        normalizedCurrentPrice
      ),

    nearestSupportDistancePercent:
      nearestSupport
        ?.distancePercent ??
      null,

    nearestResistanceDistancePercent:
      nearestResistance
        ?.distancePercent ??
      null,

    insideZone:
      overlapping.length > 0,

    overlappingZone:
      overlapping[0] || null
  };

  const warnings = [];

  const evidenceStatus =
    swingHighs.length > 0 &&
    swingLows.length > 0
      ? "COMPLETE"
      : swingHighs.length > 0 ||
          swingLows.length > 0
        ? "PARTIAL"
        : "UNAVAILABLE";

  const evidenceCoveragePercent =
    (
      Number(
        swingHighs.length > 0
      ) +
      Number(
        swingLows.length > 0
      )
    ) * 50;

  const missingEvidence = [];

  if (swingHighs.length === 0) {
    missingEvidence.push(
      "SWING_HIGHS"
    );

    warnings.push(
      "No confirmed swing highs were detected."
    );
  }

  if (swingLows.length === 0) {
    missingEvidence.push(
      "SWING_LOWS"
    );

    warnings.push(
      "No confirmed swing lows were detected."
    );
  }

  if (droppedBars > 0) {
    warnings.push(
      `${droppedBars} malformed OHLCV ${
        droppedBars === 1
          ? "bar was"
          : "bars were"
      } excluded before swing detection.`
    );
  }

  if (!nearestSupport) {
    warnings.push(
      "No confirmed support zone was found below the current price."
    );
  }

  if (!nearestResistance) {
    warnings.push(
      "No confirmed resistance zone was found above the current price."
    );
  }

  return {
    success:
      evidenceStatus !==
      "UNAVAILABLE",
    status: evidenceStatus,
    partialSuccess:
      evidenceStatus === "PARTIAL",
    provider: "AzaLens",
    symbol: normalizedSymbol,

    currentPrice:
      roundNumber(
        normalizedCurrentPrice
      ),

    methodology: {
      pivotDefinition:
        `A swing high or low must be higher or lower than the ${pivotWindow} candles before and after it.`,

      pivotWindow,

      mergeRule:
        `Pivot levels within ${roundNumber(
          mergeThresholdPercent,
          2
        )}% are merged into one zone.`,

      mergeThresholdPercent,

      zoneBehavior:
        "Historical resistance may become support after price moves above it, and historical support may become resistance after price moves below it."
    },

    nearestSupport,
    nearestResistance,

    support,
    resistance,
    overlappingZones:
      overlapping,

    pricePosition,

    statistics: {
      receivedBars,

      barsAnalyzed:
        normalizedBars.length,

      droppedBars,

      swingHighsDetected:
        swingHighs.length,

      swingLowsDetected:
        swingLows.length,

      rawPivotCount:
        swingHighs.length +
        swingLows.length,

      supportClusters:
        supportClusters.length,

      resistanceClusters:
        resistanceClusters.length,

      totalZones:
        scoredZones.length,

      supportZonesBelowPrice:
        classified.support.length,

      resistanceZonesAbovePrice:
        classified.resistance.length,

      overlappingZones:
        classified
          .overlapping.length
    },

    warnings,

    evidence: {
      status: evidenceStatus,
      coveragePercent:
        evidenceCoveragePercent,
      required:
        [
          "SWING_HIGHS",
          "SWING_LOWS"
        ],
      missing:
        missingEvidence
    },

    dataSource:
      "Shared OHLCV",

    performance: {
      durationMs:
        Date.now() -
        startedAt
    }
  };
}

// ==================================================
// Exports
// ==================================================

module.exports = {
  analyzeSupportResistance,
  detectPivots,
  clusterPivots,
  normalizeBars
};
