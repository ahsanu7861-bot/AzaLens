"use strict";

const { evaluateComplianceGate } = require("./complianceGateService");
const { isCoherentRiskResult } = require("../analysis/risk/riskEngine");
const {
  EVIDENCE_STATES,
  EXPECTED_FAMILIES
} = require("../analysis/agreement/agreementEngine");

const CONTRACT_VERSION = "1.0";
const EXPECTED_HORIZON = "SWING_2_TO_10_SESSIONS";

/*
 * The six live public outcomes. See docs/VERDICT_CONTRACT.md.
 *
 * This map is the single source of public verdict wording in the product. The
 * frontend renders `publicLabel` verbatim and must never rebuild these strings:
 * two maps drift, and the drift is invisible until a user reads a label the
 * backend never authorised.
 *
 * Deteriorating and Invalidated are deliberately absent. Both describe how a
 * previously issued verdict has aged, which a single analysis snapshot cannot
 * establish. They are deferred to the outcome ledger (VERDICT_CONTRACT.md §1.2).
 */
const PUBLIC_LABELS = {
  CONSTRUCTIVE: "Constructive — Upside Evidence Established",
  ADVERSE: "Adverse — Downside Evidence Established",
  UNCONFIRMED: "Unconfirmed — Evidence Still Developing",
  MIXED: "Mixed — No Established Edge",
  ANALYSIS_LIMITED: "Analysis Limited — Evidence Incomplete",
  WITHHELD: "Verdict Withheld — Shariah Gate Not Cleared"
};

// Lookups are performed on the trimmed, lowercased wire value.
function evidenceStateKey(state) {
  return String(state).toLowerCase();
}

/*
 * Every value `agreementEngine.js` can emit is mapped explicitly. Anything not
 * listed here - absent, null, malformed, stale, unsupported, or simply new -
 * resolves to UNAVAILABLE. Unrecognised input must never produce a confident
 * verdict.
 *
 * Keyed off the engine's own exported vocabulary rather than retyped literals, so
 * this map cannot silently stop covering a state the engine still emits. The keys
 * and internal states are unchanged.
 */
const EVIDENCE_STATE_TO_INTERNAL = {
  [evidenceStateKey(EVIDENCE_STATES.UNAVAILABLE)]: "UNAVAILABLE",
  // Too little usable evidence to form an assessment at all.
  [evidenceStateKey(EVIDENCE_STATES.INSUFFICIENT)]: "UNAVAILABLE",
  [evidenceStateKey(EVIDENCE_STATES.NO_DIRECTION)]: "NEUTRAL",
  [evidenceStateKey(EVIDENCE_STATES.CONFLICTING)]: "CONFLICTING",
  [evidenceStateKey(EVIDENCE_STATES.LIMITED)]: "LIMITED_EVIDENCE",
  [evidenceStateKey(EVIDENCE_STATES.LOW)]: "LIMITED_EVIDENCE",
  [evidenceStateKey(EVIDENCE_STATES.MODERATE)]: "FAVORED",
  [evidenceStateKey(EVIDENCE_STATES.HIGH)]: "FAVORED"
};

// Evidence states that may carry established evidence, before the §4 test runs.
const ESTABLISHABLE_EVIDENCE_STATES = [
  evidenceStateKey(EVIDENCE_STATES.MODERATE),
  evidenceStateKey(EVIDENCE_STATES.HIGH)
];

const NO_CONFIRMATION_AVAILABLE =
  "No independent confirmation condition is available from the current evidence.";

const DIRECTIONAL_LANGUAGE =
  /\b(?:bullish|bearish|upside|downside|breakout|breakdown|long|short)\b/i;

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizedEvidenceState(agreement) {
  const raw = agreement?.evidenceState;
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
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

/*
 * The published evidence census. It is a *copy* of what the agreement engine
 * already decided - never a second opinion about it. Nothing here recomputes a
 * percentage, re-grades a state, or reconciles the counts: each field is the
 * engine's own value under the contract's field name, so the two can never
 * disagree about the same analysis. `data.agreement` still carries the same
 * numbers under the engine's names; aligning those two surfaces is deliberately
 * out of scope here.
 */
function buildEvidenceAgreement(agreement) {
  const support = agreement.support || {};
  const coverage = agreement.coverage || {};

  return {
    state: agreement.evidenceState || EVIDENCE_STATES.UNAVAILABLE,
    support: {
      direction: ["BULLISH", "BEARISH"].includes(support.direction) ? support.direction : null,
      supportingFamilies: finite(support.supportingFamilies) || 0,
      opposingFamilies: finite(support.opposingFamilies) || 0,
      neutralFamilies: finite(support.neutralFamilies) || 0
    },
    coverage: {
      usableFamilies: finite(coverage.usableFamilies) || 0,
      expectedFamilies: finite(coverage.expectedFamilies) || EXPECTED_FAMILIES,
      unavailableFamilies: finite(coverage.unavailableFamilies) || 0,
      families: list(coverage.families).map((family) => ({
        id: String(family.id),
        label: String(family.label),
        vote: String(family.vote),
        members: list(family.members).map((member) => ({
          name: String(member.name),
          vote: String(member.vote)
        }))
      }))
    },
    summary: text(agreement.summary) || "Evidence coverage is unavailable for this analysis."
  };
}

/*
 * Fail closed: only explicitly recognised evidence states produce anything other
 * than UNAVAILABLE, and "Moderate"/"High agreement" produce a FAVORED *candidate*
 * that still has to survive hasEstablishedEvidence().
 */
function resolveState(agreement) {
  return EVIDENCE_STATE_TO_INTERNAL[normalizedEvidenceState(agreement)] || "UNAVAILABLE";
}

/*
 * VERDICT_CONTRACT.md §4 - the independent established-evidence test.
 *
 * Deliberately reads nothing from `confluence`. The confirmation condition is
 * built exclusively from `confluence`, so the two cannot be circular in either
 * direction: agreement structure and data freshness decide whether evidence is
 * established, and a price level decides what would confirm it.
 */
function hasEstablishedEvidence({ agreement, metadata, dataQuality }) {
  // E1 - the agreement engine's own structural verdict.
  if (agreement?.agreement !== "aligned") return false;

  // E2 - complete family coverage: every expected evidence family was usable.
  const usable = finite(agreement.coverage?.usableFamilies);
  const expected = finite(agreement.coverage?.expectedFamilies);
  if (usable === null || expected === null) return false;
  if (expected <= 0 || usable < expected) return false;

  // E3 - no conflicting-evidence condition: the supporting side must strictly
  // outnumber the opposing side, counted in families rather than in correlated
  // indicator votes.
  const supporting = finite(agreement.support?.supportingFamilies);
  const opposing = finite(agreement.support?.opposingFamilies);
  if (supporting === null || opposing === null) return false;
  if (supporting <= opposing) return false;
  if (!ESTABLISHABLE_EVIDENCE_STATES.includes(normalizedEvidenceState(agreement))) {
    return false;
  }

  // E4 - evidence is fresh, complete and does not require review.
  if (metadata?.reviewRequired === true) return false;
  if (metadata?.evidenceCompleteness?.status !== "complete") return false;
  if (["degraded", "unavailable"].includes(String(dataQuality?.status || "").toLowerCase())) {
    return false;
  }

  return true;
}

function publicLabelFor(state, direction) {
  if (state === "FAVORED") {
    if (direction === "BULLISH") return PUBLIC_LABELS.CONSTRUCTIVE;
    if (direction === "BEARISH") return PUBLIC_LABELS.ADVERSE;
    return null;
  }
  if (state === "LIMITED_EVIDENCE") return PUBLIC_LABELS.UNCONFIRMED;
  if (state === "NEUTRAL" || state === "CONFLICTING") return PUBLIC_LABELS.MIXED;
  if (state === "UNAVAILABLE") return PUBLIC_LABELS.ANALYSIS_LIMITED;
  if (state === "WITHHELD") return PUBLIC_LABELS.WITHHELD;
  return null;
}

function buildMeaning(state, direction) {
  if (state === "CONFLICTING") {
    return "Bullish and bearish evidence are deadlocked. The present evidence does not justify a directional lean.";
  }
  if (state === "NEUTRAL") {
    return "Available evidence is neutral and does not currently support a directional lean.";
  }
  if (state === "LIMITED_EVIDENCE") {
    return `The available evidence leans ${String(direction).toLowerCase()}, but it does not yet meet the independent test for established evidence, so the reading remains unconfirmed.`;
  }
  if (state === "UNAVAILABLE") {
    return "Directional evidence is incomplete, so AzaLens cannot form a reasoned market view.";
  }
  return `Established evidence favors a ${String(direction).toLowerCase()} scenario, conditionally rather than as a prediction or instruction.`;
}

function buildNextObservation(state, direction, confluence) {
  const support = finite(confluence?.nearestSupport?.zone?.center);
  const resistance = finite(confluence?.nearestResistance?.zone?.center);

  if (["CONFLICTING", "NEUTRAL", "UNAVAILABLE"].includes(state)) {
    return "Look for verified directional evidence to emerge before relying on a scenario.";
  }
  if (direction === "BULLISH") {
    return resistance !== null
      ? `Observe whether price can close and remain accepted above resistance near ${resistance}.`
      : "Observe whether price establishes a confirmed breakout with improving directional evidence.";
  }
  return support !== null
    ? `Observe whether price closes below support near ${support} and fails to reclaim it.`
    : "Observe whether price establishes a confirmed breakdown with improving directional evidence.";
}

/*
 * The confirmation condition is derived only from real structural levels supplied
 * by the confluence engine. When no such level exists there is no genuine
 * confirmation condition, and the contract says so rather than letting the block
 * silently disappear. Fallback wording never qualifies evidence as established.
 */
function buildConfirmation(direction, confluence) {
  const support = finite(confluence?.nearestSupport?.zone?.center);
  const resistance = finite(confluence?.nearestResistance?.zone?.center);

  if (direction === "BULLISH" && resistance !== null) {
    return `Acceptance above the resistance zone near ${resistance}, sustained on a closing basis, would confirm the current reading.`;
  }
  if (direction === "BEARISH" && support !== null) {
    return `Acceptance below the support zone near ${support}, sustained on a closing basis without reclaim, would confirm the current reading.`;
  }
  return null;
}

function buildAllowedNextStep(state) {
  if (state === "WITHHELD") {
    return "Review the Shariah Compliance workspace for confirmed, current screening evidence before relying on any analysis.";
  }
  if (state === "FAVORED") {
    return "Observe whether the stated confirmation condition occurs, and reassess the scenario if the invalidation boundary is reached instead.";
  }
  if (state === "LIMITED_EVIDENCE") {
    return "Observe how the evidence develops and reassess once coverage and agreement improve; treat the reading as unconfirmed until then.";
  }
  if (state === "NEUTRAL" || state === "CONFLICTING") {
    return "Check back once new evidence develops; there is no established edge to reason from at present.";
  }
  return "Re-run the analysis once clearer verified evidence becomes available.";
}

/*
 * Smallest deterministic typed risk contract, built only from fields the risk
 * engine actually returns (backend/analysis/risk/riskEngine.js). Nothing here is
 * fabricated or derived.
 *
 * The risk engine remains the sole owner of the level: this function never
 * reclassifies, corrects or substitutes one. Coherence is decided by the engine's
 * own `isCoherentRiskResult` - the same predicate the shared boundary in
 * masterAnalysisService uses - so there is one validator, not one per consumer.
 * Publishing "Low · 95/100" would be a self-contradicting risk profile, which is
 * worse than publishing no profile at all.
 */
function buildRisk(risk) {
  if (!isCoherentRiskResult(risk)) return null;

  return {
    level: risk.riskLevel,
    score: risk.riskScore,
    volatility: text(risk.volatility),
    summary: text(risk.riskSummary),
    notes: list(risk.riskNotes).map((note) => String(note))
  };
}

/*
 * VERDICT_CONTRACT.md §5. Returns a reason string when the assembled contract
 * contradicts itself, or null when it is coherent.
 */
function findCoherenceViolation(contract) {
  const state = contract?.verdict?.state;
  const direction = contract?.verdict?.direction ?? null;
  const expectedLabel = publicLabelFor(state, direction);

  if (!expectedLabel) {
    return `verdict state "${state}" with direction "${direction}" has no permitted public label`;
  }
  if (contract.publicLabel !== expectedLabel) {
    return `public label "${contract.publicLabel}" does not match the label required by state "${state}" with direction "${direction}"`;
  }
  if (state !== "FAVORED" && state !== "LIMITED_EVIDENCE" && direction !== null) {
    return `non-directional state "${state}" carries direction "${direction}"`;
  }
  if (
    (state === "FAVORED" || state === "LIMITED_EVIDENCE") &&
    !["BULLISH", "BEARISH"].includes(direction)
  ) {
    return `directional state "${state}" is missing a usable direction`;
  }
  if (state === "WITHHELD" || state === "UNAVAILABLE" || state === "NEUTRAL" || state === "CONFLICTING") {
    if (list(contract.supportingEvidence).length > 0 || list(contract.opposingEvidence).length > 0) {
      return `state "${state}" exposes directional evidence`;
    }
    if (contract.invalidation) {
      return `state "${state}" exposes a thesis invalidation boundary`;
    }
    if (DIRECTIONAL_LANGUAGE.test(String(contract.allowedNextStep || ""))) {
      return `state "${state}" exposes a directional next step`;
    }
  }
  if (state === "WITHHELD" && contract.risk) {
    return "withheld guidance exposes a risk profile";
  }

  return null;
}

function buildAnalysisLimitedContract(contract, extraLimitations = []) {
  return {
    contractVersion: contract.contractVersion || CONTRACT_VERSION,
    symbol: contract.symbol || "UNKNOWN",
    asOf: contract.asOf,
    horizon: contract.horizon || EXPECTED_HORIZON,
    shariah: contract.shariah,
    verdict: { state: "UNAVAILABLE", direction: null },
    publicLabel: PUBLIC_LABELS.ANALYSIS_LIMITED,
    evidenceAgreement: null,
    currentSituation: "Directional evidence is incomplete for this analysis.",
    supportingEvidence: [],
    opposingEvidence: [],
    meaning: buildMeaning("UNAVAILABLE", null),
    nextObservation: buildNextObservation("UNAVAILABLE", null, null),
    confirmations: [NO_CONFIRMATION_AVAILABLE],
    invalidation: null,
    risk: null,
    freshness: contract.freshness ?? null,
    limitations: [...new Set([...list(contract.limitations), ...list(extraLimitations)])],
    allowedNextStep: buildAllowedNextStep("UNAVAILABLE")
  };
}

/*
 * Fail closed rather than throw. Throwing would take down the whole analysis -
 * screening, price context, indicators and risk - because one label disagreed
 * with one direction. Silently repairing the label would present a contradiction
 * the product cannot explain as if it were a normal result. Degrading to Analysis
 * Limited keeps the analysis alive while guaranteeing that no directional label
 * ever survives a failed consistency check. See VERDICT_CONTRACT.md §5.1.
 */
function applyCoherenceGuard(contract) {
  const violation = findCoherenceViolation(contract);
  if (!violation) return contract;

  return buildAnalysisLimitedContract(contract, [
    `Guidance was withheld because an internal consistency check failed: ${violation}.`
  ]);
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
    return applyCoherenceGuard({
      ...base,
      verdict: { state: "WITHHELD", direction: null },
      publicLabel: PUBLIC_LABELS.WITHHELD,
      evidenceAgreement: null,
      currentSituation: gate.message,
      supportingEvidence: [],
      opposingEvidence: [],
      meaning: "AzaLens does not release directional guidance unless current AAOIFI compliance is confirmed.",
      nextObservation: "Review the Shariah Compliance workspace for confirmed, current screening evidence.",
      confirmations: [NO_CONFIRMATION_AVAILABLE],
      invalidation: null,
      risk: null,
      freshness: input.metadata || null,
      limitations: [...new Set([gate.message, ...list(input.metadata?.knownLimitations)].filter(Boolean))],
      allowedNextStep: buildAllowedNextStep("WITHHELD")
    });
  }

  const agreement = input.agreement || {};
  const candidateState = resolveState(agreement);
  const candidateDirection = String(agreement.direction || "").toUpperCase();
  const hasUsableDirection = ["BULLISH", "BEARISH"].includes(candidateDirection);

  let state = candidateState;

  if (["FAVORED", "LIMITED_EVIDENCE"].includes(state) && !hasUsableDirection) {
    // A directional evidence state without a usable direction is contradictory input.
    state = "UNAVAILABLE";
  } else if (
    state === "FAVORED" &&
    !hasEstablishedEvidence({
      agreement,
      metadata: input.metadata,
      dataQuality: input.dataQuality
    })
  ) {
    // Directional, but not independently established: Unconfirmed, never Constructive.
    state = "LIMITED_EVIDENCE";
  }

  const direction = ["FAVORED", "LIMITED_EVIDENCE"].includes(state) ? candidateDirection : null;
  const supportingNames = direction === "BULLISH" ? agreement.bullish : direction === "BEARISH" ? agreement.bearish : [];
  const opposingNames = direction === "BULLISH" ? agreement.bearish : direction === "BEARISH" ? agreement.bullish : [];
  const risk = direction ? buildRisk(input.risk) : null;
  /*
   * The engine reported a risk profile, but it did not survive validation. Say so
   * rather than letting the panel go quiet, so the omission reads as a withheld
   * result rather than an absent one.
   */
  const riskWithheld = direction !== null && input.risk?.success === true && risk === null;

  const limitations = [
    ...list(input.dataQuality?.warnings),
    ...list(input.metadata?.knownLimitations),
    ...list(agreement.unavailableIndicators).map((name) => `${name} evidence is unavailable.`),
    riskWithheld
      ? "The reported risk profile failed its internal consistency check and was withheld."
      : null
  ].filter(Boolean);

  return applyCoherenceGuard({
    ...base,
    verdict: { state, direction },
      publicLabel: publicLabelFor(state, direction),
    evidenceAgreement: buildEvidenceAgreement(agreement),
    currentSituation: agreement.agreementSummary || "Directional evidence is incomplete.",
    supportingEvidence: buildEvidenceItems(agreement, supportingNames),
    opposingEvidence: buildEvidenceItems(agreement, opposingNames),
    meaning: buildMeaning(state, direction),
    nextObservation: buildNextObservation(state, direction, input.confluence),
    confirmations: [buildConfirmation(direction, input.confluence) || NO_CONFIRMATION_AVAILABLE],
    invalidation: direction ? input.thesisInvalidation || null : null,
    risk,
    freshness: input.metadata || null,
    limitations: [...new Set(limitations)],
    allowedNextStep: buildAllowedNextStep(state)
  });
}

module.exports = {
  CONTRACT_VERSION,
  EXPECTED_HORIZON,
  PUBLIC_LABELS,
  NO_CONFIRMATION_AVAILABLE,
  // Exported so the contract test can prove this map closes over exactly the
  // engine's vocabulary in both directions, rather than only sampling it.
  EVIDENCE_STATE_TO_INTERNAL,
  buildGuidanceContract,
  findCoherenceViolation,
  applyCoherenceGuard
};
