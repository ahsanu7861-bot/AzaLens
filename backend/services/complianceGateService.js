// ============================================================
// AzaLens - Shariah Compliance Gate
//
// The strict guardrail at the trust core of the product:
// trade-optimization output (trend, agreement, explanation)
// is released ONLY when compliance is CONFIRMED, meaning all
// three of the following hold:
//
//   1. The screening call succeeded (shariah.success === true)
//   2. The AAOIFI status is exactly COMPLIANT
//   3. The screening evidence is not marked stale
//
// Every other state - NON_COMPLIANT, UNKNOWN, stale evidence,
// screening unavailable, or a missing shariah block - withholds
// the verdict. The gate runs server-side on the final API
// response, so withheld sections are never sent to any client.
// ============================================================

const GATE_STATUS = Object.freeze({
  UNLOCKED: "UNLOCKED",
  WITHHELD: "WITHHELD"
});

const WITHHELD_REASONS = Object.freeze({
  NON_COMPLIANT: "NON_COMPLIANT",
  STALE_EVIDENCE: "STALE_EVIDENCE",
  NOT_CONFIRMED: "NOT_CONFIRMED"
});

const WITHHELD_MESSAGES = Object.freeze({
  [WITHHELD_REASONS.NON_COMPLIANT]:
    "This stock does not pass AAOIFI Shariah screening, so AzaLens withholds its trade analysis. The full screening evidence is in the Shariah Compliance workspace.",

  [WITHHELD_REASONS.STALE_EVIDENCE]:
    "The AAOIFI screening evidence for this stock is stale, so AzaLens withholds its trade analysis until compliance is re-confirmed. Details are in the Shariah Compliance workspace.",

  [WITHHELD_REASONS.NOT_CONFIRMED]:
    "AAOIFI Shariah compliance has not been confirmed for this stock, so AzaLens withholds its trade analysis. Details are in the Shariah Compliance workspace."
});

function evaluateComplianceGate(shariah) {
  const screeningSucceeded = shariah?.success === true;
  const shariahStatus = shariah?.summary?.status || "UNKNOWN";
  const staleEvidence = shariah?.verification?.isStale === true;

  if (
    screeningSucceeded &&
    shariahStatus === "COMPLIANT" &&
    !staleEvidence
  ) {
    return {
      status: GATE_STATUS.UNLOCKED,
      unlocked: true,
      requiredStatus: "COMPLIANT",
      shariahStatus,
      staleEvidence: false,
      reason: null,
      message: null
    };
  }

  const reason =
    shariahStatus === "NON_COMPLIANT"
      ? WITHHELD_REASONS.NON_COMPLIANT
      : shariahStatus === "COMPLIANT" && staleEvidence
        ? WITHHELD_REASONS.STALE_EVIDENCE
        : WITHHELD_REASONS.NOT_CONFIRMED;

  return {
    status: GATE_STATUS.WITHHELD,
    unlocked: false,
    requiredStatus: "COMPLIANT",
    shariahStatus,
    staleEvidence,
    reason,
    message: WITHHELD_MESSAGES[reason]
  };
}

function buildWithheldSection(gate) {
  return {
    success: false,
    withheld: true,
    reason: gate.reason,
    error: gate.message
  };
}

/*
  Applies the gate to a finished master analysis response.
  When compliance is not confirmed, the trade-optimization
  sections are replaced server-side with withheld stubs -
  the directional lean, confidence, and narrative never
  leave the backend.
*/
function applyComplianceGate(response) {
  if (!response || typeof response !== "object" || !response.data) {
    return response;
  }

  const gate = evaluateComplianceGate(response.data.shariah);

  const data = {
    ...response.data,
    complianceGate: gate
  };

  if (!gate.unlocked) {
    data.trend = buildWithheldSection(gate);
    data.agreement = buildWithheldSection(gate);
    data.explanation = buildWithheldSection(gate);
  }

  return {
    ...response,
    data
  };
}

module.exports = {
  GATE_STATUS,
  WITHHELD_REASONS,
  evaluateComplianceGate,
  applyComplianceGate
};
