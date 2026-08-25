import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
} from "@playwright/test";

import {
  analysisData,
  historyResponse,
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
    ["Thesis", /What supports or challenges/i],
  ] as const;

  for (const [tab, heading] of expectations) {
    await page.getByRole("tab", { name: tab }).click();
    await expect(
      page.getByRole("tabpanel"),
    ).toContainText(heading);
  }
});

test("renders the source readings that support the Evidence Agreement", async ({
  page,
}) => {
  await page.goto("/analysis/AAPL");
  await page.getByRole("tab", { name: "Technical" }).click();

  const panel = page.getByRole("tabpanel");
  await expect(panel.getByText("58", { exact: true })).toBeVisible();
  await expect(panel.getByText("$212.40", { exact: true })).toBeVisible();
  await expect(panel.getByText("$207.80", { exact: true })).toBeVisible();
  await expect(panel.getByText("1.48", { exact: true })).toBeVisible();
  await expect(panel.getByText("$211.60", { exact: true })).toBeVisible();
  await expect(panel.getByText("12,450,000", { exact: true })).toBeVisible();
  await expect(
    panel.getByText("No decisive pattern", { exact: true }),
  ).toBeVisible();

  for (const label of [
    "RSI",
    "EMA 20",
    "SMA 50",
    "MACD",
    "Bollinger Bands",
    "On-Balance Volume",
    "Candlestick",
  ]) {
    await expect(panel).toContainText(label);
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
      // The application makes the initial request plus one configured
      // automatic retry. The explicit "Try again" action is attempt 3.
      if (attempts <= 2) {
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
    .analyze();
  const seriousViolations = results.violations.filter(
    ({ impact }) =>
      impact === "serious" || impact === "critical",
  );

  expect(seriousViolations).toEqual([]);
});

test("supports keyboard workspace navigation", async ({ page }) => {
  await page.goto("/analysis/AAPL");

  const overview = page.getByRole("tab", { name: "Overview" });
  await overview.focus();
  await page.keyboard.press("ArrowRight");

  const technical = page.getByRole("tab", { name: "Technical" });
  await expect(technical).toBeFocused();
  await expect(technical).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText(
    /Technical Evidence/i,
  );

  await page.keyboard.press("End");
  const thesis = page.getByRole("tab", { name: "Thesis" });
  await expect(thesis).toBeFocused();
  await expect(thesis).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("Home");
  await expect(overview).toBeFocused();
  await expect(overview).toHaveAttribute("aria-selected", "true");
});

test("traps dialog focus and restores the invoking control", async ({
  page,
}) => {
  await page.goto("/analysis/AAPL");

  const searchTrigger = page.getByRole("button", {
    name: /Search a company/i,
  });
  await searchTrigger.click();

  const dialog = page.getByRole("dialog", {
    name: "Search AzaLens",
  });
  await expect(dialog).toBeVisible();
  await expect(
    page.getByPlaceholder(/Search stocks by name/i),
  ).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(searchTrigger).toBeFocused();

  const proFeatureTrigger = page.getByRole("button", {
    name: /Choose a watchlist for/i,
  });
  await proFeatureTrigger.click();
  await expect(
    page.getByRole("dialog", {
      name: "Multi-watchlist workflows",
    }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", {
      name: "Multi-watchlist workflows",
    }),
  ).toHaveCount(0);
  await expect(proFeatureTrigger).toBeFocused();
});

test("provides a working skip link and reduced-motion behavior", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/analysis/AAPL");

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", {
    name: "Skip to main content",
  });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  const reducedMotion = await page.evaluate(
    () =>
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const animationDuration = await page
    .getByRole("tabpanel")
    .evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).animationDuration),
    );

  expect(reducedMotion).toBe(true);
  expect(animationDuration).toBeLessThanOrEqual(0.001);
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

/*
 * B7b. Provider attribution, asserted in a real browser rather than in jsdom.
 *
 * The unit suite proves the component's logic; these prove the shipped DOM: the
 * exact wording and target a provider requires, the crawl-directive contract a
 * dofollow link depends on, and the separation of the two credits. They live in
 * this journey spec rather than in visual.spec.ts because the second case needs
 * its own history route, and re-routing inside the visual spec would perturb the
 * captures that spec exists to keep stable.
 */
const TWELVE_DATA_TEXT = "Data provided by Twelve Data";
const TWELVE_DATA_HREF = "https://twelvedata.com";
const TRADINGVIEW_TEXT = "TradingView Lightweight Charts™";

test("credits the market-data provider the history response declared", async ({
  page,
}) => {
  await page.goto("/analysis/AAPL");

  const attribution = page.getByRole("link", { name: TWELVE_DATA_TEXT });
  await expect(attribution).toBeVisible();

  // Exact visible text - not a substring match, and no surrounding decoration.
  await expect(attribution).toHaveText(TWELVE_DATA_TEXT);

  // Exact target, with no trailing path, query or tracking parameter.
  await expect(attribution).toHaveAttribute("href", TWELVE_DATA_HREF);
  await expect(attribution).toHaveAttribute("target", "_blank");

  /*
   * The dofollow requirement is the ABSENCE of crawl directives. `noreferrer`
   * is a referrer and window-isolation hint, not a crawl directive, so it
   * satisfies the requirement while matching this repository's external-link
   * convention.
   */
  const rel = (await attribution.getAttribute("rel")) ?? "";
  const relTokens = rel.split(/\s+/).filter(Boolean);
  expect(relTokens).toContain("noreferrer");
  expect(relTokens).not.toContain("nofollow");
  expect(relTokens).not.toContain("ugc");
  expect(relTokens).not.toContain("sponsored");

  /*
   * Two providers, two anchors, two statements. Neither may be nested inside
   * the other, and neither statement may name the other's service - that is
   * what keeps "who supplied the data" distinct from "who supplied the chart".
   */
  const tradingView = page.getByRole("link", { name: TRADINGVIEW_TEXT });
  await expect(tradingView).toBeVisible();
  await expect(attribution).toHaveCount(1);
  await expect(tradingView).toHaveCount(1);

  const separate = await page.evaluate(
    ({ dataHref, chartText }) => {
      const dataLink = document.querySelector(`a[href="${dataHref}"]`);
      const chartLink = Array.from(document.querySelectorAll("a")).find(
        (anchor) => anchor.textContent?.includes(chartText),
      );

      if (!dataLink || !chartLink) return null;

      return {
        distinct: dataLink !== chartLink,
        nested:
          dataLink.contains(chartLink) || chartLink.contains(dataLink),
        dataText: dataLink.textContent ?? "",
        chartText: chartLink.textContent ?? "",
        shareAFooter:
          dataLink.closest("section") === chartLink.closest("section"),
      };
    },
    { dataHref: TWELVE_DATA_HREF, chartText: TRADINGVIEW_TEXT },
  );

  expect(separate).not.toBeNull();
  expect(separate?.distinct).toBe(true);
  expect(separate?.nested).toBe(false);
  expect(separate?.shareAFooter).toBe(true);
  expect(separate?.dataText).not.toMatch(/chart|TradingView/i);
  expect(separate?.chartText).not.toMatch(/Twelve Data|data provided/i);
});

test("credits no market-data provider when the response declares an unrecognized one", async ({
  page,
}) => {
  await page.unroute("**/history/AAPL**");
  await page.route("**/history/AAPL**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...historyResponse,
        provider: "Finnhub",
      }),
    });
  });

  await page.goto("/analysis/AAPL");

  // The chart still renders: bars are present and the library credit stands.
  await expect(page.locator("canvas").first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: TRADINGVIEW_TEXT }),
  ).toBeVisible();

  /*
   * ...and Twelve Data is not credited, because this response did not say
   * Twelve Data served it. Asserted on the phrase, the href and the wrapper, so
   * the check cannot pass merely because the anchor was restyled or renamed.
   */
  await expect(
    page.getByRole("link", { name: TWELVE_DATA_TEXT }),
  ).toHaveCount(0);
  await expect(page.locator(`a[href="${TWELVE_DATA_HREF}"]`)).toHaveCount(0);
  await expect(
    page.getByTestId("chart-provider-attribution"),
  ).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(TWELVE_DATA_TEXT);
});
