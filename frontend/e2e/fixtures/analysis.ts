import type { Page } from "@playwright/test";

export const FIXTURE_NOW = Date.parse(
  "2026-07-26T09:00:00.000Z",
);

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
      value: 58,
      signal: "NEUTRAL",
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
    agreement: "BULLISH",
    direction: "BULLISH",
    confidence: 72,
    bullishSignals: 4,
    bearishSignals: 1,
    neutralSignals: 1,
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
    riskLevel: "MEDIUM",
    riskScore: 52,
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
  explanation: {
    overallAssessment:
      "The fixture explains evidence without promising an outcome.",
  },
  thesisInvalidation: {
    summary:
      "The thesis requires review if the evidence weakens.",
  },
};

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

export async function mockHealthyAnalysis(page: Page) {
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
        body: JSON.stringify({
          success: true,
          bars: historicalBars,
        }),
      });
    },
  );
}
