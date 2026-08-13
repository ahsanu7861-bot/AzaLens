/*
 * ============================================================================
 * AzaLens — Evidence Agreement (independence-aware family model)
 *
 * The previous model counted nine indicators as nine independent votes and
 * published a percentage. Three of those nine could never express a direction,
 * six were derived from one shared close series, and one of them (Volume Spike)
 * was a deterministic function of another (RVOL). The published figure could
 * therefore never fall below 35 or rise above 78, reached an internal "100%"
 * on a single available indicator, and grew larger as a deadlock deepened.
 *
 * This model groups the readings into four evidence families, gives each family
 * one vote, and reports two separate facts: how many families support the
 * dominant lean, and how many families were usable at all. The denominator is
 * always four. There is no percentage.
 *
 * The grouping is structural — derived from how the indicators are computed —
 * and is deliberately labelled provisional. It is NOT empirically measured:
 * no historical sample exists in this repository from which indicator
 * dependence could be estimated. See docs/VERDICT_CONTRACT.md.
 * ============================================================================
 */

const BULLISH = "BULLISH";
const BEARISH = "BEARISH";
const NEUTRAL = "NEUTRAL";
const UNAVAILABLE = "UNAVAILABLE";

/*
 * The eight wire values. These exact strings cross the API boundary and are
 * mapped by services/guidanceContractService.js; anything unrecognised there
 * fails closed. frontend/src/types/analysis.ts declares the same eight
 * independently (it cannot import this CommonJS module) and both sides pin them
 * in their own test suite.
 */
const EVIDENCE_STATES = Object.freeze({
  UNAVAILABLE: "Evidence unavailable",
  INSUFFICIENT: "Insufficient evidence",
  NO_DIRECTION: "No directional evidence",
  CONFLICTING: "Conflicting evidence",
  LIMITED: "Limited evidence",
  LOW: "Low agreement",
  MODERATE: "Moderate agreement",
  HIGH: "High agreement"
});

const GRADED_EVIDENCE_STATES = Object.freeze([
  EVIDENCE_STATES.HIGH,
  EVIDENCE_STATES.MODERATE,
  EVIDENCE_STATES.LOW
]);

// ---------------------------------------------------------------------------
// Member readings
//
// Each reader turns one indicator result into a directional vote. An indicator
// that did not succeed is UNAVAILABLE - it never becomes NEUTRAL, because
// "we could not measure this" and "we measured this and it points nowhere" are
// different findings.
// ---------------------------------------------------------------------------

function includesAny(value, needles) {
  const text = String(value ?? "");
  return needles.some((needle) => text.includes(needle));
}

function readSignal(indicator, bullishNeedles, bearishNeedles) {
  if (indicator?.success !== true) return UNAVAILABLE;
  if (includesAny(indicator.signal, bullishNeedles)) return BULLISH;
  if (includesAny(indicator.signal, bearishNeedles)) return BEARISH;
  return NEUTRAL;
}

const MEMBER_READERS = {
  RSI: (i) => readSignal(i.rsi, ["Oversold"], ["Overbought"]),
  EMA: (i) => readSignal(i.ema, ["Above EMA"], ["Below EMA"]),
  SMA: (i) => readSignal(i.sma, ["Above SMA"], ["Below SMA"]),
  MACD: (i) => readSignal(i.macd, ["Bullish"], ["Bearish"]),
  "Bollinger Bands": (i) =>
    readSignal(i.bollinger, ["Above Upper Band", "Near Upper Band"], ["Below Lower Band", "Near Lower Band"]),
  Candlestick: (i) => {
    if (i.candlestick?.success !== true) return UNAVAILABLE;
    if (i.candlestick.bias === "Bullish") return BULLISH;
    if (i.candlestick.bias === "Bearish") return BEARISH;
    return NEUTRAL;
  },
  // On-balance volume signs cumulative volume by the direction of the close, so
  // it is the only directional reading that carries volume information.
  OBV: (i) => readSignal(i.obv, ["Accumulation"], ["Distribution"])
};

/*
 * The four evidence families.
 *
 * `minimumUsableMembers` is the availability threshold a family must meet before
 * it may vote at all. Trend position needs a majority of its three moving-average
 * readings; momentum needs both of its two distinct statistics; the single-member
 * families need their one member.
 */
const EVIDENCE_FAMILIES = Object.freeze([
  Object.freeze({
    id: "trendPosition",
    label: "Trend position",
    members: Object.freeze(["EMA", "SMA", "Bollinger Bands"]),
    minimumUsableMembers: 2,
    basis: "where price sits relative to a recent mean of the same close series"
  }),
  Object.freeze({
    id: "momentum",
    label: "Momentum",
    members: Object.freeze(["RSI", "MACD"]),
    minimumUsableMembers: 2,
    basis: "rate-of-change statistics of the same close series"
  }),
  Object.freeze({
    id: "priceAction",
    label: "Price action",
    members: Object.freeze(["Candlestick"]),
    minimumUsableMembers: 1,
    basis: "the shape of the most recent bar"
  }),
  Object.freeze({
    id: "volumeFlow",
    label: "Volume flow",
    members: Object.freeze(["OBV"]),
    minimumUsableMembers: 1,
    basis: "direction weighted by traded volume"
  })
]);

const EXPECTED_FAMILIES = EVIDENCE_FAMILIES.length;

/*
 * Context readings. ADX measures trend strength and RVOL measures participation;
 * neither expresses a direction, so neither votes. Volume Spike is omitted
 * entirely: services/volumeSpikeService.js derives it from getRVOL and passes
 * that same ratio into detectVolumeSpike, so counting both would count one
 * observation twice.
 */
const CONTEXT_READINGS = Object.freeze([
  Object.freeze({ name: "ADX", key: "adx", describes: "trend strength" }),
  Object.freeze({ name: "RVOL", key: "rvol", describes: "participation" })
]);

// ---------------------------------------------------------------------------
// Family aggregation
// ---------------------------------------------------------------------------

function assessFamily(family, indicators) {
  const members = family.members.map((name) => ({
    name,
    vote: MEMBER_READERS[name](indicators)
  }));

  const usable = members.filter((member) => member.vote !== UNAVAILABLE);

  if (usable.length < family.minimumUsableMembers) {
    return { id: family.id, label: family.label, vote: UNAVAILABLE, members };
  }

  const bullish = usable.filter((member) => member.vote === BULLISH).length;
  const bearish = usable.filter((member) => member.vote === BEARISH).length;

  /*
   * Once the family is usable its direction is the balance of its bullish and
   * bearish members. One directional member may therefore establish the family
   * when the other usable members are neutral - but not when a required member
   * is missing, because the threshold above would already have made the family
   * unavailable.
   */
  const vote = bullish > bearish ? BULLISH : bearish > bullish ? BEARISH : NEUTRAL;

  return { id: family.id, label: family.label, vote, members };
}

// ---------------------------------------------------------------------------
// Plain-language synthesis
//
// The backend owns this sentence. It never contains a percentage, and it states
// support and coverage against the fixed denominator of four.
// ---------------------------------------------------------------------------

function leanWord(direction) {
  return direction === BULLISH ? "bullish" : "bearish";
}

function buildSummary({ state, direction, supporting, opposing, neutral, usable, unavailable }) {
  if (state === EVIDENCE_STATES.UNAVAILABLE) {
    return "No evidence families are usable for this analysis.";
  }
  if (state === EVIDENCE_STATES.INSUFFICIENT) {
    return `Only ${usable} of ${EXPECTED_FAMILIES} evidence families is usable — not enough to assess agreement.`;
  }
  if (state === EVIDENCE_STATES.NO_DIRECTION) {
    return `All ${usable} usable evidence families are neutral; none expresses a direction.`;
  }
  if (state === EVIDENCE_STATES.CONFLICTING) {
    const tail = neutral > 0 ? `, with ${neutral} expressing no direction` : "";
    return `Directional evidence is split ${supporting} against ${opposing}${tail}.`;
  }

  const lead = `${supporting} of ${EXPECTED_FAMILIES} evidence families support a ${leanWord(direction)} lean.`;

  if (unavailable > 0) {
    const noun = unavailable === 1 ? "family is" : "families are";
    return `${lead} ${unavailable} ${noun} unavailable.`;
  }
  if (opposing > 0) {
    const noun = opposing === 1 ? "family opposes" : "families oppose";
    return `${lead} ${opposing} ${noun} it.`;
  }
  return lead;
}

function buildCoverageStatement(usable) {
  return `${usable} of ${EXPECTED_FAMILIES} evidence families usable.`;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function analyzeAgreement(rawIndicators) {
  const indicators =
    rawIndicators && typeof rawIndicators === "object" ? rawIndicators : {};

  const families = EVIDENCE_FAMILIES.map((family) => assessFamily(family, indicators));

  const bullishFamilies = families.filter((f) => f.vote === BULLISH).length;
  const bearishFamilies = families.filter((f) => f.vote === BEARISH).length;
  const neutralFamilies = families.filter((f) => f.vote === NEUTRAL).length;
  const unavailableFamilies = families.filter((f) => f.vote === UNAVAILABLE).length;
  const usableFamilies = EXPECTED_FAMILIES - unavailableFamilies;

  const hasLean = bullishFamilies !== bearishFamilies;
  const enoughFamilies = usableFamilies >= 2;

  const direction =
    enoughFamilies && hasLean
      ? bullishFamilies > bearishFamilies
        ? BULLISH
        : BEARISH
      : null;

  const supportingFamilies = direction
    ? Math.max(bullishFamilies, bearishFamilies)
    : Math.min(bullishFamilies, bearishFamilies);
  const opposingFamilies = direction
    ? Math.min(bullishFamilies, bearishFamilies)
    : Math.min(bullishFamilies, bearishFamilies);

  let evidenceState;

  if (usableFamilies === 0) {
    evidenceState = EVIDENCE_STATES.UNAVAILABLE;
  } else if (usableFamilies === 1) {
    evidenceState = EVIDENCE_STATES.INSUFFICIENT;
  } else if (bullishFamilies === 0 && bearishFamilies === 0) {
    evidenceState = EVIDENCE_STATES.NO_DIRECTION;
  } else if (bullishFamilies === bearishFamilies) {
    evidenceState = EVIDENCE_STATES.CONFLICTING;
  } else if (usableFamilies < EXPECTED_FAMILIES) {
    evidenceState = EVIDENCE_STATES.LIMITED;
  } else if (supportingFamilies === 4) {
    evidenceState = EVIDENCE_STATES.HIGH;
  } else if (supportingFamilies === 3) {
    evidenceState = EVIDENCE_STATES.MODERATE;
  } else {
    evidenceState = EVIDENCE_STATES.LOW;
  }

  // Counts published for insufficient/unavailable states are zero: no assessment
  // was formed, so there is no supporting or opposing side to report.
  const assessed = evidenceState !== EVIDENCE_STATES.UNAVAILABLE
    && evidenceState !== EVIDENCE_STATES.INSUFFICIENT;

  const support = {
    direction,
    supportingFamilies: assessed ? supportingFamilies : 0,
    opposingFamilies: assessed ? opposingFamilies : 0,
    neutralFamilies: assessed ? neutralFamilies : 0
  };

  const coverage = {
    usableFamilies,
    expectedFamilies: EXPECTED_FAMILIES,
    unavailableFamilies,
    families
  };

  const summary = buildSummary({
    state: evidenceState,
    direction,
    supporting: support.supportingFamilies,
    opposing: support.opposingFamilies,
    neutral: support.neutralFamilies,
    usable: usableFamilies,
    unavailable: unavailableFamilies
  });

  const context = CONTEXT_READINGS.map((reading) => ({
    name: reading.name,
    describes: reading.describes,
    available: indicators[reading.key]?.success === true
  }));

  /*
   * Established-evidence candidate, read by guidanceContractService (E1): a
   * dominant lean, backed by at least three of the four families, unopposed by a
   * larger side, and drawn from complete coverage.
   */
  const aligned =
    direction !== null &&
    usableFamilies === EXPECTED_FAMILIES &&
    support.supportingFamilies >= 3 &&
    support.supportingFamilies > support.opposingFamilies;

  // Indicator-level diagnostics. These describe the readings, not the verdict.
  const directionalMembers = families.flatMap((family) => family.members);
  const bullish = directionalMembers.filter((m) => m.vote === BULLISH).map((m) => m.name);
  const bearish = directionalMembers.filter((m) => m.vote === BEARISH).map((m) => m.name);
  const neutral = directionalMembers.filter((m) => m.vote === NEUTRAL).map((m) => m.name);
  const unavailableIndicators = directionalMembers
    .filter((m) => m.vote === UNAVAILABLE)
    .map((m) => m.name)
    .concat(context.filter((entry) => !entry.available).map((entry) => entry.name));

  const availableIndicators =
    bullish.length + bearish.length + neutral.length +
    context.filter((entry) => entry.available).length;

  const agreementDetails = families
    .flatMap((family) =>
      family.members.map((member) =>
        member.vote === UNAVAILABLE
          ? `${member.name} data is unavailable and was excluded from ${family.label.toLowerCase()}.`
          : `${member.name} reads ${member.vote.toLowerCase()} within ${family.label.toLowerCase()}.`
      )
    )
    .concat(
      context
        .filter((entry) => !entry.available)
        .map((entry) => `${entry.name} data is unavailable, so ${entry.describes} could not be reported.`)
    );

  return {
    // Canonical family contract
    evidenceState,
    support,
    coverage,
    summary,
    coverageStatement: buildCoverageStatement(usableFamilies),
    context,

    // Legacy-compatible directional word, still read by services that present
    // the lean (analysisTrustService's invalidation boundary among them).
    direction: direction === BULLISH ? "Bullish" : direction === BEARISH ? "Bearish" : "Mixed",
    agreement: aligned ? "aligned" : "conflicting",
    agreementSummary: summary,
    agreementDetails,

    // Indicator-level diagnostics
    bullish,
    bearish,
    neutral,
    bullishSignals: bullish.length,
    bearishSignals: bearish.length,
    neutralSignals: neutral.length,
    unavailableIndicators,
    availableIndicators,
    expectedIndicators: 9,
    totalIndicators: availableIndicators
  };
}

module.exports = {
  analyzeAgreement,
  EVIDENCE_STATES,
  GRADED_EVIDENCE_STATES,
  EVIDENCE_FAMILIES,
  EXPECTED_FAMILIES,
  CONTEXT_READINGS
};
