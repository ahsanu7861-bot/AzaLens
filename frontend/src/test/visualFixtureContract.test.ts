import { describe, expect, it } from "vitest";

import {
  analysisData,
  historyResponse,
} from "../../e2e/fixtures/analysis";
import {
  EVIDENCE_FAMILY_IDS,
  EXPECTED_EVIDENCE_FAMILIES,
  type DirectionalSupport,
  type EvidenceAgreement,
  type EvidenceCoverage,
  type EvidenceFamily,
  type EvidenceFamilyMember,
  type FamilyVote,
} from "../types/analysis";

/*
 * ============================================================================
 * Fixture contract — this suite tests the *test data*, not the product.
 *
 * The deterministic visual fixture is the sole input to the @visual Playwright
 * baselines. Nothing else validates it: Playwright renders whatever it is given
 * and records the pixels, so a fixture that contradicts itself becomes a
 * permanent, self-consistent-looking baseline. That is exactly what happened
 * before this suite existed — the fixture declared Momentum BULLISH from a
 * BULLISH RSI while the visible narrative said RSI was neutral and momentum had
 * not confirmed, and the narrative claimed four bullish indicators while the
 * members declared five.
 *
 * The assertions below re-derive every published number from the fixture's own
 * declared members using Model A, so the family votes, the cross-family counts,
 * the coverage, the state, the summary and the narrative can never drift apart
 * again without a red test.
 *
 * Model A is restated here rather than imported: the aggregation rule lives in
 * backend/analysis/agreement/agreementEngine.js, which is CommonJS and
 * server-only, so the frontend cannot import it. Restating it is the point —
 * an independent re-derivation that disagrees with the fixture is the signal.
 * See docs/VERDICT_CONTRACT.md.
 * ============================================================================
 */

/* Availability thresholds, mirroring EVIDENCE_FAMILIES in the agreement engine. */
const MINIMUM_USABLE_MEMBERS: Record<string, number> = {
  trendPosition: 2,
  momentum: 2,
  priceAction: 1,
  volumeFlow: 1,
};

/*
 * Model A. A family whose usable members fall below its threshold cannot vote.
 * Otherwise the balance of bullish against bearish decides, so a single
 * directional member establishes the family when the rest are neutral.
 */
function applyModelA(id: string, members: EvidenceFamilyMember[]): FamilyVote {
  const usable = members.filter((member) => member.vote !== "UNAVAILABLE");
  if (usable.length < MINIMUM_USABLE_MEMBERS[id]) return "UNAVAILABLE";

  const bullish = usable.filter((member) => member.vote === "BULLISH").length;
  const bearish = usable.filter((member) => member.vote === "BEARISH").length;

  if (bullish > bearish) return "BULLISH";
  if (bearish > bullish) return "BEARISH";
  return "NEUTRAL";
}

const fixture = analysisData;

/*
 * Contract acceptance, checked at compile time. The evidence surfaces this
 * fixture governs are bound to the very interfaces production consumers are
 * compiled against, so `tsc -b` fails if either side moves.
 *
 * `analysisData` itself is bound to `AnalysisData` at its declaration. These
 * focused bindings retain readable failures for the public evidence surface.
 */
const evidenceAgreement: EvidenceAgreement | null | undefined =
  fixture.guidance.evidenceAgreement;
const supportContract: DirectionalSupport = fixture.guidance.evidenceAgreement.support;
const coverageContract: EvidenceCoverage =
  fixture.guidance.evidenceAgreement.coverage;
const narrativeContract: Array<{ source: string; statement: string }> = [
  ...fixture.guidance.supportingEvidence,
  ...fixture.guidance.opposingEvidence,
];

const families = (evidenceAgreement?.coverage.families ?? []) as EvidenceFamily[];
const familyById = new Map(families.map((family) => [family.id, family]));
const allMembers = families.flatMap((family) => family.members);

const narrative: string[] = [
  fixture.guidance?.currentSituation,
  fixture.guidance?.meaning,
  fixture.guidance?.nextObservation,
  fixture.guidance?.allowedNextStep,
  evidenceAgreement?.summary,
  ...(fixture.guidance?.supportingEvidence ?? []).map((item) => item.statement),
  ...(fixture.guidance?.opposingEvidence ?? []).map((item) => item.statement),
  ...(fixture.guidance?.confirmations ?? []),
  ...(fixture.guidance?.limitations ?? []),
].filter((entry): entry is string => typeof entry === "string");

describe("visual fixture — accepted by the public evidence contract", () => {
  it("binds to the interfaces production consumers are compiled against", () => {
    expect(evidenceAgreement).not.toBeNull();
    expect(supportContract.direction).toBe("BULLISH");
    expect(coverageContract.expectedFamilies).toBe(EXPECTED_EVIDENCE_FAMILIES);
    expect(coverageContract.families).toHaveLength(EXPECTED_EVIDENCE_FAMILIES);
    for (const item of narrativeContract) {
      expect(typeof item.source).toBe("string");
      expect(typeof item.statement).toBe("string");
      expect(item.statement.length).toBeGreaterThan(0);
    }
  });
});

describe("visual fixture — mounted source readings agree with evidence members", () => {
  const indicatorVotes = new Map([
    ["EMA", analysisData.indicators.ema.signal],
    ["SMA", analysisData.indicators.sma.signal],
    ["Bollinger Bands", analysisData.indicators.bollinger?.signal],
    ["RSI", analysisData.indicators.rsi.signal],
    ["MACD", analysisData.indicators.macd.signal],
    ["Candlestick", analysisData.indicators.candlestick?.bias],
    ["OBV", analysisData.indicators.obv.signal],
  ]);

  it("provides every indicator that the production service always returns", () => {
    expect(Object.keys(analysisData.indicators).sort()).toEqual([
      "adx",
      "atr",
      "bollinger",
      "candlestick",
      "ema",
      "macd",
      "obv",
      "rsi",
      "rvol",
      "sma",
      "volumeSpike",
    ]);
  });

  it("uses the public RSI field consumed by Technical Evidence", () => {
    expect(analysisData.indicators.rsi.rsi).toBe(58);
    expect(analysisData.indicators.rsi).not.toHaveProperty("value");
  });

  it("gives each declared family member the same vote as its mounted reading", () => {
    for (const member of allMembers) {
      expect(
        indicatorVotes.get(member.name),
        `${member.name} source reading must agree with its family vote`,
      ).toBe(member.vote);
    }
  });

  it("publishes the same complete family coverage on analysis and guidance", () => {
    expect(analysisData.agreement.coverage?.families).toEqual(families);
    expect(analysisData.agreement.coverage?.usableFamilies).toBe(
      EXPECTED_EVIDENCE_FAMILIES,
    );
    expect(analysisData.agreement.coverage?.unavailableFamilies).toBe(0);
  });
});

describe("visual fixture — invalidation and history contracts", () => {
  it("publishes only the mounted canonical invalidation object", () => {
    expect(analysisData).not.toHaveProperty("thesisInvalidation");
    expect(analysisData.guidance.invalidation?.status).toBe("intact");
    expect(analysisData.guidance.invalidation).not.toHaveProperty("summary");
  });

  it("mocks the identity fields returned by the real history endpoint", () => {
    expect(historyResponse.success).toBe(true);
    expect(historyResponse.symbol).toBe("AAPL");
    expect(historyResponse.interval).toBe("1day");
    expect(historyResponse.bars).toHaveLength(24);
  });
});

describe("visual fixture — family votes derive from their own members", () => {
  it("declares exactly the four expected families, once each", () => {
    expect(families.map((family) => family.id)).toEqual([
      ...EVIDENCE_FAMILY_IDS,
    ]);
    expect(families).toHaveLength(EXPECTED_EVIDENCE_FAMILIES);
  });

  it.each([
    ["trendPosition", "BULLISH"],
    ["momentum", "BULLISH"],
    ["priceAction", "NEUTRAL"],
    ["volumeFlow", "BULLISH"],
  ])("%s votes %s, and Model A agrees with its declared members", (id, vote) => {
    const family = familyById.get(id);
    expect(family, `family ${id} is missing`).toBeDefined();
    expect(family!.vote).toBe(vote);
    expect(applyModelA(id, family!.members)).toBe(vote);
  });

  it("derives Trend position BULLISH from two bullish against one bearish", () => {
    const members = familyById.get("trendPosition")!.members;
    expect(members).toEqual([
      { name: "EMA", vote: "BULLISH" },
      { name: "SMA", vote: "BULLISH" },
      { name: "Bollinger Bands", vote: "BEARISH" },
    ]);
    expect(applyModelA("trendPosition", members)).toBe("BULLISH");
  });

  /*
   * The single-directional-member case. Both members are usable, so the family
   * may vote; MACD is the only member expressing a direction, so it sets it.
   * A neutral RSI does not veto the family and does not make it unavailable.
   */
  it("derives Momentum BULLISH from a neutral RSI and a bullish MACD", () => {
    const members = familyById.get("momentum")!.members;
    expect(members).toEqual([
      { name: "RSI", vote: "NEUTRAL" },
      { name: "MACD", vote: "BULLISH" },
    ]);
    expect(applyModelA("momentum", members)).toBe("BULLISH");
  });

  it("derives Price action NEUTRAL from its single neutral member", () => {
    const members = familyById.get("priceAction")!.members;
    expect(members).toEqual([{ name: "Candlestick", vote: "NEUTRAL" }]);
    expect(applyModelA("priceAction", members)).toBe("NEUTRAL");
  });

  it("derives Volume flow BULLISH from its single bullish member", () => {
    const members = familyById.get("volumeFlow")!.members;
    expect(members).toEqual([{ name: "OBV", vote: "BULLISH" }]);
    expect(applyModelA("volumeFlow", members)).toBe("BULLISH");
  });
});

describe("visual fixture — cross-family counts derive from the family votes", () => {
  const votes = () => families.map((family) => family.vote);

  it("supports the bullish lean with exactly three families", () => {
    expect(votes().filter((vote) => vote === "BULLISH")).toHaveLength(3);
    expect(evidenceAgreement?.support.supportingFamilies).toBe(3);
    expect(evidenceAgreement?.support.direction).toBe("BULLISH");
  });

  it("reports no opposing family, matching the absence of bearish votes", () => {
    expect(votes().filter((vote) => vote === "BEARISH")).toHaveLength(0);
    expect(evidenceAgreement?.support.opposingFamilies).toBe(0);
  });

  it("reports exactly one neutral family", () => {
    expect(votes().filter((vote) => vote === "NEUTRAL")).toHaveLength(1);
    expect(evidenceAgreement?.support.neutralFamilies).toBe(1);
  });

  it("reports full coverage of four of four, with none unavailable", () => {
    expect(votes().filter((vote) => vote === "UNAVAILABLE")).toHaveLength(0);
    expect(evidenceAgreement?.coverage.usableFamilies).toBe(4);
    expect(evidenceAgreement?.coverage.expectedFamilies).toBe(
      EXPECTED_EVIDENCE_FAMILIES,
    );
    expect(evidenceAgreement?.coverage.unavailableFamilies).toBe(0);
  });

  /* Three of four supporting under complete coverage grades Moderate, not High. */
  it("grades the state Moderate agreement", () => {
    expect(evidenceAgreement?.state).toBe("Moderate agreement");
  });

  it("publishes a summary that restates its own counts and direction", () => {
    const support = evidenceAgreement!.support;
    expect(evidenceAgreement?.summary).toBe(
      `${support.supportingFamilies} of ${EXPECTED_EVIDENCE_FAMILIES} evidence families support a bullish lean.`,
    );
    expect(evidenceAgreement?.summary).toBe(
      "3 of 4 evidence families support a bullish lean.",
    );
  });

  it("keeps the duplicated agreement surface consistent with the guidance one", () => {
    expect(fixture.agreement?.evidenceState).toBe(evidenceAgreement?.state);
    expect(fixture.agreement?.summary).toBe(evidenceAgreement?.summary);
    expect(fixture.agreement?.support).toEqual(evidenceAgreement?.support);
  });
});

describe("visual fixture — indicator census matches the declared members", () => {
  const census = (vote: string) =>
    allMembers.filter((member) => member.vote === vote).map((member) => member.name);

  it("counts exactly four bullish indicators", () => {
    expect(census("BULLISH")).toEqual(["EMA", "SMA", "MACD", "OBV"]);
    expect(fixture.agreement?.bullishSignals).toBe(4);
  });

  it("counts exactly one bearish indicator", () => {
    expect(census("BEARISH")).toEqual(["Bollinger Bands"]);
    expect(fixture.agreement?.bearishSignals).toBe(1);
  });

  it("counts exactly two neutral indicators", () => {
    expect(census("NEUTRAL")).toEqual(["RSI", "Candlestick"]);
    expect(fixture.agreement?.neutralSignals).toBe(2);
  });

  it("names every member exactly once across the four families", () => {
    const names = allMembers.map((member) => member.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toHaveLength(7);
  });
});

describe("visual fixture — the narrative does not contradict the votes", () => {
  const momentumStatement = [
    ...(fixture.guidance?.supportingEvidence ?? []),
    ...(fixture.guidance?.opposingEvidence ?? []),
  ].find((item) => item.source === "Momentum")?.statement;

  /*
   * The specific regression this file exists to prevent: prose asserting that
   * momentum failed to confirm while the Momentum family votes BULLISH.
   */
  it("never claims momentum is unconfirmed while Momentum votes BULLISH", () => {
    expect(familyById.get("momentum")?.vote).toBe("BULLISH");
    for (const line of narrative) {
      expect(line).not.toMatch(/momentum has not/i);
      expect(line).not.toMatch(/not independently confirmed/i);
      expect(line).not.toMatch(/momentum[^.]*\bunconfirmed\b/i);
    }
  });

  it("states the mixed internal momentum evidence truthfully", () => {
    expect(momentumStatement).toBeDefined();
    expect(momentumStatement).toMatch(/RSI reads neutral within momentum/i);
    expect(momentumStatement).toMatch(/MACD reads bullish within momentum/i);
    expect(momentumStatement).toMatch(/momentum family votes bullish/i);
    expect(momentumStatement).toMatch(/mixed/i);
  });

  it("never describes a member with a direction it does not hold", () => {
    for (const line of narrative) {
      expect(line).not.toMatch(/RSI is bullish|RSI reads bullish/i);
      expect(line).not.toMatch(/Bollinger[^.]*\bbullish\b/i);
      expect(line).not.toMatch(/Candlestick[^.]*\b(bullish|bearish)\b/i);
    }
  });

  /*
   * The indicator-count sentence is only permitted while the census actually
   * reads four bullish against one bearish.
   */
  it("only claims four supporting indicators while the census says four", () => {
    const countSentence = (fixture.guidance?.supportingEvidence ?? []).find((item) =>
      /directional indicators support/i.test(item.statement),
    )?.statement;

    if (countSentence) {
      expect(countSentence).toMatch(/^Four directional indicators support/);
      expect(countSentence).toMatch(/while one opposes it/);
      expect(fixture.agreement?.bullishSignals).toBe(4);
      expect(fixture.agreement?.bearishSignals).toBe(1);
    }
  });

  it("lists the genuinely bearish indicator as the opposing evidence", () => {
    const opposingSources = (fixture.guidance?.opposingEvidence ?? []).map(
      (item) => item.source,
    );
    expect(opposingSources).toContain("Bollinger Bands");
    expect(opposingSources).not.toContain("Momentum");
  });
});

describe("visual fixture — no percentage or removed numeric field survives", () => {
  /* Scoped to the evidence surfaces: atrPercent and changePercent are unrelated. */
  const evidenceSurfaces = JSON.stringify({
    agreement: fixture.agreement,
    evidenceAgreement,
    narrative,
  });

  it.each([
    "percent",
    "confidence",
    "rawAgreementPercent",
    "coveragePercent",
    "agreementConfidence",
    "progress",
  ])("carries no %s field on any evidence surface", (field) => {
    expect(evidenceSurfaces).not.toMatch(new RegExp(`"${field}"`, "i"));
  });

  it("shows no percent sign anywhere in the evidence narrative", () => {
    for (const line of narrative) {
      expect(line).not.toMatch(/\d\s*%/);
      expect(line).not.toMatch(/\bAgreement Confidence\b/i);
    }
  });

  it("expresses support as a count out of four, never as a ratio or score", () => {
    const support = evidenceAgreement!.support;
    expect(Number.isInteger(support.supportingFamilies)).toBe(true);
    expect(support.supportingFamilies).toBeLessThanOrEqual(
      EXPECTED_EVIDENCE_FAMILIES,
    );
    expect(
      support.supportingFamilies +
        support.opposingFamilies +
        support.neutralFamilies,
    ).toBe(evidenceAgreement!.coverage.usableFamilies);
  });
});
