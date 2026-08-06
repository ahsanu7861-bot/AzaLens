"use strict";

const { evaluateComplianceGate } = require("./complianceGateService");

const CONTRACT_VERSION = "1.0";
const EXPECTED_HORIZON = "SWING_2_TO_10_SESSIONS";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function buildEvidenceItems(agreement, names) {
  return list(names).map((name) => ({
    source: name,
    statement:
      list(agreement?.agreementDetails).find((detail) =>
        String(detail).toLowerCase().includes(String(name).toLowerCase())
      ) || `${name} contributes to the current evidence balance.`
  }));
}

function resolveState(agreement) {
  const state = String(agreement?.evidenceState || "").toLowerCase();
  if (state === "evidence unavailable") return "UNAVAILABLE";
  if (state === "no directional evidence") return "NEUTRAL";
  if (state === "conflicting evidence") return "CONFLICTING";
  if (state === "limited evidence") return "LIMITED_EVIDENCE";
  return agreement?.direction === "Bullish" || agreement?.direction === "Bearish"
    ? "FAVORED"
    : "NEUTRAL";
}

function buildMeaning(state, direction) {
  if (state === "CONFLICTING") {
    return "Bullish and bearish evidence are deadlocked. The present evidence does not justify a directional lean.";
  }
  if (state === "NEUTRAL") {
    return "Available evidence is neutral and does not currently support a directional lean.";
  }
  if (state === "LIMITED_EVIDENCE") {
    return `The available evidence leans ${String(direction).toLowerCase()}, but coverage is incomplete and the conclusion requires additional confirmation.`;
  }
  if (state === "UNAVAILABLE") {
    return "Directional evidence is unavailable, so AzaLens cannot form a reasoned market view.";
  }
  return `Current evidence favors a ${String(direction).toLowerCase()} scenario, conditionally rather than as a prediction or instruction.`;
}

function buildNextObservation(state, direction, confluence) {
  const support = finite(confluence?.nearestSupport?.zone?.center);
  const resistance = finite(confluence?.nearestResistance?.zone?.center);

  if (["CONFLICTING", "NEUTRAL", "UNAVAILABLE"].includes(state)) {
    return "Wait for directional evidence to emerge and re-run the analysis before relying on a scenario.";
  }
  if (direction === "Bullish") {
    return resistance !== null
      ? `Observe whether price can close and remain accepted above resistance near ${resistance}.`
      : "Observe whether price establishes a confirmed breakout with improving directional evidence.";
  }
  return support !== null
    ? `Observe whether price closes below support near ${support} and fails to reclaim it.`
    : "Observe whether price establishes a confirmed breakdown with improving directional evidence.";
}

function buildGuidanceContract(input = {}) {
  const gate = input.complianceGate || evaluateComplianceGate(input.shariah);
  const asOf = input.metadata?.asOf || input.generatedAt || new Date().toISOString();
  const shariahStatus = input.shariah?.summary?.status || "UNKNOWN";

  const base = {
    contractVersion: CONTRACT_VERSION,
    symbol: input.symbol || "UNKNOWN",
    asOf,
    horizon: EXPECTED_HORIZON,
    shariah: {
      status: shariahStatus,
      verdictPermitted: gate.unlocked === true,
      reason: gate.reason || null
    }
  };

  if (!gate.unlocked) {
    return {
      ...base,
      verdict: { state: "WITHHELD", direction: null },
      evidenceAgreement: null,
      currentSituation: gate.message,
      supportingEvidence: [],
      opposingEvidence: [],
      meaning: "AzaLens does not release directional guidance unless current AAOIFI compliance is confirmed.",
      nextObservation: "Review the Shariah Compliance workspace and wait for confirmed, current screening evidence.",
      confirmations: [],
      invalidation: null,
      risk: null,
      freshness: input.metadata || null,
      limitations: [...new Set([gate.message, ...list(input.metadata?.knownLimitations)].filter(Boolean))],
      allowedNextStep: "Do not use directional analysis while the Shariah gate is withheld."
    };
  }

  const agreement = input.agreement || {};
  const state = resolveState(agreement);
  const candidateDirection = String(agreement.direction || "").toUpperCase();
  const direction = ["FAVORED", "LIMITED_EVIDENCE"].includes(state) &&
    ["BULLISH", "BEARISH"].includes(candidateDirection)
    ? candidateDirection
    : null;
  const supportingNames = direction === "BULLISH" ? agreement.bullish : direction === "BEARISH" ? agreement.bearish : [];
  const opposingNames = direction === "BULLISH" ? agreement.bearish : direction === "BEARISH" ? agreement.bullish : [];
  const limitations = [
    ...list(input.dataQuality?.warnings),
    ...list(input.metadata?.knownLimitations),
    ...list(agreement.unavailableIndicators).map((name) => `${name} evidence is unavailable.`)
  ];

  return {
    ...base,
    verdict: { state, direction },
    evidenceAgreement: {
      percent: finite(agreement.confidence),
      state: agreement.evidenceState || "Evidence unavailable",
      available: finite(agreement.availableIndicators) || 0,
      expected: finite(agreement.expectedIndicators) || 0
    },
    currentSituation: agreement.agreementSummary || "Directional evidence is unavailable.",
    supportingEvidence: buildEvidenceItems(agreement, supportingNames),
    opposingEvidence: buildEvidenceItems(agreement, opposingNames),
    meaning: buildMeaning(state, direction),
    nextObservation: buildNextObservation(state, direction, input.confluence),
    confirmations: direction ? [buildNextObservation(state, direction, input.confluence)] : [],
    invalidation: direction ? input.thesisInvalidation || null : null,
    risk: input.risk || null,
    freshness: input.metadata || null,
    limitations: [...new Set(limitations)],
    allowedNextStep:
      direction === null
        ? "Wait for clearer verified evidence and re-run the analysis."
        : "Observe the stated condition; treat the scenario as unconfirmed until it occurs."
  };
}

module.exports = { CONTRACT_VERSION, EXPECTED_HORIZON, buildGuidanceContract };
