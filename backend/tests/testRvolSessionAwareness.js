const assert = require("node:assert/strict");

const { analyzeRisk } = require("../analysis/risk/riskEngine");
const {
  analyzeExplanation
} = require("../analysis/explanation/explanationEngine");

/*
  riskEngine.js and explanationEngine.js both independently read the
  raw rvol ratio. This test locks in that neither one claims "weak
  participation" unless indicators.rvol.session.status is CLOSED -
  otherwise a partial or unknown-status session would produce a
  false low-volume claim, which is the bug this whole fix addresses.
  See backend/analysis/marketSession.js and item 1.5 in
  WHAT_TO_DO_NEXT.md.
*/

function buildFixture(rvolValue, sessionStatus) {
  return {
    success: true,
    symbol: "TEST",

    market: {
      success: true,
      data: { price: 100 }
    },

    indicators: {
      atr: { atr: 1 },
      adx: { adx: 30 },
      rvol: {
        success: true,
        rvol: rvolValue,
        session: sessionStatus
          ? { status: sessionStatus }
          : null
      },
      volumeSpike: {
        success: true,
        volumeSpikeDetected: false
      }
    },

    trend: { success: true, trend: "Sideways" },

    agreement: { confidence: 80 }
  };
}

function allNotes(risk) {
  return [...risk.riskNotes, ...risk.supportiveFactors].join(" | ");
}

function allExplanationText(explanation) {
  return [
    ...explanation.positives,
    ...explanation.cautions,
    ...explanation.observations
  ].join(" | ");
}

function run() {
  const LOW_RVOL = 0.5;

  // 1. CLOSED session, genuinely low volume: the claim is true and
  //    must still fire - the fix must not suppress correct info.
  {
    const fixture = buildFixture(LOW_RVOL, "CLOSED");

    const risk = analyzeRisk(fixture);
    assert.match(allNotes(risk), /weak market participation/);

    const explanation = analyzeExplanation(fixture);
    assert.match(
      allExplanationText(explanation),
      /participation is currently weak/
    );
  }

  // 2. OPEN session (still trading), same low ratio: must NOT claim
  //    weak participation - that's the false claim from the bug.
  {
    const fixture = buildFixture(LOW_RVOL, "OPEN");

    const risk = analyzeRisk(fixture);
    assert.doesNotMatch(allNotes(risk), /weak market participation/);
    assert.match(allNotes(risk), /still in progress/);

    const explanation = analyzeExplanation(fixture);
    assert.doesNotMatch(
      allExplanationText(explanation),
      /participation is currently weak/
    );
    assert.match(allExplanationText(explanation), /still in progress/);
  }

  // 3. UNKNOWN session status: must NOT claim weak participation
  //    either - fail honest, don't guess.
  {
    const fixture = buildFixture(LOW_RVOL, "UNKNOWN");

    const risk = analyzeRisk(fixture);
    assert.doesNotMatch(allNotes(risk), /weak market participation/);
    assert.match(allNotes(risk), /could not be determined/);

    const explanation = analyzeExplanation(fixture);
    assert.doesNotMatch(
      allExplanationText(explanation),
      /participation is currently weak/
    );
    assert.match(allExplanationText(explanation), /session.*unknown/);
  }

  // 4. Missing session block entirely (e.g. an older cached shape):
  //    must default to not-reliable, same as UNKNOWN.
  {
    const fixture = buildFixture(LOW_RVOL, null);

    const risk = analyzeRisk(fixture);
    assert.doesNotMatch(allNotes(risk), /weak market participation/);
  }

  // 5. High volume during an OPEN session is still a genuine,
  //    trustworthy signal and must still surface as a positive.
  {
    const fixture = buildFixture(2.5, "OPEN");

    const explanation = analyzeExplanation(fixture);
    assert.match(
      allExplanationText(explanation),
      /strong market participation/
    );
  }

  console.log("RVOL session-awareness gating: all assertions passed.");
}

try {
  run();
} catch (error) {
  console.error("RVOL session-awareness test failed:", error);
  process.exitCode = 1;
}
