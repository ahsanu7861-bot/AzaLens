import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
} from "@playwright/test";

import {
  analysisData,
  mockHealthyAnalysis,
} from "./fixtures/analysis";

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
