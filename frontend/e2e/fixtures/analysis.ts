import type { Page } from "@playwright/test";

import type {
  AnalysisData,
  EvidenceAgreement,
  EvidenceFamily,
  HistoryResponse,
} from "../../src/types/analysis";

export const FIXTURE_NOW = Date.parse(
  "2026-07-26T09:00:00.000Z",
);

export const evidenceFamilies = [
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
      { name: "RSI", vote: "NEUTRAL" },
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
] satisfies EvidenceFamily[];

export const analysisData = {
  market: {
    success: true,
    provider: "Test fixture",
    data: {
      symbol: "AAPL",
      company: "Apple Inc.",
      exchange: "NASDAQ",
      currency: "USD",
      price: 215.5,
      change: 2.1,
      changePercent: 0.98,
      timestamp: FIXTURE_NOW / 1000,
    },
  },
  metadata: {
    state: "realtime",
    asOf: new Date(FIXTURE_NOW).toISOString(),
    marketSource: "Test fixture",
    filingSource: "Test fixture",
    reviewRequired: false,
    knownLimitations: [],
  },
  indicators: {
    rsi: {
      success: true,
      symbol: "AAPL",
      rsi: 58,
      signal: "NEUTRAL",
      provider: "Test fixture",
    },
    ema: {
      success: true,
      symbol: "AAPL",
      ema20: 212.4,
      currentPrice: 215.5,
      signal: "BULLISH",
      provider: "Test fixture",
    },
    sma: {
      success: true,
      symbol: "AAPL",
      sma50: 207.8,
      currentPrice: 215.5,
      signal: "BULLISH",
      provider: "Test fixture",
    },
    macd: {
      success: true,
      symbol: "AAPL",
      macd: 1.48,
      signalLine: 1.12,
      histogram: 0.36,
      signal: "BULLISH",
      provider: "Test fixture",
    },
    bollinger: {
      success: true,
      symbol: "AAPL",
      upperBand: 218.2,
      middleBand: 211.6,
      lowerBand: 205,
      currentPrice: 215.5,
      signal: "BEARISH",
      provider: "Test fixture",
    },
    adx: {
      success: true,
      symbol: "AAPL",
      adx: 24.2,
      plusDI: 27.8,
      minusDI: 19.1,
      signal: "NEUTRAL",
      provider: "Test fixture",
    },
    atr: {
      success: true,
      symbol: "AAPL",
      atr: 5.17,
      signal: "NEUTRAL",
      provider: "Test fixture",
    },
    obv: {
      success: true,
      symbol: "AAPL",
      obv: 12_450_000,
      signal: "BULLISH",
      explanation: "On-balance volume supports the upside scenario.",
      provider: "Test fixture",
    },
    rvol: {
      success: true,
      symbol: "AAPL",
      todayVolume: 1_230_000,
      averageVolume30: 1_100_000,
      rvol: 1.12,
      signal: "NEUTRAL",
      explanation: "Relative volume is near its recent average.",
      provider: "Test fixture",
    },
    volumeSpike: {
      success: true,
      symbol: "AAPL",
      todayVolume: 1_230_000,
      averageVolume30: 1_100_000,
      rvol: 1.12,
      volumeSpikeDetected: false,
      level: "NORMAL",
      signal: "NEUTRAL",
      explanation: "No unusual volume spike is present.",
      provider: "Test fixture",
    },
    candlestick: {
      success: true,
      symbol: "AAPL",
      pattern: "No decisive pattern",
      bias: "NEUTRAL",
      strength: 0,
      lastCandle: {
        open: 213.4,
        high: 216.5,
        low: 212.8,
        close: 215.5,
      },
      provider: "Test fixture",
    },
  },
  marketStructure: {},
  trend: {
    success: true,
    status: "COMPLETE",
    trend: "BULLISH",
    score: 72,
  },
  agreement: {
    agreement: "aligned",
    direction: "Bullish",
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
      families: evidenceFamilies,
    },
    summary: "3 of 4 evidence families support a bullish lean.",
    bullishSignals: 4,
    bearishSignals: 1,
    neutralSignals: 2,
    agreementSummary:
      "Deterministic evidence supports the test thesis.",
    agreementDetails: [
      "Trend evidence is constructive.",
      "Risk remains reviewable.",
    ],
  },
  confluence: {
    methodology: {
      actionableDistancePercent: 5,
    },
  },
  fundamentals: {
    success: true,
    status: "PARTIAL",
    provider: "Test fixture",
    asOf: new Date(FIXTURE_NOW).toISOString(),
    companyProfile: {
      name: "Apple Inc.",
      ticker: "AAPL",
      country: "US",
      currency: "USD",
      exchange: "NASDAQ",
      industry: "Technology",
      ipoDate: "1980-12-12",
    },
    coverage: {},
    unavailableSections: [],
    limitations: [],
  },
  risk: {
    success: true,
    riskLevel: "Moderate",
    riskScore: 42,
    volatility: "Moderate",
    atrPercent: 2.4,
    riskSummary:
      "The deterministic fixture requires normal risk review.",
  },
  shariah: {
    success: true,
    summary: {
      status: "COMPLIANT",
      confidence: "High",
      headline: "AAOIFI screen passed",
      explanation:
        "The deterministic fixture passes the AAOIFI screen.",
    },
    verification: {
      lastCheckedAt: new Date(FIXTURE_NOW).toISOString(),
      isStale: false,
    },
  },
  complianceGate: {
    unlocked: true,
    status: "COMPLIANT",
    message:
      "AAOIFI compliance is confirmed for this deterministic fixture.",
  },
  guidance: {
    contractVersion: "1.0",
    symbol: "AAPL",
    asOf: new Date(FIXTURE_NOW).toISOString(),
    horizon: "SWING_2_TO_10_SESSIONS",
    shariah: {
      status: "COMPLIANT",
      verdictPermitted: true,
      reason: null,
    },
    verdict: {
      state: "FAVORED",
      direction: "BULLISH",
    },
    publicLabel: "Constructive — Upside Evidence Established",
    evidenceAgreement: {
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
        families: evidenceFamilies,
      },
      summary: "3 of 4 evidence families support a bullish lean.",
    } satisfies EvidenceAgreement,
    currentSituation:
      "Upside evidence currently leads the available indicator set, with confirmation still conditional.",
    supportingEvidence: [
      {
        source: "Market structure",
        statement:
          "Price remains above the rising short-term trend structure.",
      },
      {
        source: "Evidence Agreement",
        statement:
          "Four directional indicators support the upside scenario while one opposes it.",
      },
      {
        source: "Momentum",
        statement:
          "RSI reads neutral within momentum while MACD reads bullish within momentum, so the momentum family votes bullish on mixed internal evidence.",
      },
    ],
    opposingEvidence: [
      {
        source: "Bollinger Bands",
        statement:
          "Bollinger Bands reads bearish within trend position.",
      },
      {
        source: "Risk",
        statement:
          "Moderate volatility can produce movement against the prevailing scenario.",
      },
    ],
    meaning:
      "Current evidence favors an upside scenario over the stated swing horizon, conditionally rather than as a prediction or transaction instruction.",
    nextObservation:
      "Observe whether price establishes acceptance above $218.00 with supporting participation.",
    confirmations: [
      "A sustained close above $218.00 with stronger participation would strengthen the scenario.",
    ],
    invalidation: {
      status: "intact",
      technical:
        "A daily close below $208.50 would break the support structure governing this scenario.",
      fundamental:
        "A material deterioration in the reported risk profile or loss of confirmed Shariah compliance would require fresh analysis.",
      evidence: {
        technical: {
          evidence:
            "$208.50 is the deterministic support boundary in this visual fixture.",
        },
        fundamental: {
          evidence:
            "The fixture currently reports moderate risk and confirmed AAOIFI compliance.",
        },
      },
    },
    risk: {
      level: "Moderate",
      score: 42,
      volatility: "Moderate",
      summary:
        "Normal swing volatility remains capable of invalidating the scenario.",
      notes: [
        "Trend strength is only moderate, which reduces the reliability of directional signals.",
      ],
    },
    freshness: {
      state: "REALTIME",
      asOf: new Date(FIXTURE_NOW).toISOString(),
    },
    limitations: [
      "Relative-volume evidence is unavailable in this deterministic fixture.",
      "Scenario evidence can change after the stated analysis time.",
    ],
    allowedNextStep:
      "Observe whether the stated confirmation condition occurs, and reassess the scenario if the $208.50 invalidation boundary is reached instead.",
  },
  explanation: {
    overallAssessment:
      "The fixture explains evidence without promising an outcome.",
  },
} satisfies AnalysisData;

export const historicalBars = Array.from(
  { length: 24 },
  (_, index) => {
    const close = 200 + index * 0.5;

    return {
      date: new Date(Date.UTC(2026, 5, index + 1))
        .toISOString()
        .slice(0, 10),
      open: close - 0.4,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1_000_000 + index * 10_000,
    };
  },
);

/*
 * `provider` is the exact label the backend stamps on every successful history
 * response: backend/providers/marketDataProvider.js maps twelve_data ->
 * "TwelveData" through a frozen PROVIDER_LABELS object, and marketEngine's
 * getHistory returns that record verbatim through GET /history/:symbol.
 *
 * It is declared here because `provider?` is optional, so a fixture without it
 * compiles cleanly while modelling a success response the backend does not
 * actually produce - and, until B7b, silently gave the chart's provenance-driven
 * attribution no visual coverage at all.
 *
 * One word, no space. "Twelve Data" is not a label any adapter emits, and the
 * registry matches exactly.
 */
export const historyResponse = {
  success: true,
  symbol: "AAPL",
  interval: "1day",
  provider: "TwelveData",
  bars: historicalBars,
} satisfies HistoryResponse;

export async function mockHealthyAnalysis(page: Page) {
  await page.addInitScript(() => {
    const accessToken = "fixtureheader.fixturepayload.fixturesignature";
    window.localStorage.setItem("sb-aaaaaaaaaaaaaaaaaaaa-auth-token", JSON.stringify({
      access_token: accessToken,
      refresh_token: "fixture-refresh-token",
      expires_at: 4_102_444_800,
      expires_in: 3_600,
      token_type: "bearer",
      user: { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated" },
    }));
  });
  // Browser journeys exercise the UI in an isolated Vite test server.
  // Authorize the gate at its public status contract instead of storing or
  // teaching CI a production access code.
  await page.route(
    "**/auth/demo/status",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          enabled: true,
          authorized: true,
        }),
      });
    },
  );
  await page.route(
    "**/api/analyze/AAPL**",
    async (route) => {
      if (route.request().headers()["authorization"] !== "Bearer fixtureheader.fixturepayload.fixturesignature") {
        return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ code: "AUTH_REQUIRED" }) });
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: analysisData,
        }),
      });
    },
  );
  await page.route(
    "**/history/AAPL**",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(historyResponse),
      });
    },
  );
}
