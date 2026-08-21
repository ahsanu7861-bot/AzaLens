import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const themes = ["night", "day"] as const;

const FONT_HOSTS = ["https://fonts.googleapis.com/", "https://fonts.gstatic.com/"];
const PROVIDER_PATTERNS = [
  /\/api\//i,
  /finnhub/i,
  /twelvedata/i,
  /alphavantage/i,
  /yahoo/i,
  /yfinance/i,
];

async function makeProviderSafe(page: Page) {
  const blockedRequests: string[] = [];
  const providerRequests: string[] = [];

  await page.route("**/*", async (route) => {
    const url = route.request().url();

    if (PROVIDER_PATTERNS.some((pattern) => pattern.test(url))) {
      providerRequests.push(url);
      await route.abort();
      return;
    }

    const allowed =
      url.startsWith("http://127.0.0.1:") ||
      url.startsWith("http://localhost:") ||
      url.startsWith("data:") ||
      url.startsWith("blob:") ||
      FONT_HOSTS.some((host) => url.startsWith(host));

    if (!allowed) {
      blockedRequests.push(url);
      await route.abort();
      return;
    }

    await route.continue();
  });

  return { blockedRequests, providerRequests };
}

async function assertMethodologyContract(page: Page, theme?: string) {
  await expect(page).toHaveURL(/\/methodology$/);
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    theme ?? /^(day|night)$/,
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "Methodology & limitations" }),
  ).toBeVisible();
  await expect(page.getByText(/listed-company shares/i)).toBeVisible();
  await expect(page.getByText(/sole displayed Shariah methodology/i)).toBeVisible();
  await expect(page.getByText(/not empirically calibrated or validated/i)).toBeVisible();
  await expect(page.getByText(/not investment advice/i)).toBeVisible();

  await expect(page.getByRole("link", { name: "provider methodology" })).toHaveAttribute(
    "href",
    "https://www.halalterminal.com/methodology",
  );
  await expect(page.getByRole("link", { name: "official standards list" })).toHaveAttribute(
    "href",
    "https://aaoifi.com/shariah-standards-3/?lang=en",
  );

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflows, "the methodology page must not scroll horizontally").toBe(false);
}

test("methodology route is public, provider-safe and accessible", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const { blockedRequests, providerRequests } = await makeProviderSafe(page);
  await page.goto("/methodology");
  await assertMethodologyContract(page);

  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );

  expect(serious).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(providerRequests).toEqual([]);
  expect(blockedRequests).toEqual([]);
});

test.describe("@visual methodology page", () => {
  for (const theme of themes) {
    test(`${theme} theme remains visually stable`, async ({ page }) => {
      await page.addInitScript((selectedTheme) => {
        window.localStorage.setItem("azalens-theme", selectedTheme);
      }, theme);

      const { blockedRequests, providerRequests } = await makeProviderSafe(page);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/methodology");
      await assertMethodologyContract(page, theme);
      await page.evaluate(async () => document.fonts.ready);
      await page.evaluate(() => window.scrollTo(0, 0));

      expect(providerRequests).toEqual([]);
      expect(blockedRequests).toEqual([]);

      await expect.soft(page).toHaveScreenshot(`methodology-page-${theme}.png`, {
        fullPage: true,
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: 0.005,
        threshold: 0.2,
      });
    });
  }
});
