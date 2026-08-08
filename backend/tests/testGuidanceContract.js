"use strict";

/*
 * Rule 6 verdict contract. Specification: docs/VERDICT_CONTRACT.md.
 *
 * These tests exist to hold two properties that were previously untrue:
 *   1. Unrecognised input fails closed instead of producing the most confident label.
 *   2. "Established evidence" is a real gate, decided by inputs that are independent
 *      of the confirmation condition it is so easily confused with.
 */

const assert = require("node:assert/strict");
const {
  PUBLIC_LABELS,
  NO_CONFIRMATION_AVAILABLE,
  buildGuidanceContract,
  findCoherenceViolation,
  applyCoherenceGuard
} = require("../services/guidanceContractService");

const COMPLIANT_SHARIAH = {
  success: true,
  summary: { status: "COMPLIANT" },
  verification: { isStale: false }
};

/*
 * A census the real agreement engine can actually produce.
 * 6 bullish + 1 bearish + 2 neutral over the 9 expected indicators:
 *   raw agreement  = (6 + 2 x 0.35) / 9        = 74%
 *   coverage       = 9 / 9                     = 100%
 *   confidence     = 74 x 100 / 100            = 74
 *   aligned        = 6 >= 3 && 6 > 1 && 74 >= 60  -> true
 *   evidenceState  = full coverage, 74 < 75    -> "Moderate agreement"
 */
function establishedAgreement(overrides = {}) {
  return {
    agreement: "aligned",
    direction: "Bullish",
    confidence: 74,
    evidenceState: "Moderate agreement",
    availableIndicators: 9,
    expectedIndicators: 9,
    bullishSignals: 6,
    bearishSignals: 1,
    neutralSignals: 2,
    bullish: ["EMA", "SMA", "MACD", "ADX", "OBV", "Candlestick"],
    bearish: ["RSI"],
    neutral: ["Bollinger Bands", "Volume Spike"],
    unavailableIndicators: [],
    agreementDetails: [
      "Price is above EMA20.",
      "RSI is 72, indicating overbought conditions."
    ],
    agreementSummary: "Bullish indicators are aligned, although neutral signals may reduce conviction.",
    ...overrides
  };
}

function bearishEstablishedAgreement(overrides = {}) {
  return establishedAgreement({
    direction: "Bearish",
    bullishSignals: 1,
    bearishSignals: 6,
    bullish: ["OBV"],
    bearish: ["EMA", "SMA", "MACD", "ADX", "RSI", "Candlestick"],
    agreementSummary: "Bearish indicators are aligned, although neutral signals may reduce conviction.",
    ...overrides
  });
}

function freshMetadata(overrides = {}) {
  return {
    state: "delayed",
    asOf: "2026-08-06T00:00:00.000Z",
    reviewRequired: false,
    evidenceCompleteness: { available: 3, total: 3, percent: 100, status: "complete" },
    knownLimitations: [],
    ...overrides
  };
}

function confluence() {
  return {
    nearestSupport: { zone: { center: 208.5 } },
    nearestResistance: { zone: { center: 218 } }
  };
}

function riskEngineResult() {
  return {
    success: true,
    riskLevel: "Moderate",
    riskScore: 42,
    volatility: "Moderate",
    riskSummary: "AAPL currently has a moderate technical risk profile.",
    riskNotes: ["Trend strength is weak, which reduces the reliability of directional signals."],
    disclaimer: "Educational risk references only."
  };
}

function input(overrides = {}) {
  return {
    symbol: "AAPL",
    generatedAt: "2026-08-06T00:00:00.000Z",
    shariah: COMPLIANT_SHARIAH,
    agreement: establishedAgreement(),
    metadata: freshMetadata(),
    dataQuality: { status: "complete", warnings: [] },
    confluence: confluence(),
    risk: riskEngineResult(),
    thesisInvalidation: { status: "intact", technical: "A daily close below 208.5 breaks the structure." },
    ...overrides
  };
}

function withAgreement(overrides, rest = {}) {
  return input({ agreement: establishedAgreement(overrides), ...rest });
}

// ---------------------------------------------------------------------------

function testLiveStateToPublicLabel() {
  const cases = [
    [input(), "FAVORED", "BULLISH", PUBLIC_LABELS.CONSTRUCTIVE],
    [input({ agreement: bearishEstablishedAgreement() }), "FAVORED", "BEARISH", PUBLIC_LABELS.ADVERSE],
    [withAgreement({ evidenceState: "Limited evidence", availableIndicators: 6 }), "LIMITED_EVIDENCE", "BULLISH", PUBLIC_LABELS.UNCONFIRMED],
    [withAgreement({ evidenceState: "No directional evidence", direction: "Mixed" }), "NEUTRAL", null, PUBLIC_LABELS.MIXED],
    [withAgreement({ evidenceState: "Conflicting evidence", direction: "Mixed" }), "CONFLICTING", null, PUBLIC_LABELS.MIXED],
    [withAgreement({ evidenceState: "Evidence unavailable", direction: "Mixed" }), "UNAVAILABLE", null, PUBLIC_LABELS.ANALYSIS_LIMITED],
    [input({ shariah: { success: false, summary: { status: "UNKNOWN" } } }), "WITHHELD", null, PUBLIC_LABELS.WITHHELD]
  ];

  for (const [payload, expectedState, expectedDirection, expectedLabel] of cases) {
    const contract = buildGuidanceContract(payload);
    assert.equal(contract.verdict.state, expectedState, `state for ${expectedLabel}`);
    assert.equal(contract.verdict.direction, expectedDirection, `direction for ${expectedLabel}`);
    assert.equal(contract.publicLabel, expectedLabel, `label for ${expectedState}`);
  }

  // Exactly six live public labels exist, and no lifecycle outcome leaks in.
  assert.equal(new Set(Object.values(PUBLIC_LABELS)).size, 6);
  const serialized = JSON.stringify(Object.values(PUBLIC_LABELS));
  assert.doesNotMatch(serialized, /Deteriorating|Invalidated/);
}

function testNeutralAndConflictingStayDistinct() {
  const neutral = buildGuidanceContract(
    withAgreement({ evidenceState: "No directional evidence", direction: "Mixed" })
  );
  const conflicting = buildGuidanceContract(
    withAgreement({ evidenceState: "Conflicting evidence", direction: "Mixed" })
  );

  assert.equal(neutral.verdict.state, "NEUTRAL");
  assert.equal(conflicting.verdict.state, "CONFLICTING");
  assert.notEqual(neutral.verdict.state, conflicting.verdict.state);

  assert.equal(neutral.publicLabel, PUBLIC_LABELS.MIXED);
  assert.equal(conflicting.publicLabel, PUBLIC_LABELS.MIXED);
  assert.notEqual(neutral.meaning, conflicting.meaning);
}

function testUnusableEvidenceFailsClosed() {
  const unusable = [
    "Evidence unavailable",
    "evidence unavailable",
    "Stale evidence",
    "Insufficient evidence",
    "Unsupported evidence",
    "Unknown",
    "",
    "   ",
    null,
    undefined,
    42,
    {},
    ["Moderate agreement"]
  ];

  for (const evidenceState of unusable) {
    const contract = buildGuidanceContract(withAgreement({ evidenceState }));

    assert.equal(
      contract.verdict.state,
      "UNAVAILABLE",
      `evidenceState ${JSON.stringify(evidenceState)} must fail closed`
    );
    assert.notEqual(contract.verdict.state, "FAVORED");
    assert.equal(contract.verdict.direction, null);
    assert.equal(contract.publicLabel, PUBLIC_LABELS.ANALYSIS_LIMITED);
    assert.equal(contract.supportingEvidence.length, 0);
    assert.equal(contract.invalidation, null);
    assert.equal(contract.risk, null);
  }

  // A missing agreement object entirely.
  const empty = buildGuidanceContract(input({ agreement: undefined }));
  assert.equal(empty.verdict.state, "UNAVAILABLE");
  assert.equal(empty.publicLabel, PUBLIC_LABELS.ANALYSIS_LIMITED);

  // "Low agreement" is a real engine state, and is explicitly not established.
  const low = buildGuidanceContract(withAgreement({ evidenceState: "Low agreement" }));
  assert.equal(low.verdict.state, "LIMITED_EVIDENCE");
  assert.equal(low.publicLabel, PUBLIC_LABELS.UNCONFIRMED);
}

function testConstructiveAndAdverseAreReachable() {
  const constructive = buildGuidanceContract(input());
  assert.equal(constructive.publicLabel, PUBLIC_LABELS.CONSTRUCTIVE);
  assert.equal(constructive.verdict.direction, "BULLISH");
  assert.equal(constructive.supportingEvidence[0].source, "EMA");
  assert.equal(constructive.opposingEvidence[0].source, "RSI");

  const adverse = buildGuidanceContract(input({ agreement: bearishEstablishedAgreement() }));
  assert.equal(adverse.publicLabel, PUBLIC_LABELS.ADVERSE);
  assert.equal(adverse.verdict.direction, "BEARISH");

  // "High agreement" reaches the same outcome.
  const high = buildGuidanceContract(
    withAgreement({ evidenceState: "High agreement", confidence: 93, bullishSignals: 8, bearishSignals: 0, neutralSignals: 1 })
  );
  assert.equal(high.publicLabel, PUBLIC_LABELS.CONSTRUCTIVE);
}

function testDirectionalButNotEstablishedBecomesUnconfirmed() {
  /*
   * Each case breaks exactly one condition of the established-evidence test while
   * leaving evidenceState at a value that would otherwise produce FAVORED.
   */
  const cases = [
    ["E1 not aligned", withAgreement({ agreement: "conflicting" })],
    ["E2 incomplete coverage", withAgreement({ availableIndicators: 7 })],
    ["E2 no expected indicators", withAgreement({ expectedIndicators: 0 })],
    ["E3 opposing matches dominant", withAgreement({ bullishSignals: 4, bearishSignals: 4 })],
    ["E3 signal counts missing", withAgreement({ bullishSignals: null, bearishSignals: null })],
    ["E4 review required", input({ metadata: freshMetadata({ reviewRequired: true }) })],
    ["E4 evidence incomplete", input({ metadata: freshMetadata({ evidenceCompleteness: { status: "partial" } }) })],
    ["E4 metadata absent", input({ metadata: undefined })],
    ["E4 data quality degraded", input({ dataQuality: { status: "degraded", warnings: [] } })],
    ["E4 data quality unavailable", input({ dataQuality: { status: "unavailable", warnings: [] } })]
  ];

  for (const [label, payload] of cases) {
    const contract = buildGuidanceContract(payload);
    assert.equal(contract.verdict.state, "LIMITED_EVIDENCE", `${label} must not stay FAVORED`);
    assert.equal(contract.publicLabel, PUBLIC_LABELS.UNCONFIRMED, `${label} public label`);
    assert.notEqual(contract.publicLabel, PUBLIC_LABELS.CONSTRUCTIVE);
  }

  // A directional evidence state with no usable direction is contradictory input.
  const noDirection = buildGuidanceContract(withAgreement({ direction: "Mixed" }));
  assert.equal(noDirection.verdict.state, "UNAVAILABLE");
  assert.equal(noDirection.publicLabel, PUBLIC_LABELS.ANALYSIS_LIMITED);
}

function testEstablishedEvidenceIsNotCircularWithConfirmation() {
  /*
   * The established-evidence test reads nothing from `confluence`; the confirmation
   * condition reads nothing else. Both directions of the circularity are checked.
   */

  // 1. Confluence cannot influence whether evidence is established.
  for (const confluenceValue of [undefined, null, {}, { nearestResistance: { zone: { center: 999 } } }]) {
    const contract = buildGuidanceContract(input({ confluence: confluenceValue }));
    assert.equal(
      contract.verdict.state,
      "FAVORED",
      "removing or changing structural levels must not change establishment"
    );
    assert.equal(contract.publicLabel, PUBLIC_LABELS.CONSTRUCTIVE);
  }

  // Established, yet no structural level exists -> honest fallback confirmation.
  const noLevels = buildGuidanceContract(input({ confluence: null }));
  assert.deepEqual(noLevels.confirmations, [NO_CONFIRMATION_AVAILABLE]);

  // 2. Agreement structure and freshness cannot influence the confirmation levels.
  const established = buildGuidanceContract(input());
  const notEstablished = buildGuidanceContract(withAgreement({ agreement: "conflicting" }));
  assert.notEqual(established.verdict.state, notEstablished.verdict.state);
  assert.deepEqual(
    established.confirmations,
    notEstablished.confirmations,
    "confirmation wording must depend only on structural levels"
  );
  assert.match(established.confirmations[0], /218/);

  // 3. Fallback confirmation never qualifies evidence as established.
  const fallbackOnly = buildGuidanceContract(
    withAgreement({ agreement: "conflicting" }, { confluence: null })
  );
  assert.deepEqual(fallbackOnly.confirmations, [NO_CONFIRMATION_AVAILABLE]);
  assert.equal(fallbackOnly.verdict.state, "LIMITED_EVIDENCE");
}

function testConfirmationIsNeverEmpty() {
  const contracts = [
    buildGuidanceContract(input()),
    buildGuidanceContract(input({ confluence: null })),
    buildGuidanceContract(withAgreement({ evidenceState: "Conflicting evidence", direction: "Mixed" })),
    buildGuidanceContract(withAgreement({ evidenceState: "Evidence unavailable", direction: "Mixed" })),
    buildGuidanceContract(input({ shariah: { success: false, summary: { status: "UNKNOWN" } } }))
  ];

  for (const contract of contracts) {
    assert.equal(contract.confirmations.length, 1);
    assert.equal(typeof contract.confirmations[0], "string");
    assert.ok(contract.confirmations[0].trim().length > 0);
  }
}

function testShariahGateWithholdsAllDirectionalGuidance() {
  const blocked = [
    { success: true, summary: { status: "NON_COMPLIANT" }, verification: { isStale: false } },
    { success: true, summary: { status: "COMPLIANT" }, verification: { isStale: true } },
    { success: false, summary: { status: "UNKNOWN" } }
  ];

  for (const shariah of blocked) {
    const contract = buildGuidanceContract(input({ shariah }));

    assert.equal(contract.verdict.state, "WITHHELD");
    assert.equal(contract.verdict.direction, null);
    assert.equal(contract.publicLabel, PUBLIC_LABELS.WITHHELD);
    assert.equal(contract.evidenceAgreement, null);
    assert.equal(contract.supportingEvidence.length, 0);
    assert.equal(contract.opposingEvidence.length, 0);
    assert.equal(contract.invalidation, null);
    assert.equal(contract.risk, null);
    assert.doesNotMatch(
      contract.allowedNextStep,
      /\b(?:bullish|bearish|upside|downside|breakout|breakdown|long|short)\b/i
    );
  }
}

function testAllowedNextStepIsMentorLanguage() {
  const contracts = [
    buildGuidanceContract(input()),
    buildGuidanceContract(withAgreement({ agreement: "conflicting" })),
    buildGuidanceContract(withAgreement({ evidenceState: "Conflicting evidence", direction: "Mixed" })),
    buildGuidanceContract(withAgreement({ evidenceState: "No directional evidence", direction: "Mixed" })),
    buildGuidanceContract(withAgreement({ evidenceState: "Evidence unavailable", direction: "Mixed" })),
    buildGuidanceContract(input({ shariah: { success: false, summary: { status: "UNKNOWN" } } }))
  ];

  for (const contract of contracts) {
    assert.ok(contract.allowedNextStep.trim().length > 0);
    assert.match(contract.allowedNextStep, /observe|review|check|reassess|re-run/i);
    assert.doesNotMatch(contract.allowedNextStep, /\b(?:buy|sell|hold|enter|exit|trade)\b/i);
  }
}

function testRiskContract() {
  const contract = buildGuidanceContract(input());

  assert.deepEqual(contract.risk, {
    level: "Moderate",
    score: 42,
    volatility: "Moderate",
    summary: "AAPL currently has a moderate technical risk profile.",
    notes: ["Trend strength is weak, which reduces the reliability of directional signals."]
  });

  // A failed risk engine publishes nothing rather than a fabricated profile.
  assert.equal(buildGuidanceContract(input({ risk: { success: false } })).risk, null);
  assert.equal(buildGuidanceContract(input({ risk: undefined })).risk, null);

  // Non-directional and withheld states never carry a risk profile.
  assert.equal(
    buildGuidanceContract(withAgreement({ evidenceState: "Conflicting evidence", direction: "Mixed" })).risk,
    null
  );
}

/*
 * The risk engine is the single canonical owner of the risk level. The guidance
 * contract copies it; it never re-derives a level from the score. If it did, the
 * guidance panel and the Overview sidebar - which renders `data.risk.riskLevel`
 * from the same object - could disagree about the same analysis.
 */
function testRiskLevelIsCanonicalNotReDerived() {
  // The real riskEngine thresholds (analysis/risk/riskEngine.js:253-261).
  const engineThresholds = [
    [0, "Low"],
    [29, "Low"],
    [30, "Moderate"],
    [42, "Moderate"],
    [49, "Moderate"],
    [50, "High"],
    [69, "High"],
    [70, "Very High"],
    [100, "Very High"]
  ];

  for (const [riskScore, riskLevel] of engineThresholds) {
    const contract = buildGuidanceContract(
      input({ risk: { ...riskEngineResult(), riskScore, riskLevel } })
    );
    assert.equal(contract.risk.score, riskScore);
    assert.equal(contract.risk.level, riskLevel, `score ${riskScore} publishes ${riskLevel}`);
  }

  // The two values the fixtures publish are genuinely coherent.
  for (const [riskScore, riskLevel] of [[42, "Moderate"], [52, "High"]]) {
    const contract = buildGuidanceContract(
      input({ risk: { ...riskEngineResult(), riskScore, riskLevel } })
    );
    assert.equal(contract.risk.score, riskScore);
    assert.equal(contract.risk.level, riskLevel);
  }

  // No casing or vocabulary transformation is applied in either direction.
  for (const [riskScore, riskLevel] of engineThresholds) {
    const contract = buildGuidanceContract(
      input({ risk: { ...riskEngineResult(), riskScore, riskLevel } })
    );
    assert.equal(contract.risk.level, riskLevel);
    assert.notEqual(contract.risk.level, riskLevel.toUpperCase());
  }
}

/*
 * Canonical ownership is not the same as blind trust. Guidance may not reclassify
 * a level, but it must also never publish a self-contradicting profile such as
 * "Low - 95/100". The engine's own exported classifier is the validation rule, so
 * there is exactly one threshold table in the codebase.
 */
function testIncoherentRiskPairsAreWithheld() {
  const incoherent = [
    [95, "Low"],
    [95, "Moderate"],
    [10, "Very High"],
    [42, "High"],
    [52, "Moderate"],
    [69, "Very High"],
    [70, "High"]
  ];

  for (const [riskScore, riskLevel] of incoherent) {
    const contract = buildGuidanceContract(
      input({ risk: { ...riskEngineResult(), riskScore, riskLevel } })
    );

    assert.equal(
      contract.risk,
      null,
      `score ${riskScore} with level ${riskLevel} must not be published`
    );

    // Withheld, not silently absent, and never replaced with a guessed level.
    assert.ok(
      contract.limitations.some((limitation) =>
        /risk profile failed its internal consistency check/i.test(limitation)
      ),
      `score ${riskScore}/${riskLevel} must record why risk was withheld`
    );
    assert.doesNotMatch(JSON.stringify(contract.risk), /Low|Moderate|High/);
  }

  // Guidance never substitutes the level the engine "should" have produced.
  const rejected = buildGuidanceContract(
    input({ risk: { ...riskEngineResult(), riskScore: 95, riskLevel: "Low" } })
  );
  assert.equal(rejected.risk, null);
  assert.equal(JSON.stringify(rejected).includes("Very High"), false);

  // Missing, malformed or unsupported levels fail closed the same way.
  for (const riskLevel of [undefined, null, "", "   ", 42, {}, "MEDIUM", "Medium", "Extreme", "low"]) {
    const contract = buildGuidanceContract(
      input({ risk: { ...riskEngineResult(), riskLevel } })
    );
    assert.equal(
      contract.risk,
      null,
      `level ${JSON.stringify(riskLevel)} must fail closed`
    );
  }

  // A missing or malformed score is equally unverifiable.
  for (const riskScore of [undefined, null, "", "abc", NaN, {}]) {
    const contract = buildGuidanceContract(
      input({ risk: { ...riskEngineResult(), riskScore } })
    );
    assert.equal(contract.risk, null, `score ${JSON.stringify(riskScore)} must fail closed`);
  }

  // A genuine engine result still passes through untouched.
  const valid = buildGuidanceContract(input());
  assert.equal(valid.risk.level, "Moderate");
  assert.equal(valid.risk.score, 42);
  assert.equal(
    valid.limitations.some((limitation) =>
      /risk profile failed its internal consistency check/i.test(limitation)
    ),
    false
  );
}

function testCoherenceGuard() {
  const valid = buildGuidanceContract(input());
  assert.equal(findCoherenceViolation(valid), null);
  assert.equal(applyCoherenceGuard(valid), valid);

  /*
   * Controlled contradictory fixtures. These are test data, never a source
   * mutation: the guard is exercised through its real exported entry point.
   */
  const contradictions = [
    ["constructive label with bearish direction", {
      ...valid,
      verdict: { state: "FAVORED", direction: "BEARISH" },
      publicLabel: PUBLIC_LABELS.CONSTRUCTIVE
    }],
    ["adverse label with bullish direction", {
      ...valid,
      verdict: { state: "FAVORED", direction: "BULLISH" },
      publicLabel: PUBLIC_LABELS.ADVERSE
    }],
    ["mixed state with a directional label", {
      ...valid,
      verdict: { state: "CONFLICTING", direction: null },
      publicLabel: PUBLIC_LABELS.CONSTRUCTIVE
    }],
    ["analysis-limited state with a directional label", {
      ...valid,
      verdict: { state: "UNAVAILABLE", direction: null },
      publicLabel: PUBLIC_LABELS.ADVERSE
    }],
    ["withheld state with a directional label", {
      ...valid,
      verdict: { state: "WITHHELD", direction: null },
      publicLabel: PUBLIC_LABELS.CONSTRUCTIVE
    }],
    ["directional label with no direction", {
      ...valid,
      verdict: { state: "FAVORED", direction: null },
      publicLabel: PUBLIC_LABELS.CONSTRUCTIVE
    }],
    ["non-directional state carrying a direction", {
      ...valid,
      verdict: { state: "NEUTRAL", direction: "BULLISH" },
      publicLabel: PUBLIC_LABELS.MIXED
    }],
    ["withheld guidance exposing directional evidence", {
      ...valid,
      verdict: { state: "WITHHELD", direction: null },
      publicLabel: PUBLIC_LABELS.WITHHELD,
      supportingEvidence: [{ source: "EMA", statement: "Price is above EMA20." }],
      invalidation: null,
      risk: null
    }],
    ["withheld guidance exposing a directional next step", {
      ...valid,
      verdict: { state: "WITHHELD", direction: null },
      publicLabel: PUBLIC_LABELS.WITHHELD,
      supportingEvidence: [],
      opposingEvidence: [],
      invalidation: null,
      risk: null,
      allowedNextStep: "Observe whether the bullish breakout holds above resistance."
    }],
    ["unknown state", {
      ...valid,
      verdict: { state: "DETERIORATING", direction: "BEARISH" },
      publicLabel: "Deteriorating"
    }]
  ];

  for (const [label, contradictory] of contradictions) {
    assert.ok(findCoherenceViolation(contradictory), `${label} must be detected`);

    const guarded = applyCoherenceGuard(contradictory);

    // Specified failure mode: fail closed to Analysis Limited. Never throw,
    // never repair in place, never emit a directional label.
    assert.equal(guarded.verdict.state, "UNAVAILABLE", `${label} failure mode`);
    assert.equal(guarded.verdict.direction, null);
    assert.equal(guarded.publicLabel, PUBLIC_LABELS.ANALYSIS_LIMITED);
    assert.equal(guarded.supportingEvidence.length, 0);
    assert.equal(guarded.opposingEvidence.length, 0);
    assert.equal(guarded.invalidation, null);
    assert.equal(guarded.risk, null);
    assert.deepEqual(guarded.confirmations, [NO_CONFIRMATION_AVAILABLE]);
    assert.ok(
      guarded.limitations.some((limitation) => /internal consistency check failed/i.test(limitation)),
      `${label} must record why guidance was withheld`
    );
    assert.equal(findCoherenceViolation(guarded), null, `${label} must be coherent after the guard`);
  }
}

function testNoTransactionCommands() {
  const contracts = [
    buildGuidanceContract(input()),
    buildGuidanceContract(input({ agreement: bearishEstablishedAgreement() })),
    buildGuidanceContract(withAgreement({ evidenceState: "Conflicting evidence", direction: "Mixed" })),
    buildGuidanceContract(withAgreement({ evidenceState: "Evidence unavailable", direction: "Mixed" })),
    buildGuidanceContract(input({ shariah: { success: false, summary: { status: "UNKNOWN" } } }))
  ];

  for (const contract of contracts) {
    assert.doesNotMatch(JSON.stringify(contract), /\b(?:buy|sell|hold|wait|enter|exit)\b/i);
  }
}

function run() {
  testLiveStateToPublicLabel();
  testNeutralAndConflictingStayDistinct();
  testUnusableEvidenceFailsClosed();
  testConstructiveAndAdverseAreReachable();
  testDirectionalButNotEstablishedBecomesUnconfirmed();
  testEstablishedEvidenceIsNotCircularWithConfirmation();
  testConfirmationIsNeverEmpty();
  testShariahGateWithholdsAllDirectionalGuidance();
  testAllowedNextStepIsMentorLanguage();
  testRiskContract();
  testRiskLevelIsCanonicalNotReDerived();
  testIncoherentRiskPairsAreWithheld();
  testCoherenceGuard();
  testNoTransactionCommands();

  console.log("Guidance contract v1 tests passed.");
}

if (require.main === module) run();

module.exports = { run };
