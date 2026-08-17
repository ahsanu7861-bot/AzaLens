"use strict";

/*
 * The frozen risk-evidence compatibility contract.
 *
 * analysis/risk/legacyAgreementCompat.js holds a frozen arithmetic value that
 * selects one risk-score bucket and does nothing else. It is private, temporary
 * and explicitly unvalidated: it is not a confidence measure, not Evidence
 * Agreement, not an accuracy measure and not an empirically validated risk
 * measurement. This suite is the governance boundary around it.
 *
 * It proves the contract's structural facts - single formula owner, single
 * schedule owner, one permitted consumer, frozen boundaries and penalties, no
 * serialization, no public or frontend or guidance exposure, the mandatory
 * review date and every approved review trigger - so that any drift fails here
 * rather than silently moving published risk.
 *
 * CONFIGURATION-SPACE LANGUAGE. Counts below are taken over exhaustively
 * enumerated, hand-authored indicator configurations. Configuration-space shares
 * are not observed market frequencies and do not estimate how often a condition
 * occurs in production. Nothing here validates any threshold or penalty.
 *
 * No provider is called. Every reading is hand-authored.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const compat = require("../analysis/risk/legacyAgreementCompat");
const {
  computeFrozenRiskEvidenceCompatValue,
  selectFrozenRiskEvidencePenalty,
  FROZEN_RISK_EVIDENCE_COMPAT_CONTRACT: CONTRACT
} = compat;
const { analyzeRisk } = require("../analysis/risk/riskEngine");
const { analyzeAgreement } = require("../analysis/agreement/agreementEngine");

const REPO = path.resolve(__dirname, "..", "..");
const BACKEND = path.resolve(__dirname, "..");
const COMPAT_MODULE = "legacyAgreementCompat";

// ---------------------------------------------------------------------------
// Deterministic readings
// ---------------------------------------------------------------------------

const SIGNALS = {
  rsi: { B: "Oversold", R: "Overbought", N: "Neutral" },
  ema: { B: "Above EMA20", R: "Below EMA20", N: "Near EMA20" },
  sma: { B: "Above SMA50", R: "Below SMA50", N: "Near SMA50" },
  macd: { B: "Bullish Momentum", R: "Bearish Momentum", N: "Neutral" },
  bollinger: { B: "Price Near Upper Band", R: "Price Near Lower Band", N: "Middle Band" },
  obv: { B: "Accumulation", R: "Distribution", N: "Neutral" }
};
const DIRECTIONAL = ["ema", "sma", "bollinger", "rsi", "macd", "candlestick", "obv"];
const FULL_CONTEXT = { adx: true, rvol: true, volumeSpike: true };

function indicators(spec, context = FULL_CONTEXT) {
  const bag = {};
  for (const name of ["rsi", "ema", "sma", "macd", "bollinger", "obv"]) {
    bag[name] = spec[name]
      ? { success: true, signal: SIGNALS[name][spec[name]] }
      : { success: false };
  }
  bag.candlestick = spec.candlestick
    ? { success: true, bias: { B: "Bullish", R: "Bearish", N: "Neutral" }[spec.candlestick] }
    : { success: false };
  bag.adx = context.adx ? { success: true, adx: 25, signal: "Strong Trend" } : { success: false };
  bag.rvol = context.rvol ? { success: true, rvol: 1.1 } : { success: false };
  bag.volumeSpike = context.volumeSpike
    ? { success: true, rvol: 1.1, volumeSpikeDetected: false, signal: "No Volume Spike" }
    : { success: false };
  bag.atr = { success: true, atr: 3.2 };
  return bag;
}

function riskFor(spec, context = FULL_CONTEXT) {
  const bag = indicators(spec, context);
  const agreement = analyzeAgreement(bag);
  return {
    agreement,
    risk: analyzeRisk({
      success: true,
      symbol: "AAPL",
      market: { success: true, data: { price: 210 } },
      indicators: bag,
      trend: { success: true, trend: "Bullish" },
      agreement
    })
  };
}

/*
 * Independent restatement #1 of the frozen schedule. Declared explicitly: this
 * exists so the boundaries are asserted against the written specification rather
 * than against the implementation comparing itself to itself. It is the only
 * schedule restatement in this file.
 */
function specifiedPenalty(value) {
  if (value >= 75) return 0;
  if (value >= 60) return 5;
  return 15;
}

// Source files read as text for structural (not behavioural) assertions.
function readSource(relative) {
  return fs.readFileSync(path.join(BACKEND, relative), "utf8");
}

function walk(dir, out = [], skip = /node_modules|\.git|dist|build|coverage/) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (skip.test(full)) continue;
    if (entry.isDirectory()) walk(full, out, skip);
    else out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1-4. Ownership and consumers
// ---------------------------------------------------------------------------

function testSingleOwnershipAndSingleConsumer() {
  // 3/4. Formula and schedule owner is exactly this module, and the module says so.
  assert.equal(CONTRACT.formulaOwner, "backend/analysis/risk/legacyAgreementCompat.js");
  assert.equal(CONTRACT.scheduleOwner, "backend/analysis/risk/legacyAgreementCompat.js");

  const compatSource = readSource("analysis/risk/legacyAgreementCompat.js");
  const engineSource = readSource("analysis/risk/riskEngine.js");

  // 3. The formula constants live only in the owner.
  assert.match(compatSource, /0\.35/, "the owner holds the neutral credit");
  assert.doesNotMatch(engineSource, /0\.35/, "riskEngine must not restate the formula");

  // 4. The boundaries and penalties live only in the owner: riskEngine must not
  //    restate 75/60 or the 0/5/15 schedule for the evidence bucket.
  assert.doesNotMatch(
    engineSource,
    /riskScore\s*\+=\s*[^;]*\b(75|60)\b/,
    "riskEngine must not restate the frozen boundaries"
  );
  assert.match(
    engineSource,
    /riskScore\s*\+=\s*frozenEvidencePenalty;/,
    "riskEngine must consume the owned penalty"
  );

  // 1/2. Exactly one production consumer, and it is the risk engine.
  const productionFiles = walk(BACKEND).filter(
    (f) => f.endsWith(".js") && !f.includes(`${path.sep}tests${path.sep}`)
  );
  const consumers = productionFiles.filter((f) => {
    if (f.endsWith(`analysis${path.sep}risk${path.sep}legacyAgreementCompat.js`)) return false;
    return fs.readFileSync(f, "utf8").includes(COMPAT_MODULE);
  });
  assert.deepEqual(
    consumers.map((f) => path.relative(REPO, f)),
    ["backend/analysis/risk/riskEngine.js"],
    "exactly one production consumer is permitted"
  );
  assert.deepEqual(
    CONTRACT.permittedConsumers,
    ["backend/analysis/risk/riskEngine.js:analyzeRisk:evidence-bucket"]
  );

  // The consumer imports only the penalty selector, not the raw value.
  assert.match(engineSource, /selectFrozenRiskEvidencePenalty\s*\n?\s*}\s*=\s*require\("\.\/legacyAgreementCompat"\)/s);
  assert.doesNotMatch(
    engineSource,
    /computeFrozenRiskEvidenceCompatValue/,
    "the engine must not read the raw compatibility value"
  );

  return consumers.length;
}

// ---------------------------------------------------------------------------
// 5-8. Frozen arithmetic, range, boundaries, penalties
// ---------------------------------------------------------------------------

function testFrozenValueAndSchedule() {
  // 5. Frozen specification, restated independently (declared above).
  const specValue = ({ bullish, bearish, neutral }) => {
    const total = bullish + bearish + neutral;
    const dominant = Math.max(bullish, bearish);
    let raw = total > 0 ? Math.round((dominant + neutral * 0.35) / total * 100) : 0;
    raw = Math.min(100, Math.max(0, raw));
    return Math.round(raw * Math.round(total / 9 * 100) / 100);
  };
  const census = (spec, ctx) => {
    let bullish = 0, bearish = 0, neutral = 0;
    for (const name of ["rsi", "ema", "sma", "macd", "bollinger", "candlestick"]) {
      if (!spec[name]) continue;
      if (spec[name] === "B") bullish += 1;
      else if (spec[name] === "R") bearish += 1;
      else neutral += 1;
    }
    if (ctx.adx) neutral += 1;
    if (ctx.rvol) neutral += 1;
    if (ctx.volumeSpike) neutral += 1;
    return { bullish, bearish, neutral };
  };

  const states = ["B", "R", "N"];
  const seen = new Set();
  let swept = 0;

  for (const ema of states) for (const sma of states) for (const bollinger of states)
    for (const rsi of states) for (const macd of states) for (const candlestick of states)
      for (const obv of states) {
        const spec = { ema, sma, bollinger, rsi, macd, candlestick, obv };
        const value = computeFrozenRiskEvidenceCompatValue(indicators(spec));
        assert.equal(value, specValue(census(spec, FULL_CONTEXT)), "frozen value drifted");
        // 8. Penalty is exactly the specified schedule, and only ever 0, 5 or 15.
        const penalty = selectFrozenRiskEvidencePenalty(indicators(spec));
        assert.equal(penalty, specifiedPenalty(value), "penalty drifted from the schedule");
        assert.ok([0, 5, 15].includes(penalty), "penalty outside the frozen set");
        seen.add(value);
        swept += 1;
      }

  assert.equal(swept, 2187, "the sweep must cover every configuration");

  /*
   * 6. DOMAIN A value set.
   *
   * Domain A is this sweep and only this sweep: 2,187 configurations over seven
   * B/R/N directional axes at COMPLETE context availability (ADX, RVOL and
   * Volume Spike all present). It is NOT the full availability lattice - values
   * outside this set are reachable once availability varies, so nothing here may
   * be read as a global reachable set.
   */
  const domainAValues = [...seen].sort((a, b) => a - b);
  assert.deepEqual(
    domainAValues,
    [35, 38, 42, 45, 46, 49, 53, 56, 57, 60, 64, 67, 71, 78],
    "the Domain A value set (2,187 configurations, complete context availability) is frozen"
  );
  assert.equal(domainAValues.length, 14, "Domain A holds 14 distinct values");
  assert.equal(domainAValues[0], 35, "Domain A minimum");
  assert.equal(domainAValues[domainAValues.length - 1], 78, "Domain A maximum");

  /*
   * 7. Threshold boundaries, exercised through the REAL production functions.
   *
   * 75, 60 and 59 are all producible by real indicator input once availability
   * is allowed to vary, so all three are asserted against production behaviour
   * rather than against any restatement. 75 and 59 are absent from Domain A but
   * reachable in the wider availability lattice; 60 is reachable in both.
   *
   * 74 is a different case. It is absent from Domain A, and a separate read-only
   * 131,072-case availability audit found no input producing it. That audit is
   * NOT a permanent CI assertion and is not claimed as one here, so this suite
   * makes no global-unreachability claim for 74 and deliberately does not add an
   * artificial production entry point merely to inject it. The 75/60 boundary
   * itself is pinned independently by the frozen contract metadata below.
   */
  const allBullish = Object.fromEntries(DIRECTIONAL.map((d) => [d, "B"]));

  // 75 -> +0. Absent from Domain A; reachable when Volume Spike is unavailable.
  const atUpperBoundary = indicators(allBullish, { adx: true, rvol: true, volumeSpike: false });
  assert.equal(
    computeFrozenRiskEvidenceCompatValue(atUpperBoundary), 75,
    "75 is produced by real input (complete direction, Volume Spike unavailable)"
  );
  assert.equal(selectFrozenRiskEvidencePenalty(atUpperBoundary), 0, "real selector: 75 -> +0");

  // 60 -> +5. Reachable inside Domain A.
  const atLowerBoundary = indicators(
    { ema: "B", sma: "B", bollinger: "B", rsi: "B", macd: "R", candlestick: "N", obv: "B" },
    FULL_CONTEXT
  );
  assert.equal(
    computeFrozenRiskEvidenceCompatValue(atLowerBoundary), 60,
    "60 is produced by real input inside Domain A"
  );
  assert.equal(selectFrozenRiskEvidencePenalty(atLowerBoundary), 5, "real selector: 60 -> +5");

  /*
   * 59 -> +15, the boundary immediately below the lower threshold. Absent from
   * Domain A but produced by real input when RVOL and Volume Spike are
   * unavailable. Asserted through production functions only: `specifiedPenalty`
   * is deliberately not used as the oracle here, so this fails if the real
   * threshold or the real selector drifts.
   */
  const belowLowerBoundary = indicators(
    { ema: "B", sma: "B", bollinger: "B", rsi: "B", macd: "B", candlestick: "R", obv: "B" },
    { adx: true, rvol: false, volumeSpike: false }
  );
  assert.equal(
    computeFrozenRiskEvidenceCompatValue(belowLowerBoundary), 59,
    "59 is produced by real input (RVOL and Volume Spike unavailable)"
  );
  assert.equal(
    selectFrozenRiskEvidencePenalty(belowLowerBoundary), 15,
    "real selector: 59 -> +15 (just below the lower boundary)"
  );
  assert.ok(
    !domainAValues.includes(59),
    "59 is outside Domain A, which is why availability must vary to reach it"
  );

  // 74 is absent from Domain A. No global claim is made; see the note above.
  assert.ok(!domainAValues.includes(74), "74 is absent from Domain A");
  assert.equal(specifiedPenalty(74), 5, "specification: 74 -> +5 (no real input produces 74)");

  // 8. The contract records exactly those penalties and boundaries.
  assert.deepEqual({ ...CONTRACT.penalties }, { none: 0, partial: 5, full: 15 });
  assert.deepEqual({ ...CONTRACT.boundaries }, { upper: 75, lower: 60 });

  return domainAValues.length;
}

// ---------------------------------------------------------------------------
// 9-12. Frozen behavioural properties
// ---------------------------------------------------------------------------

function testFrozenBehaviouralProperties() {
  const states = ["B", "R", "N"];
  const all = [];
  for (const ema of states) for (const sma of states) for (const bollinger of states)
    for (const rsi of states) for (const macd of states) for (const candlestick of states)
      for (const obv of states) all.push({ ema, sma, bollinger, rsi, macd, candlestick, obv });

  const valueOf = (spec, ctx) => computeFrozenRiskEvidenceCompatValue(indicators(spec, ctx));

  // 9. Direction symmetry: mirroring bullish/bearish changes nothing.
  const key = (s) => DIRECTIONAL.map((d) => s[d]).join("");
  const byKey = new Map(all.map((s) => [key(s), valueOf(s, FULL_CONTEXT)]));
  let mirrorMismatches = 0;
  for (const [k, v] of byKey) {
    const mirrored = k.replace(/[BR]/g, (c) => (c === "B" ? "R" : "B"));
    if (byKey.has(mirrored) && byKey.get(mirrored) !== v) mirrorMismatches += 1;
  }
  assert.equal(mirrorMismatches, 0, "frozen behaviour is direction-symmetric");

  // 10. OBV remains inert in the compatibility value.
  let obvChanges = 0;
  for (const spec of all) {
    if (spec.obv !== "N") continue;
    for (const alt of ["B", "R"]) {
      if (valueOf({ ...spec, obv: alt }, FULL_CONTEXT) !== valueOf(spec, FULL_CONTEXT)) obvChanges += 1;
    }
  }
  assert.equal(obvChanges, 0, "OBV must remain inert in frozen compatibility behaviour");

  // 11. Availability of the non-directional readings remains frozen: it still
  //     moves the value, exactly as the preserved behaviour does.
  const allBullish = Object.fromEntries(DIRECTIONAL.map((d) => [d, "B"]));
  assert.equal(valueOf(allBullish, { adx: true, rvol: true, volumeSpike: true }), 78);
  assert.equal(valueOf(allBullish, { adx: true, rvol: true, volumeSpike: false }), 75);
  assert.equal(valueOf(allBullish, { adx: true, rvol: false, volumeSpike: false }), 71);
  assert.equal(valueOf(allBullish, { adx: false, rvol: false, volumeSpike: false }), 67);

  // 12. Missing evidence never lowers the penalty.
  let lowered = 0, checked = 0;
  for (const spec of all) {
    const base = selectFrozenRiskEvidencePenalty(indicators(spec));
    for (const d of DIRECTIONAL) {
      const reduced = { ...spec, [d]: null };
      if (selectFrozenRiskEvidencePenalty(indicators(reduced)) < base) lowered += 1;
      checked += 1;
    }
  }
  assert.equal(lowered, 0, "missing evidence must never lower the penalty");
  assert.equal(checked, 2187 * DIRECTIONAL.length);

  return { mirrorMismatches, obvChanges, lowered, checked };
}

// ---------------------------------------------------------------------------
// 13-17. Exposure prohibitions
// ---------------------------------------------------------------------------

const PROHIBITED_IN_OUTPUT = [
  /agreementConfidence/i,
  /computeFrozenRiskEvidenceCompatValue/,
  /selectFrozenRiskEvidencePenalty/,
  /FROZEN_RISK_EVIDENCE_COMPAT_CONTRACT/,
  /frozen-compatibility/,
  /mandatoryReviewBy/,
  /2027-02-17/
];

function testNotSerializedAndNotExposed() {
  const specs = [
    { ema: "B", sma: "B", bollinger: "B", rsi: "B", macd: "B", candlestick: "B", obv: "B" },
    { ema: "R", sma: "R", bollinger: "N", rsi: "N", macd: "R", candlestick: "N", obv: "R" },
    {}
  ];

  // 13/14. Neither the value nor any contract metadata is serialized anywhere in
  //        the risk or agreement output.
  for (const spec of specs) {
    const { risk, agreement } = riskFor(spec);
    const serialized = JSON.stringify({ risk, agreement });
    for (const pattern of PROHIBITED_IN_OUTPUT) {
      assert.doesNotMatch(serialized, pattern, `${pattern} must not be serialized`);
    }
    // The frozen boundaries and penalties must not leak as published numbers.
    assert.equal(risk.frozenEvidencePenalty, undefined);
    assert.equal(risk.compatibilityValue, undefined);
    assert.equal(risk.agreementConfidence, undefined);
  }

  // 15/16. No frontend source or type, and no guidance/explanation module,
  //        references the compatibility module at all.
  const forbiddenConsumerRoots = [
    path.join(REPO, "frontend", "src"),
    path.join(REPO, "frontend", "e2e")
  ].filter((p) => fs.existsSync(p));

  for (const root of forbiddenConsumerRoots) {
    for (const file of walk(root)) {
      if (!/\.(ts|tsx|js|jsx)$/.test(file)) continue;
      const text = fs.readFileSync(file, "utf8");
      assert.ok(
        !text.includes(COMPAT_MODULE),
        `frontend must not reference the compatibility module: ${path.relative(REPO, file)}`
      );
      assert.ok(
        !text.includes("computeFrozenRiskEvidenceCompatValue"),
        `frontend must not reference the compatibility value: ${path.relative(REPO, file)}`
      );
    }
  }

  for (const relative of [
    "services/guidanceContractService.js",
    "analysis/explanation/explanationEngine.js"
  ]) {
    const text = readSource(relative);
    assert.ok(!text.includes(COMPAT_MODULE), `${relative} must not consume the compatibility module`);
    assert.ok(!text.includes("selectFrozenRiskEvidencePenalty"), `${relative} must not consume the schedule`);
  }

  // 17. No prohibited terminology remains in the active production path. The
  //     module header may describe what the value is NOT; identifiers may not.
  const compatSource = readSource("analysis/risk/legacyAgreementCompat.js");
  const engineSource = readSource("analysis/risk/riskEngine.js");
  const identifierLike = /(?:function|const|let|var)\s+\w*(?:[Cc]onfidence|[Aa]ccuracy|[Pp]robability|[Ss]trength)\w*/g;
  for (const [name, source] of [["compat", compatSource], ["riskEngine", engineSource]]) {
    assert.deepEqual(
      source.match(identifierLike) || [],
      [],
      `${name}: no production identifier may be named for confidence/accuracy/probability/strength`
    );
  }
  // The exported surface carries none of the prohibited words.
  for (const exported of Object.keys(compat)) {
    assert.doesNotMatch(
      exported,
      /confidence|accuracy|probability|strength|agreement(?!_)/i,
      `exported name "${exported}" uses prohibited vocabulary`
    );
  }

  return true;
}

// ---------------------------------------------------------------------------
// 18-20. Governance record
// ---------------------------------------------------------------------------

function testGovernanceRecord() {
  // 18. Mandatory review date, exactly.
  assert.equal(CONTRACT.mandatoryReviewBy, "2027-02-17");
  assert.equal(CONTRACT.approvedOn, "2026-08-17");

  // Status vocabulary is honest and explicit.
  assert.equal(CONTRACT.status, "frozen-compatibility");
  assert.equal(CONTRACT.visibility, "private-internal");
  assert.equal(CONTRACT.empiricallyValidated, false);
  assert.equal(CONTRACT.replacementRemainsOpen, true);

  /*
   * 19. Exactly the ten approved review triggers, each recorded separately.
   *
   * Serialization, public API exposure and frontend use are three distinct
   * approved conditions and must not be collapsed into one combined string:
   * a combined entry would let one of them be dropped without the count moving.
   */
  const required = [
    "outcome-ledger-approved-usable-sample",
    "evidence-agreement-model-change",
    "consumer-change",
    "formula-change",
    "threshold-change",
    "penalty-change",
    "serialization-change",
    "public-api-exposure-change",
    "frontend-use-change",
    "review-date-2027-02-17"
  ];
  assert.equal(required.length, 10, "the approved trigger count is ten");
  for (const trigger of required) {
    assert.ok(CONTRACT.reviewTriggers.includes(trigger), `missing review trigger: ${trigger}`);
  }
  assert.equal(CONTRACT.reviewTriggers.length, 10, "exactly ten review triggers, none undeclared");
  assert.equal(
    new Set(CONTRACT.reviewTriggers).size, 10,
    "review triggers must be distinct - no duplicates"
  );
  assert.ok(
    !CONTRACT.reviewTriggers.includes("serialization-or-public-or-frontend-exposure"),
    "the combined exposure trigger must not return"
  );
  for (const combined of CONTRACT.reviewTriggers) {
    assert.doesNotMatch(
      combined, /-or-/,
      `review trigger "${combined}" combines distinct approved conditions`
    );
  }

  // Prohibited-use register.
  for (const prohibited of [
    "serialization", "public-api-exposure", "frontend-use",
    "guidance-use", "explanation-use", "user-visible-wording"
  ]) {
    assert.ok(CONTRACT.prohibited.includes(prohibited), `missing prohibition: ${prohibited}`);
  }

  // 20. The record cannot be mutated at runtime, at any depth that matters.
  assert.ok(Object.isFrozen(CONTRACT), "contract must be frozen");
  for (const key of ["permittedConsumers", "boundaries", "penalties", "prohibited", "reviewTriggers"]) {
    assert.ok(Object.isFrozen(CONTRACT[key]), `${key} must be frozen`);
  }
  assert.throws(() => { "use strict"; CONTRACT.mandatoryReviewBy = "2099-01-01"; }, TypeError);
  assert.throws(() => { "use strict"; CONTRACT.boundaries.upper = 1; }, TypeError);
  assert.throws(() => { "use strict"; CONTRACT.reviewTriggers.push("nope"); }, TypeError);
  assert.equal(CONTRACT.mandatoryReviewBy, "2027-02-17", "review date survived mutation attempts");
  assert.equal(CONTRACT.boundaries.upper, 75);

  return CONTRACT.reviewTriggers.length;
}

// ---------------------------------------------------------------------------
// 21-22. Interaction with the PR 18a evidence note, and malformed input
// ---------------------------------------------------------------------------

function testEvidenceNoteAndMalformedInputUnchanged() {
  // 21. The visible evidence note is still owned by the family contract, never
  //     graded by the frozen value.
  const aligned = riskFor({ ema: "B", sma: "N", bollinger: "N", rsi: "B", macd: "N", candlestick: "B", obv: "B" });
  assert.equal(aligned.agreement.evidenceState, "High agreement");
  assert.equal(selectFrozenRiskEvidencePenalty(
    indicators({ ema: "B", sma: "N", bollinger: "N", rsi: "B", macd: "N", candlestick: "B", obv: "B" })
  ), 15, "this configuration still reaches the maximum penalty");
  assert.deepEqual(
    aligned.risk.supportiveFactors.filter((f) => f.startsWith("Evidence context: ")),
    ["Evidence context: 4 of 4 evidence families support a bullish lean."],
    "a fully supported lean is still published as a supportive factor"
  );
  const wording = [...aligned.risk.riskNotes, ...aligned.risk.supportiveFactors].join(" ");
  assert.doesNotMatch(
    wording,
    /Directional confirmation is (strong|moderate|limited)/i,
    "no wording may be graded from the frozen value"
  );

  const conflicting = riskFor({ ema: "B", sma: "B", bollinger: "B", rsi: "B", macd: "B", candlestick: "R", obv: "R" });
  assert.equal(conflicting.agreement.evidenceState, "Conflicting evidence");
  assert.deepEqual(
    conflicting.risk.riskNotes.filter((n) => n.startsWith("Evidence context: ")),
    ["Evidence context: Directional evidence is split 2 against 2."]
  );

  // 22. Malformed and missing inputs retain the accepted behaviour.
  for (const malformed of [undefined, null, [], "x", 7, {}]) {
    const value = computeFrozenRiskEvidenceCompatValue(malformed);
    assert.equal(value, 0, "malformed indicator input yields the frozen zero value");
    assert.equal(selectFrozenRiskEvidencePenalty(malformed), 15, "and the maximum penalty");
  }

  // Missing agreement still fails safe in the published note.
  const bag = indicators({ ema: "B", sma: "B", bollinger: "B", rsi: "B", macd: "B", candlestick: "B", obv: "B" });
  for (const agreement of [undefined, null, [], { summary: 78 }]) {
    const risk = analyzeRisk({
      success: true,
      symbol: "AAPL",
      market: { success: true, data: { price: 210 } },
      indicators: bag,
      trend: { success: true, trend: "Bullish" },
      agreement
    });
    assert.equal(risk.success, true);
    assert.ok(
      risk.riskNotes.includes("Evidence context is unavailable for this analysis."),
      "malformed agreement still fails safe"
    );
    assert.equal(risk.riskScore, 23, "malformed agreement does not move the score");
  }

  return true;
}

function run() {
  const consumers = testSingleOwnershipAndSingleConsumer();
  const distinctValues = testFrozenValueAndSchedule();
  const behaviour = testFrozenBehaviouralProperties();
  testNotSerializedAndNotExposed();
  const triggers = testGovernanceRecord();
  testEvidenceNoteAndMalformedInputUnchanged();

  console.log("Frozen risk-evidence compatibility contract: all assertions passed.");
  console.log(`  permitted production consumers: ${consumers} (riskEngine evidence bucket only)`);
  console.log(`  frozen boundaries: 75 / 60   frozen penalties: 0 / 5 / 15`);
  console.log(`  reachable values: ${distinctValues} distinct, 35..78 at complete availability`);
  console.log(`  OBV inert: ${behaviour.obvChanges === 0}   direction-symmetric: ${behaviour.mirrorMismatches === 0}`);
  console.log(`  missing evidence lowered the penalty in ${behaviour.lowered} of ${behaviour.checked} removals`);
  console.log(`  mandatory review by ${CONTRACT.mandatoryReviewBy}; ${triggers} review triggers recorded`);
  console.log("  status: frozen compatibility behaviour, private, temporary, explicitly unvalidated.");
  console.log("  NOTE: configuration-space shares are not observed market frequencies and");
  console.log("        do not estimate how often a condition occurs in production.");
}

if (require.main === module) run();

module.exports = { run };
