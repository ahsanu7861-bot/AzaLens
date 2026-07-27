const assert = require("node:assert/strict");

const {
  GATE_STATUS,
  WITHHELD_REASONS,
  evaluateComplianceGate,
  applyComplianceGate
} = require("../services/complianceGateService");

function buildShariah({
  success = true,
  status = "COMPLIANT",
  isStale = false
} = {}) {
  return {
    success,
    summary: { status },
    verification: { isStale }
  };
}

function buildMasterResponse(shariah) {
  return {
    success: true,
    data: {
      shariah,
      trend: { success: true, trend: "Bullish", score: 3 },
      agreement: {
        success: true,
        direction: "Bullish",
        confidence: 78,
        agreementSummary: "Bullish indicators are aligned."
      },
      explanation: {
        success: true,
        overallAssessment: "Positive evidence outweighs negative."
      },
      market: { success: true }
    }
  };
}

function run() {
  // 1. Confirmed compliant and fresh: unlocked, verdict intact.
  {
    const gate = evaluateComplianceGate(buildShariah());

    assert.equal(gate.status, GATE_STATUS.UNLOCKED);
    assert.equal(gate.unlocked, true);
    assert.equal(gate.reason, null);

    const gated = applyComplianceGate(
      buildMasterResponse(buildShariah())
    );

    assert.equal(gated.data.complianceGate.unlocked, true);
    assert.equal(gated.data.agreement.direction, "Bullish");
    assert.equal(gated.data.agreement.confidence, 78);
    assert.equal(gated.data.trend.trend, "Bullish");
    assert.equal(
      gated.data.explanation.overallAssessment,
      "Positive evidence outweighs negative."
    );
  }

  // 2. Non-compliant: withheld, verdict redacted.
  {
    const shariah = buildShariah({ status: "NON_COMPLIANT" });
    const gate = evaluateComplianceGate(shariah);

    assert.equal(gate.status, GATE_STATUS.WITHHELD);
    assert.equal(gate.reason, WITHHELD_REASONS.NON_COMPLIANT);

    const gated = applyComplianceGate(buildMasterResponse(shariah));

    assert.equal(gated.data.complianceGate.unlocked, false);
    assert.equal(gated.data.agreement.withheld, true);
    assert.equal(gated.data.agreement.direction, undefined);
    assert.equal(gated.data.agreement.confidence, undefined);
    assert.equal(gated.data.agreement.agreementSummary, undefined);
    assert.equal(gated.data.trend.withheld, true);
    assert.equal(gated.data.trend.trend, undefined);
    assert.equal(gated.data.explanation.withheld, true);
    assert.equal(gated.data.explanation.overallAssessment, undefined);
    assert.match(gated.data.agreement.error, /does not pass/);
  }

  // 3. Unknown status: withheld as not confirmed.
  {
    const shariah = buildShariah({ status: "UNKNOWN" });
    const gate = evaluateComplianceGate(shariah);

    assert.equal(gate.status, GATE_STATUS.WITHHELD);
    assert.equal(gate.reason, WITHHELD_REASONS.NOT_CONFIRMED);
  }

  // 4. Stale compliant evidence: withheld as stale.
  {
    const shariah = buildShariah({ isStale: true });
    const gate = evaluateComplianceGate(shariah);

    assert.equal(gate.status, GATE_STATUS.WITHHELD);
    assert.equal(gate.reason, WITHHELD_REASONS.STALE_EVIDENCE);

    const gated = applyComplianceGate(buildMasterResponse(shariah));

    assert.equal(gated.data.agreement.withheld, true);
    assert.match(gated.data.agreement.error, /stale/);
  }

  // 5. Screening failed (success false) even with COMPLIANT text:
  //    withheld - an unsuccessful screening can never unlock.
  {
    const shariah = buildShariah({ success: false });
    const gate = evaluateComplianceGate(shariah);

    assert.equal(gate.status, GATE_STATUS.WITHHELD);
    assert.equal(gate.reason, WITHHELD_REASONS.NOT_CONFIRMED);
  }

  // 6. Missing shariah block entirely: withheld.
  {
    const gate = evaluateComplianceGate(null);

    assert.equal(gate.status, GATE_STATUS.WITHHELD);
    assert.equal(gate.reason, WITHHELD_REASONS.NOT_CONFIRMED);

    const gated = applyComplianceGate(buildMasterResponse(undefined));

    assert.equal(gated.data.complianceGate.unlocked, false);
    assert.equal(gated.data.agreement.withheld, true);
  }

  // 7. Malformed responses pass through without crashing.
  {
    assert.equal(applyComplianceGate(null), null);
    assert.deepEqual(applyComplianceGate({}), {});
  }

  console.log("Compliance gate: all assertions passed.");
}

try {
  run();
} catch (error) {
  console.error("Compliance gate test failed:", error);
  process.exitCode = 1;
}
