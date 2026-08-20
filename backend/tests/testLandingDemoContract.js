"use strict";

/*
 * Landing demonstration contract (roadmap items 2.15 / 2.16).
 *
 * The landing page publishes a verdict. Before this suite existed it published
 * the agreement engine's internal direction ("Bullish") as that verdict, and an
 * internal trend word where the product carries a horizon — wording the real
 * contract does not issue. It also stored `riskLevel: "Medium"`, a value
 * docs/VERDICT_CONTRACT.md §9.1 says this system never produces.
 *
 * These tests make the marketing surface answerable to the same engine the
 * product answers to. The frontend holds a static JSON contract; this suite
 * feeds that file's `derivation` block to the real buildGuidanceContract and
 * asserts the engine reproduces its `presentation` block exactly. The frontend
 * therefore stores a *checked copy* of backend output, never a second source of
 * truth, and no public label, horizon token or risk threshold is restated here.
 *
 * HONEST LIMITATION, stated so no reader overclaims: `derivation.agreement` is
 * hand-authored. The real agreement engine derives agreement from nine live
 * indicator services, which a static fixture cannot run. What these tests prove
 * is that the *published verdict* — public label, horizon and evidence
 * presentation — is engine-derived from the stated evidence. They do not prove,
 * and nothing here should be read to claim, that the landing analysis is
 * engine-derived end to end.
 */

const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const {
  PUBLIC_LABELS,
  buildGuidanceContract
} = require("../services/guidanceContractService");
const { RISK_LEVELS } = require("../analysis/risk/riskEngine");

const CONTRACT_PATH = path.resolve(
  __dirname,
  "../../frontend/src/data/landingDemo.contract.json"
);

const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, "utf8"));

/*
 * Rebuild the engine input from the JSON alone. Nothing is added here that the
 * frontend does not also ship: if this function had to invent a field to reach
 * the target label, the fixture would not honestly derive it.
 */
function deriveConfirmed(overrides = {}) {
  const { derivation, symbol } = contract.confirmed;

  return buildGuidanceContract({
    symbol,
    confluence: {},
    risk: null,
    shariah: derivation.shariah,
    agreement: derivation.agreement,
    metadata: derivation.metadata,
    ...overrides
  });
}

function deriveWithheld(overrides = {}) {
  const { derivation, symbol } = contract.withheld;

  return buildGuidanceContract({
    symbol,
    confluence: {},
    risk: null,
    shariah: derivation.shariah,
    agreement: derivation.agreement,
    ...overrides
  });
}

/* Deep clone so a negative control cannot leak into the next assertion. */
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/* ---------------------------------------------------------------- parity */

function testConfirmedPublicLabelIsEngineDerived() {
  const derived = deriveConfirmed();

  assert.equal(
    derived.publicLabel,
    contract.confirmed.presentation.publicLabel,
    "The landing fixture's published verdict must be exactly what the real " +
      "guidance contract derives from its own stated evidence."
  );
}

function testConfirmedHorizonIsEngineDerived() {
  const derived = deriveConfirmed();

  assert.equal(
    derived.horizon,
    contract.confirmed.presentation.horizonToken,
    "The landing fixture's horizon must be the engine's horizon token."
  );
}

function testPublishedLabelsBelongToTheBackendVocabulary() {
  const approved = Object.values(PUBLIC_LABELS);

  assert.ok(
    approved.includes(contract.confirmed.presentation.publicLabel),
    "The confirmed card's label must be one of the backend's approved labels."
  );
  assert.ok(
    approved.includes(contract.withheld.presentation.publicLabel),
    "The withheld card's label must be one of the backend's approved labels."
  );
}

/*
 * The keystone. Without this the fixture could display one evidence set while
 * publishing a label derived from a different one, and every other assertion
 * here would still pass.
 */
function testRenderedEvidenceIsTheEvidenceTheLabelCameFrom() {
  const derived = deriveConfirmed();

  assert.deepEqual(
    derived.evidenceAgreement,
    contract.confirmed.presentation.evidence,
    "The evidence the landing card renders must be the evidence the engine " +
      "used to reach the published label."
  );
}

function testRenderedSummaryIsEngineDerived() {
  const derived = deriveConfirmed();

  assert.equal(
    derived.currentSituation,
    contract.confirmed.presentation.summary,
    "The card's supporting sentence must be the engine's own situation text."
  );
}

function testWithheldScenarioClearsNoVerdict() {
  const derived = deriveWithheld();

  assert.equal(derived.publicLabel, PUBLIC_LABELS.WITHHELD);
  assert.equal(derived.verdict.state, "WITHHELD");
  assert.equal(derived.verdict.direction, null);
  assert.equal(
    derived.publicLabel,
    contract.withheld.presentation.publicLabel,
    "The withheld card must publish the engine's withheld label."
  );
}

/* ------------------------------------------------------------------ risk */

function testFixtureCarriesNoRiskAtAll() {
  const serialized = JSON.stringify(contract);

  for (const forbidden of ["riskLevel", "riskScore", "riskSummary"]) {
    assert.ok(
      !serialized.includes(forbidden),
      `The landing contract must not carry ${forbidden}: the landing page ` +
        "renders no risk, and analyzeRisk cannot derive a result from these " +
        "inputs (no current price, no ATR)."
    );
  }

  assert.equal(
    contract.confirmed.risk,
    undefined,
    "There must be no risk member — not even an empty object, which would " +
      "assert an assessment that was never made."
  );
  assert.equal(contract.withheld.risk, undefined);
}

function testNoNonCanonicalRiskLevelSurvivesAnywhere() {
  const serialized = JSON.stringify(contract);

  /*
   * "Medium" is the specific value that drifted into this fixture. It is not a
   * member of the engine's vocabulary at any casing, so its absence is asserted
   * against the real RISK_LEVELS export rather than a copied list.
   */
  assert.ok(!RISK_LEVELS.includes("Medium"));
  assert.ok(!RISK_LEVELS.includes("MEDIUM"));
  assert.ok(
    !/"(Medium|MEDIUM)"/.test(serialized),
    "The landing contract must not carry a Medium risk level at any casing."
  );
}

/* ------------------------------------------------- negative controls (N) */

/*
 * Each control degrades exactly one input and requires that the fixture stops
 * publishing Constructive. Together they prove the label is a consequence of
 * the stated evidence rather than a string that happens to sit in the JSON.
 */
function testConstructiveRequiresItsStatedEvidence() {
  const { derivation } = contract.confirmed;
  const target = PUBLIC_LABELS.CONSTRUCTIVE;

  assert.equal(deriveConfirmed().publicLabel, target, "baseline must hold");

  const controls = [
    ["metadata removed entirely", { metadata: undefined }],
    [
      "evidence completeness is partial",
      {
        metadata: {
          ...clone(derivation.metadata),
          evidenceCompleteness: { status: "partial" }
        }
      }
    ],
    [
      "evidence completeness is missing",
      { metadata: { ...clone(derivation.metadata), evidenceCompleteness: {} } }
    ],
    [
      "evidence completeness is malformed",
      {
        metadata: {
          ...clone(derivation.metadata),
          evidenceCompleteness: { status: null }
        }
      }
    ],
    [
      "the evidence is flagged for review",
      { metadata: { ...clone(derivation.metadata), reviewRequired: true } }
    ],
    ["data quality is degraded", { dataQuality: { status: "degraded" } }],
    ["data quality is unavailable", { dataQuality: { status: "unavailable" } }],
    [
      "the agreement engine did not call it aligned (E1)",
      { agreement: { ...clone(derivation.agreement), agreement: "mixed" } }
    ],
    [
      "family coverage is incomplete (E2)",
      {
        agreement: {
          ...clone(derivation.agreement),
          coverage: {
            ...clone(derivation.agreement.coverage),
            usableFamilies: 3,
            unavailableFamilies: 1
          }
        }
      }
    ],
    [
      "support does not outnumber opposition (E3)",
      {
        agreement: {
          ...clone(derivation.agreement),
          support: {
            ...clone(derivation.agreement.support),
            supportingFamilies: 2,
            opposingFamilies: 2
          }
        }
      }
    ]
  ];

  for (const [description, overrides] of controls) {
    const derived = deriveConfirmed(overrides);

    assert.notEqual(
      derived.publicLabel,
      target,
      `Constructive must not survive when ${description}.`
    );
  }

  /*
   * The Shariah gate is a different mechanism from the evidence gates above:
   * it withholds rather than downgrading, so it is asserted separately.
   */
  const gated = deriveConfirmed({
    shariah: {
      ...clone(derivation.shariah),
      summary: { status: "UNKNOWN" }
    }
  });

  assert.equal(
    gated.publicLabel,
    PUBLIC_LABELS.WITHHELD,
    "An uncleared Shariah gate must withhold the verdict, not downgrade it."
  );
}

/*
 * The completeness flag is the single load-bearing metadata field. Recorded
 * explicitly so a future reader does not delete it as decoration.
 */
function testEvidenceCompletenessIsTheLoadBearingField() {
  const { derivation } = contract.confirmed;

  assert.equal(
    deriveConfirmed({
      metadata: { evidenceCompleteness: { status: "complete" } }
    }).publicLabel,
    PUBLIC_LABELS.CONSTRUCTIVE,
    "evidenceCompleteness alone must be sufficient."
  );

  const withoutCompleteness = clone(derivation.metadata);
  delete withoutCompleteness.evidenceCompleteness;

  assert.notEqual(
    deriveConfirmed({ metadata: withoutCompleteness }).publicLabel,
    PUBLIC_LABELS.CONSTRUCTIVE,
    "Every other metadata field together must be insufficient."
  );
}

function run() {
  testConfirmedPublicLabelIsEngineDerived();
  testConfirmedHorizonIsEngineDerived();
  testPublishedLabelsBelongToTheBackendVocabulary();
  testRenderedEvidenceIsTheEvidenceTheLabelCameFrom();
  testRenderedSummaryIsEngineDerived();
  testWithheldScenarioClearsNoVerdict();
  testFixtureCarriesNoRiskAtAll();
  testNoNonCanonicalRiskLevelSurvivesAnywhere();
  testConstructiveRequiresItsStatedEvidence();
  testEvidenceCompletenessIsTheLoadBearingField();

  console.log("Landing demonstration contract tests passed.");
}

if (require.main === module) run();

module.exports = { run };
