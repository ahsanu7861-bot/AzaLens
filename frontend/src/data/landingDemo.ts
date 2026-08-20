import type { AnalysisData, EvidenceAgreement } from "../types/analysis";
import type { ThesisInvalidation } from "../types/overview";
import contract from "./landingDemo.contract.json";

/*
  Landing-page demonstration projection (roadmap items 2.15 / 2.16).

  This is deliberately NOT `AnalysisData`. The landing demo is not a complete
  backend analysis and typing it as one made three untrue claims at once: that a
  risk assessment existed (it did not — `analyzeRisk` rejects these inputs for
  want of a price and an ATR), that a directional lean was a public verdict, and
  that an internal trend word was a horizon.

  Instead this projection carries only what mounted landing components read.
  Every structural type below is imported from the canonical contract or reached
  by indexed access into it — nothing is restated locally, so a breaking change
  to a type the landing page actually renders still fails the build. The two
  canonical strings (`publicLabel`, `horizonToken`) are checked copies of real
  backend output, pinned by backend/tests/testLandingDemoContract.js.

  There is no `risk` member. Not `risk: {}` either: an empty risk object is
  assignable only because every field inside it is optional, and it would assert
  that an assessment exists which states nothing. No assessment was ever made.
*/

type Guidance = NonNullable<AnalysisData["guidance"]>;

/** The confirmed-compliance demonstration card. */
export interface LandingDemoCard {
  /** Canonical public verdict wording. Backend-owned; rendered verbatim. */
  publicLabel: Guidance["publicLabel"];
  /** Canonical horizon token. Mapped to display text by `horizonLabel`. */
  horizonToken: Guidance["horizon"];
  summary: string;
  evidence: EvidenceAgreement;
  invalidation: ThesisInvalidation;
  shariah: AnalysisData["shariah"];
}

/** The withheld-compliance demonstration card. */
export interface LandingDemoWithheld {
  withheldMessage: string;
  shariah: AnalysisData["shariah"];
}

/*
 * Presentational objects with strict union members are authored here rather than
 * in the JSON, so TypeScript checks them against the canonical types directly
 * instead of through a cast that would accept any string.
 *
 * The drift risk that creates is closed by test, not by hope: the backend suite
 * proves the JSON's evidence block is what the engine derives, and the frontend
 * suite proves these objects deep-equal that block. Rendered evidence is
 * therefore engine-derived transitively, with no `as` anywhere in the chain.
 */
const confirmedEvidence: EvidenceAgreement = {
  state: "Moderate agreement",
  support: {
    direction: "BULLISH",
    supportingFamilies: 3,
    opposingFamilies: 0,
    neutralFamilies: 1,
  },
  coverage: {
    usableFamilies: 4,
    expectedFamilies: 4,
    unavailableFamilies: 0,
    families: [
      {
        id: "trendPosition",
        label: "Trend position",
        vote: "BULLISH",
        members: [
          { name: "EMA", vote: "BULLISH" },
          { name: "SMA", vote: "BULLISH" },
          { name: "Bollinger Bands", vote: "BEARISH" },
        ],
      },
      {
        id: "momentum",
        label: "Momentum",
        vote: "BULLISH",
        members: [
          { name: "RSI", vote: "BULLISH" },
          { name: "MACD", vote: "BULLISH" },
        ],
      },
      {
        id: "priceAction",
        label: "Price action",
        vote: "NEUTRAL",
        members: [{ name: "Candlestick", vote: "NEUTRAL" }],
      },
      {
        id: "volumeFlow",
        label: "Volume flow",
        vote: "BULLISH",
        members: [{ name: "OBV", vote: "BULLISH" }],
      },
    ],
  },
  summary: "3 of 4 evidence families support a bullish lean.",
};

const confirmedShariah: AnalysisData["shariah"] = {
  success: true,
  symbol: "DEMO2",
  summary: {
    status: "COMPLIANT",
    confidence: "High",
    explanation:
      "This demonstration company passes both the AAOIFI business-activity and financial-ratio screens.",
    purificationRateFormatted: "0.4% of dividends",
  },
  businessActivity: {
    status: "PASS",
    reason:
      "Core business activity contains no impermissible revenue lines in this sample.",
  },
  financialScreen: {
    status: "PASS",
    ratios: {
      debtToAssetsFormatted: "18%",
      interestIncomeToRevenueFormatted: "0.6%",
    },
  },
  verification: {
    lastCheckedAt: "2026-07-01T00:00:00.000Z",
    isStale: false,
  },
};

const withheldShariah: AnalysisData["shariah"] = {
  success: true,
  symbol: "DEMO1",
  summary: {
    status: "UNKNOWN",
    confidence: "Pending",
    explanation:
      "The AAOIFI screen for this demonstration stock has not returned a confirmed result yet.",
  },
  verification: {
    lastCheckedAt: null,
    isStale: false,
  },
};

const confirmedInvalidation: ThesisInvalidation = {
  status: "intact",
  technical:
    "Remains intact while price holds above the identified structural support with normal-to-elevated volume on any breakdown.",
  fundamental:
    "Remains intact while AAOIFI compliance stays confirmed and debt-to-assets and impermissible-income stay within the AAOIFI thresholds.",
  evidence: {
    technical: {
      status: "intact",
      evidence:
        "Representative rule for this demonstration — not a live trigger level.",
    },
    fundamental: {
      status: "intact",
      evidence:
        "Representative rule for this demonstration — not live financial data.",
    },
  },
};

export const confirmedDemoCard: LandingDemoCard = {
  publicLabel: contract.confirmed.presentation.publicLabel,
  horizonToken: contract.confirmed.presentation.horizonToken,
  summary: contract.confirmed.presentation.summary,
  evidence: confirmedEvidence,
  invalidation: confirmedInvalidation,
  shariah: confirmedShariah,
};

export const withheldDemoCard: LandingDemoWithheld = {
  withheldMessage: contract.withheld.presentation.withheldMessage,
  shariah: withheldShariah,
};

/*
 * Re-exported for the tests that assert the rendered panel agrees with the
 * compliance-gate input the backend derivation was run against.
 */
export const landingDemoContract = contract;
