import { expect, test } from "@playwright/test";

const themes = ["night", "day"] as const;

test.describe("@visual public methodology", () => {
  for (const theme of themes) {
    test(`${theme} methodology remains visually stable`, async ({ page }) => {
      const providerRequests: string[] = [];
      await page.addInitScript((selectedTheme) => {
        window.localStorage.setItem("azalens-theme", selectedTheme);
      }, theme);

      await page.route("**/*", async (route) => {
        const url = route.request().url();
        if (/\/api\/|finnhub|twelvedata|halalterminal/i.test(url)) {
          providerRequests.push(url);
          await route.abort();
          return;
        }
        await route.continue();
      });

      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/methodology");
      await expect(page.getByRole("heading", { name: "Methodology & Limitations" })).toBeVisible();
      await expect(page.getByText(/precise edition or revision is not exposed or verified/i)).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      expect(providerRequests).toEqual([]);
      await page.evaluate(async () => document.fonts.ready);

      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
      await expect(page).toHaveScreenshot(`methodology-page-${theme}.png`, {
        fullPage: true,
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: 0.005,
        threshold: 0.2,
      });
    });
  }
});
