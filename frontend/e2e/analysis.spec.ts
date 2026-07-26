import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type Page,
} from "@playwright/test";

const analysisData = {
  market: {
    success: true,
    data: {
      symbol: "AAPL",
      company: "Apple Inc.",
      exchange: "NASDAQ",
      currency: "USD",
      price: 215.5,
      change: 2.1,
      changePercent: 0.98,
    },
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
    asOf: "2026-07-26T08:00:00.000Z",
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
      lastCheckedAt: "2026-07-26T08:00:00.000Z",
      isStale: false,
    },
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

const historicalBars = Array.from(
  { length: 24 },
  (_, index) => {
    const close = 200 + index * 0.5;
    return {
      date: new Date(
        Date.UTC(2026, 5, index + 1),
      )
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

async function mockHealthyAnalysis(page: Page) {
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

test.beforeEach(async ({ page }) => {
  await mockHealthyAnalysis(page);
});

test("moves through all six evidence workspaces", async ({
  page,
}) => {
  await page.goto("/analysis/AAPL");

  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(6);
  await expect(
    page.getByRole("tab", { name: "Overview" }),
  ).toHaveAttribute("aria-selected", "true");

  const expectations = [
    ["Technical", /Technical Evidence/i],
    ["Fundamentals", /Verified company profile/i],
    ["Risk", /Understand the downside/i],
    ["Shariah", /AAOIFI Shariah screening/i],
    ["AI Thesis", /What supports or challenges/i],
  ] as const;

  for (const [tab, heading] of expectations) {
    await page.getByRole("tab", { name: tab }).click();
    await expect(
      page.getByRole("tabpanel"),
    ).toContainText(heading);
  }
});

test("reports an API failure and supports recovery", async ({
  page,
}) => {
  let attempts = 0;
  await page.unroute("**/api/analyze/AAPL**");
  await page.route(
    "**/api/analyze/AAPL**",
    async (route) => {
      attempts += 1;
      if (attempts <= 4) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            error: "Temporary test failure",
          }),
        });
        return;
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

  await page.goto("/analysis/AAPL");
  await expect(page.getByRole("alert")).toContainText(
    "could not analyze",
  );
  await page.getByRole("button", {
    name: "Try again",
  }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("tab", { name: "Overview" }),
  ).toHaveAttribute("aria-selected", "true");
});

test("has no serious or critical automated accessibility violations", async ({
  page,
}) => {
  await page.goto("/analysis/AAPL");
  await expect(
    page.getByRole("tab", { name: "Overview" }),
  ).toHaveAttribute("aria-selected", "true");

  const results = await new AxeBuilder({ page })
    .disableRules(["color-contrast"])
    .analyze();
  const seriousViolations = results.violations.filter(
    ({ impact }) =>
      impact === "serious" || impact === "critical",
  );

  expect(seriousViolations).toEqual([]);
});

test("keeps workspace navigation usable on a phone viewport", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "Mobile project only.");
  await page.goto("/analysis/AAPL");

  await page
    .getByRole("tab", { name: "Shariah" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "AAOIFI Shariah screening",
    }),
  ).toBeVisible();

  const viewportWidth = await page.evaluate(
    () => document.documentElement.clientWidth,
  );
  const bodyWidth = await page.evaluate(
    () => document.body.scrollWidth,
  );
  expect(bodyWidth).toBeLessThanOrEqual(
    viewportWidth + 1,
  );
});
