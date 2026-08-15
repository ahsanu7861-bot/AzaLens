import type { AnalysisData, EvidenceAgreement } from "../types/analysis";

/*
  Representative fixtures for the landing-page compliance demonstration
  (ComplianceDemo.tsx). These are typed against the real AnalysisData
  contract — the shape the backend actually returns from
  /api/analyze/:symbol after complianceGateService applies its gate — so
  a breaking change to that contract fails the TypeScript build instead
  of drifting silently. Nothing here is live market or screening data;
  see ComplianceDemo.tsx for how it is labelled to visitors.
*/

const emptyIndicators: AnalysisData["indicators"] = {
  rsi: {},
  ema: {},
  sma: {},
  macd: {},
  adx: {},
  atr: {},
  obv: {},
  rvol: {},
};

const NOT_CONFIRMED_MESSAGE =
  "AAOIFI Shariah compliance has not been confirmed for this stock, so AzaLens withholds its trade analysis. Details are in the Shariah Compliance workspace.";

export const withheldDemoAnalysis: AnalysisData = {
  market: {
    success: true,
    data: {
      symbol: "DEMO1",
      company: "Sample Holdings Co.",
      exchange: "Demonstration",
      currency: "USD",
    },
  },
  indicators: emptyIndicators,
  confluence: {},
  complianceGate: {
    status: "WITHHELD",
    unlocked: false,
    requiredStatus: "COMPLIANT",
    shariahStatus: "UNKNOWN",
    staleEvidence: false,
    reason: "NOT_CONFIRMED",
    message: NOT_CONFIRMED_MESSAGE,
  },
  trend: {
    success: false,
    withheld: true,
    reason: "NOT_CONFIRMED",
    error: NOT_CONFIRMED_MESSAGE,
  },
  agreement: {
    success: false,
    withheld: true,
    reason: "NOT_CONFIRMED",
    error: NOT_CONFIRMED_MESSAGE,
  },
  explanation: {
    success: false,
    withheld: true,
    reason: "NOT_CONFIRMED",
    error: NOT_CONFIRMED_MESSAGE,
  },
  risk: {
    success: false,
    riskLevel: "Unavailable",
    riskSummary:
      "Risk context is withheld with the rest of the trade-optimization output until compliance is confirmed.",
  },
  shariah: {
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
  },
  thesisInvalidation: {
    status: "unknown",
    technical: null,
    fundamental: null,
  },
};

export const confirmedDemoAnalysis: AnalysisData = {
  market: {
    success: true,
    data: {
      symbol: "DEMO2",
      company: "Example Manufacturing Co.",
      exchange: "Demonstration",
      currency: "USD",
    },
  },
  indicators: emptyIndicators,
  confluence: {},
  complianceGate: {
    status: "UNLOCKED",
    unlocked: true,
    requiredStatus: "COMPLIANT",
    shariahStatus: "COMPLIANT",
    staleEvidence: false,
    reason: null,
    message: null,
  },
  trend: {
    success: true,
    status: "COMPLETE",
    trend: "Bullish",
  },
  /*
   * Deterministic demonstration data shaped exactly as the agreement engine
   * emits under Model A: three of the four independent evidence families back
   * the lean, price action is neutral, and coverage is complete. There is no
   * percentage — the product does not publish one.
   */
  agreement: {
    success: true,
    direction: "Bullish",
    agreement: "aligned",
    evidenceState: "Moderate agreement",
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
    agreementSummary:
      "Current technical evidence has a bullish lean—not a guarantee of future performance.",
    bullishSignals: 5,
    bearishSignals: 1,
    neutralSignals: 1,
    availableIndicators: 9,
    expectedIndicators: 9,
  },
  explanation: {
    success: true,
    overallAssessment:
      "Momentum and trend indicators lean bullish while volume confirms the move. Fundamentals and AAOIFI compliance are both confirmed, so the directional lean is shown.",
  },
  risk: {
    success: true,
    riskLevel: "Medium",
    riskSummary:
      "Representative risk context for this demonstration: moderate volatility, no outsized single-day swings in the sample data.",
  },
  shariah: {
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
  },
  thesisInvalidation: {
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
  },
};

/*
 * The demonstration's Evidence Agreement, typed as the canonical contract so the
 * landing page consumes exactly the shape the product publishes.
 */
export const confirmedDemoEvidence: EvidenceAgreement = {
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
}
