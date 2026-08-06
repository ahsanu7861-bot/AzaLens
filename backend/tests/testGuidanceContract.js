"use strict";

const assert = require("node:assert/strict");
const { buildGuidanceContract } = require("../services/guidanceContractService");

function compliant(overrides = {}) {
  return {
    symbol: "AAPL",
    generatedAt: "2026-08-06T00:00:00.000Z",
    shariah: { success: true, summary: { status: "COMPLIANT" }, verification: { isStale: false } },
    agreement: {
      direction: "Bullish", confidence: 71, evidenceState: "Moderate agreement",
      availableIndicators: 9, expectedIndicators: 9, bullish: ["EMA"], bearish: ["RSI"],
      agreementDetails: ["Price is above EMA20.", "RSI is 72, indicating overbought conditions."],
      agreementSummary: "Bullish evidence is present."
    },
    ...overrides
  };
}

function run() {
  const favored = buildGuidanceContract(compliant());
  assert.equal(favored.contractVersion, "1.0");
  assert.deepEqual(favored.verdict, { state: "FAVORED", direction: "BULLISH" });
  assert.equal(favored.evidenceAgreement.percent, 71);
  assert.equal(favored.supportingEvidence[0].source, "EMA");
  assert.equal(favored.opposingEvidence[0].source, "RSI");

  for (const [evidenceState, expectedState] of [
    ["Conflicting evidence", "CONFLICTING"],
    ["No directional evidence", "NEUTRAL"],
    ["Limited evidence", "LIMITED_EVIDENCE"],
    ["Evidence unavailable", "UNAVAILABLE"]
  ]) {
    const result = buildGuidanceContract(compliant({ agreement: { ...compliant().agreement, evidenceState } }));
    assert.equal(result.verdict.state, expectedState);
    if (expectedState !== "LIMITED_EVIDENCE") assert.equal(result.verdict.direction, null);
  }

  for (const shariah of [
    { success: true, summary: { status: "NON_COMPLIANT" }, verification: { isStale: false } },
    { success: true, summary: { status: "COMPLIANT" }, verification: { isStale: true } },
    { success: false, summary: { status: "UNKNOWN" } }
  ]) {
    const withheld = buildGuidanceContract(compliant({ shariah }));
    assert.deepEqual(withheld.verdict, { state: "WITHHELD", direction: null });
    assert.equal(withheld.evidenceAgreement, null);
    assert.equal(withheld.supportingEvidence.length, 0);
    assert.equal(withheld.invalidation, null);
  }

  console.log("Guidance contract v1 tests passed.");
}

if (require.main === module) run();

module.exports = { run };
